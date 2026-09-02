// Fast Cut Video desktop shell.
//
// The real app is the same Node/Express server that ships in the Docker image.
// Here it runs as a bundled sidecar bound to 127.0.0.1; once it answers on
// /api/health we point the window at it. ffmpeg/ffprobe/yt-dlp and the built SPA
// travel as Tauri resources; project data is persisted to SQLite by the frontend
// (tauri-plugin-sql), everything else stays on disk under the app data dir.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Preferred loopback port; we scan upward from here for a free one.
/// capabilities/default.json allows the whole 127.0.0.1 range.
const BASE_PORT: u16 = 47823;
const PORT_TRIES: u16 = 40;

/// Holds the sidecar child so we can kill it on exit (None when we reuse an
/// already-running server, e.g. a dev leftover).
struct Sidecar(Mutex<Option<CommandChild>>);

/// One blocking GET /api/health; Some(true) only when the body says it's ours.
fn health_probe(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    if stream
        .write_all(b"GET /api/health HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut buf = String::new();
    let _ = stream.read_to_string(&mut buf);
    let ok_status = buf.starts_with("HTTP/1.") && buf.split_whitespace().nth(1) == Some("200");
    ok_status && buf.contains("\"ok\":true")
}

/// Reuse a server already on BASE_PORT (dev leftover); otherwise the first free
/// port in the range. Returns (port, needs_spawn).
fn resolve_port() -> (u16, bool) {
    if health_probe(BASE_PORT) {
        return (BASE_PORT, false);
    }
    for port in BASE_PORT..BASE_PORT + PORT_TRIES {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return (port, true);
        }
    }
    (BASE_PORT, true)
}

fn focus_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn spawn_server(app: &tauri::AppHandle, port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_local_data_dir()?.join("data");
    std::fs::create_dir_all(&data_dir)?;

    let resource_dir = app.path().resource_dir()?;
    let bin_dir = resource_dir.join("binaries").join("vendor");
    let public_dir = resource_dir.join("public");

    let (mut rx, child) = app
        .shell()
        .sidecar("fast-cut-video-server")?
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("NODE_ENV", "production")
        .env("DATA_DIR", data_dir.to_string_lossy().to_string())
        .env("BIN_DIR", bin_dir.to_string_lossy().to_string())
        .env("PUBLIC_DIR", public_dir.to_string_lossy().to_string())
        .spawn()?;

    app.state::<Sidecar>().0.lock().unwrap().replace(child);

    // Drain the sidecar's output so its pipe never stalls, and surface it in logs.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("[server] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[server] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[server] terminou: {payload:?}");
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main(app);
        }));
    }

    builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(Sidecar(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let (port, needs_spawn) = resolve_port();

            if needs_spawn {
                if let Err(err) = spawn_server(&handle, port) {
                    eprintln!("falha ao iniciar o servidor: {err}");
                }
            }

            // Wait for the server, then swap the splash for the real app.
            std::thread::spawn(move || {
                for _ in 0..250 {
                    if health_probe(port) {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(200));
                }
                if let Some(win) = handle.get_webview_window("main") {
                    if let Ok(url) = tauri::Url::parse(&format!("http://127.0.0.1:{port}")) {
                        let _ = win.navigate(url);
                    }
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o Fast Cut Video")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(child) = app.state::<Sidecar>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
