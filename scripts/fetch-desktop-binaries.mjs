// Puts ffmpeg, ffprobe and yt-dlp for the HOST platform into
// src-tauri/binaries/vendor/ so Tauri bundles them as resources. The desktop
// sidecar finds them via BIN_DIR (server/core/binaries.ts).
//
// If ./bin is already populated (npm run setup, Windows dev), it just copies
// from there; otherwise it downloads static builds.
//
//   node scripts/fetch-desktop-binaries.mjs [--force]
import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = path.resolve(import.meta.dirname, "..");
const BIN = path.join(ROOT, "bin");
const VENDOR = path.join(ROOT, "src-tauri", "binaries", "vendor");
const FORCE = process.argv.includes("--force");
const platform = os.platform();
const exe = platform === "win32" ? ".exe" : "";

const YTDLP_ASSET = { win32: "yt-dlp.exe", linux: "yt-dlp_linux", darwin: "yt-dlp_macos" }[platform];

async function download(url, dest) {
  process.stdout.write(`  ↓ ${url}\n`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function mktmp() {
  return fs.mkdtemp(path.join(os.tmpdir(), "fcv-vendor-"));
}

/**
 * Copy from ./bin if present (Windows dev), else download a **static** build.
 * We never copy a system ffmpeg from PATH — those link against shared libs that
 * won't exist on the end user's machine.
 */
async function provide(name, fetchFn) {
  const out = path.join(VENDOR, `${name}${exe}`);
  if (!FORCE && existsSync(out)) return console.log(`${name}: já existe`);
  const local = path.join(BIN, `${name}${exe}`);
  if (existsSync(local)) {
    await fs.copyFile(local, out);
    console.log(`${name}: copiado de ./bin`);
  } else {
    await fetchFn(out);
    console.log(`${name}: baixado`);
  }
  if (platform !== "win32") await fs.chmod(out, 0o755);
}

async function fetchYtDlp(out) {
  if (!YTDLP_ASSET) throw new Error(`yt-dlp: plataforma ${platform} não suportada`);
  await download(
    `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}`,
    out,
  );
}

// The BtbN "master-latest" builds live on the release tagged literally `latest`
// — use /releases/download/latest/, not /releases/latest/download/ (which points
// at whatever release is newest by date and lacks the master-latest assets).
const BTBN = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest";

async function fetchFfmpegWin(which, out) {
  const tmp = await mktmp();
  const zip = path.join(tmp, "ffmpeg.zip");
  await download(`${BTBN}/ffmpeg-master-latest-win64-gpl.zip`, zip);
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${tmp}'`],
    { stdio: "inherit" },
  );
  const dir = (await fs.readdir(tmp, { withFileTypes: true })).find(
    (e) => e.isDirectory() && e.name.startsWith("ffmpeg"),
  );
  await fs.copyFile(path.join(tmp, dir.name, "bin", `${which}.exe`), out);
  await fs.rm(tmp, { recursive: true, force: true });
}

async function fetchFfmpegLinux(which, out) {
  // BtbN static builds — more reliable from CI than johnvansickle.com (which
  // blocks/times out from runner IPs).
  const arch = process.arch === "arm64" ? "linuxarm64" : "linux64";
  const tmp = await mktmp();
  const tar = path.join(tmp, "ffmpeg.tar.xz");
  await download(`${BTBN}/ffmpeg-master-latest-${arch}-gpl.tar.xz`, tar);
  execFileSync("tar", ["xf", tar, "-C", tmp], { stdio: "inherit" });
  const dir = (await fs.readdir(tmp, { withFileTypes: true })).find(
    (e) => e.isDirectory() && e.name.startsWith("ffmpeg"),
  );
  await fs.copyFile(path.join(tmp, dir.name, "bin", which), out);
  await fs.rm(tmp, { recursive: true, force: true });
}

async function fetchFfmpegMac(which, out) {
  // evermeet.cx ships separate x86_64 zips; arm64 Macs run them via Rosetta 2.
  const tmp = await mktmp();
  const zip = path.join(tmp, `${which}.zip`);
  await download(`https://evermeet.cx/ffmpeg/getrelease/${which}/zip`, zip);
  execFileSync("unzip", ["-o", zip, "-d", tmp], { stdio: "inherit" });
  await fs.copyFile(path.join(tmp, which), out);
  await fs.rm(tmp, { recursive: true, force: true });
}

const ffmpegFetch = { win32: fetchFfmpegWin, linux: fetchFfmpegLinux, darwin: fetchFfmpegMac }[
  platform
];
if (!ffmpegFetch) {
  console.error(`plataforma não suportada: ${platform}`);
  process.exit(1);
}

await fs.mkdir(VENDOR, { recursive: true });
await provide("ffmpeg", (out) => ffmpegFetch("ffmpeg", out));
await provide("ffprobe", (out) => ffmpegFetch("ffprobe", out));
await provide("yt-dlp", fetchYtDlp);
console.log(`\nPronto → ${path.relative(ROOT, VENDOR)}`);
