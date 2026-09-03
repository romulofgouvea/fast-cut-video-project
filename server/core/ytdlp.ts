import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { VideoInfo } from "../../shared/types";
import { resolveBinary } from "./binaries";

export const YTDLP_BIN = resolveBinary("yt-dlp", "YTDLP_PATH");
const FFMPEG_BIN = resolveBinary("ffmpeg", "FFMPEG_PATH");

/**
 * `--impersonate` makes yt-dlp use a real browser TLS/HTTP fingerprint (via the
 * curl_cffi bundled in the official binaries); without it some sites — Rumble
 * notably — reject the metadata request with HTTP 403. Set `YTDLP_IMPERSONATE=""`
 * to disable, or to another target (e.g. `safari`) if a site needs it.
 *
 * If the binary turns out not to support impersonation we drop it after the
 * first failure so downloads keep working for every other site.
 */
const IMPERSONATE = process.env.YTDLP_IMPERSONATE ?? "chrome";
let impersonateArgs = IMPERSONATE ? ["--impersonate", IMPERSONATE] : [];

/**
 * Some sites (Instagram, private/age-gated content) only serve the media to a
 * logged-in session. Point yt-dlp at a cookie source:
 *   YTDLP_COOKIES=/path/to/cookies.txt        (Netscape cookie file)
 *   YTDLP_COOKIES_FROM_BROWSER=firefox         (or chrome, edge, brave, …[:profile])
 * Both unset → no cookies (default); the extractor error tells the user to set one.
 */
function cookieArgs(): string[] {
  if (process.env.YTDLP_COOKIES) return ["--cookies", process.env.YTDLP_COOKIES];
  if (process.env.YTDLP_COOKIES_FROM_BROWSER) {
    return ["--cookies-from-browser", process.env.YTDLP_COOKIES_FROM_BROWSER];
  }
  return [];
}

function impersonateUnsupported(stderr: string): boolean {
  return (
    impersonateArgs.length > 0 &&
    /impersonate target|curl_cffi|impersonation is not supported/i.test(stderr)
  );
}

function run(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(cleanYtdlpError(stderr) || `yt-dlp saiu com código ${code}`));
    });
  });
}

/**
 * Run yt-dlp with the impersonation args. `--impersonate` fixes some sites
 * (Rumble 403) but flakes on others (Instagram sometimes fails the impersonated
 * TLS handshake with "Failed to fetch"), so on *any* failure while it is active
 * we retry the call once plain. A genuine "not supported" also drops it for good.
 */
async function runWithImpersonate(rest: string[]): Promise<{ stdout: string; stderr: string }> {
  if (impersonateArgs.length === 0) return run(rest);
  try {
    return await run([...impersonateArgs, ...rest]);
  } catch (err) {
    if (impersonateUnsupported(String(err))) {
      console.warn("yt-dlp: --impersonate não suportado por este binário, seguindo sem ele");
      impersonateArgs = [];
    } else {
      console.warn("yt-dlp: --impersonate falhou nesta chamada, tentando sem ele");
    }
    return run(rest);
  }
}

function cleanYtdlpError(stderr: string): string {
  const line = stderr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .find((l) => l.startsWith("ERROR:"));
  return line ? line.replace(/^ERROR:\s*/, "") : "";
}

/** Fetch title/duration/thumbnail for a single video. */
export async function dumpInfo(url: string): Promise<VideoInfo> {
  const { stdout } = await runWithImpersonate([
    ...cookieArgs(),
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    url,
  ]);
  const data = JSON.parse(stdout) as {
    id?: string;
    title?: string;
    duration?: number;
    thumbnail?: string;
  };
  return {
    title: data.title || "video",
    duration: Math.round(data.duration || 0),
    thumbnail: data.thumbnail,
    videoId: data.id,
  };
}

/**
 * Download the video once into `destFile` (an .mp4 path).
 * Reports 0..100 download progress via `onProgress`.
 */
export async function download(
  url: string,
  destFile: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  // Download to a staging path and only promote it on success, so an interrupted
  // run never leaves a truncated "source.mp4" that a later run would reuse.
  const dir = path.dirname(destFile);
  const stagingBase = "source.download";
  const staging = path.join(dir, `${stagingBase}.mp4`);
  const cleanStaging = () => {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(stagingBase)) fs.rmSync(path.join(dir, f), { force: true });
      }
    } catch {
      /* ignore */
    }
  };

  const findStaged = (): string | undefined => {
    try {
      const f = fs.readdirSync(dir).find((n) => n.startsWith(stagingBase));
      return f ? path.join(dir, f) : undefined;
    } catch {
      return undefined;
    }
  };
  // Cap the source resolution to keep the cached file small — 1080p is plenty for
  // clipping and 4K/1440p downloads waste a lot of disk. Prefer H.264/mp4 so the
  // "fast" (stream-copy) cut mode stays mp4-compatible. Override with SOURCE_MAX_HEIGHT.
  const maxH = Number(process.env.SOURCE_MAX_HEIGHT) || 1080;
  const format =
    `bv*[height<=${maxH}][ext=mp4]+ba[ext=m4a]/` +
    `b[height<=${maxH}][ext=mp4]/` +
    `bv*[height<=${maxH}]+ba/b[height<=${maxH}]/b`;

  const attempt = (extraArgs: string[]): Promise<void> => {
    cleanStaging();
    const args = [
      ...extraArgs,
      ...cookieArgs(),
      "-f",
      format,
      "--merge-output-format",
      "mp4",
      "--remux-video",
      "mp4",
      "--no-playlist",
      // Move the moov atom to the front of the mp4 so the in-editor <video>
      // preview can show metadata / seek immediately instead of waiting for the
      // whole (often large) file to arrive.
      "--postprocessor-args",
      "ffmpeg:-movflags +faststart",
      "--newline",
      "--progress-template",
      "download:%(progress._percent_str)s",
      // Point yt-dlp at our ffmpeg when it isn't just the bare name on PATH.
      ...(FFMPEG_BIN !== "ffmpeg" ? ["--ffmpeg-location", FFMPEG_BIN] : []),
      "-o",
      staging,
      url,
    ];

    return new Promise((resolve, reject) => {
      const child = spawn(YTDLP_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        for (const raw of chunk.split("\n")) {
          const m = /download:\s*([\d.]+)%/.exec(raw);
          if (m) onProgress(Math.min(100, Number(m[1])));
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (c: string) => (stderr += c));
      child.on("error", reject);
      child.on("close", (code) => {
        const staged = findStaged();
        if (code === 0 && staged) {
          fs.renameSync(staged, destFile);
          cleanStaging();
          onProgress(100);
          resolve();
        } else {
          cleanStaging();
          const msg = cleanYtdlpError(stderr) || `Falha ao baixar (código ${code})`;
          reject(Object.assign(new Error(msg), { stderr }));
        }
      });
    });
  };

  try {
    await attempt(impersonateArgs);
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    // Same fallback as runWithImpersonate: any failure with --impersonate on gets
    // one plain retry (and a genuine "unsupported" drops it for the process).
    if (impersonateArgs.length > 0) {
      if (impersonateUnsupported(stderr)) {
        console.warn("yt-dlp: --impersonate não suportado por este binário, seguindo sem ele");
        impersonateArgs = [];
      } else {
        console.warn("yt-dlp: download com --impersonate falhou, tentando sem ele");
      }
      await attempt([]);
      return;
    }
    throw err;
  }
}
