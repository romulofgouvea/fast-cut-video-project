// Downloads yt-dlp and ffmpeg into ./bin so `npm run dev` works without a
// system install. The Docker image installs its own binaries and never runs this.
//
//   node scripts/fetch-binaries.mjs [--force]
//
import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = path.resolve(import.meta.dirname, "..");
const BIN = path.join(ROOT, "bin");
const FORCE = process.argv.includes("--force");
const platform = os.platform();
const exe = platform === "win32" ? ".exe" : "";

const YTDLP_ASSET = {
  win32: "yt-dlp.exe",
  linux: "yt-dlp_linux",
  darwin: "yt-dlp_macos",
}[platform];

const FFMPEG_ZIP = {
  win32:
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip",
  darwin: null, // devs on macOS: `brew install ffmpeg`
  linux: null, // devs on Linux: `apt install ffmpeg` (Docker already has it)
}[platform];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  process.stdout.write(`  ${url}\n`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} para ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function unzip(zipPath, destDir) {
  if (platform === "win32") {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Force -LiteralPath '${zipPath}' -DestinationPath '${destDir}'`,
      ],
      { stdio: "inherit" },
    );
  } else {
    execFileSync("unzip", ["-o", zipPath, "-d", destDir], { stdio: "inherit" });
  }
}

async function fetchYtDlp() {
  const dest = path.join(BIN, `yt-dlp${exe}`);
  if (!FORCE && (await exists(dest))) return console.log("yt-dlp: já existe, pulando");
  if (!YTDLP_ASSET) return console.log(`yt-dlp: plataforma ${platform} não suportada pelo script`);
  console.log("yt-dlp:");
  await download(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}`, dest);
  if (platform !== "win32") await fs.chmod(dest, 0o755);
  console.log(`  -> ${dest}`);
}

async function fetchFfmpeg() {
  const ffmpeg = path.join(BIN, `ffmpeg${exe}`);
  const ffprobe = path.join(BIN, `ffprobe${exe}`);
  if (!FORCE && (await exists(ffmpeg)) && (await exists(ffprobe))) {
    return console.log("ffmpeg: já existe, pulando");
  }
  if (!FFMPEG_ZIP) {
    return console.log(
      `ffmpeg: instale pelo gerenciador de pacotes (ex.: brew/apt install ffmpeg)`,
    );
  }
  console.log("ffmpeg:");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ytc-ffmpeg-"));
  const zip = path.join(tmp, "ffmpeg.zip");
  await download(FFMPEG_ZIP, zip);
  await unzip(zip, tmp);
  const entries = await fs.readdir(tmp, { withFileTypes: true });
  const dir = entries.find((e) => e.isDirectory() && e.name.startsWith("ffmpeg"));
  if (!dir) throw new Error("estrutura inesperada no zip do ffmpeg");
  for (const name of [`ffmpeg${exe}`, `ffprobe${exe}`]) {
    await fs.copyFile(path.join(tmp, dir.name, "bin", name), path.join(BIN, name));
  }
  await fs.rm(tmp, { recursive: true, force: true });
  console.log(`  -> ${ffmpeg}\n  -> ${ffprobe}`);
}

await fs.mkdir(BIN, { recursive: true });
await fetchYtDlp();
await fetchFfmpeg();
console.log("Pronto.");
