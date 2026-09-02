import fs from "node:fs";
import path from "node:path";

/**
 * Resolve an external binary, in priority order:
 *   1. explicit env override (e.g. YTDLP_PATH)
 *   2. a local ./bin/<name> next to the project (populated by scripts/fetch-binaries.mjs)
 *   3. the bare name, found on PATH (how the Docker image ships ffmpeg/yt-dlp)
 */
export const BIN_DIR = process.env.BIN_DIR
  ? path.resolve(process.env.BIN_DIR)
  : path.resolve(process.cwd(), "bin");

function fromBinDir(name: string): string | undefined {
  for (const candidate of [name, `${name}.exe`]) {
    const p = path.join(BIN_DIR, candidate);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

export function resolveBinary(name: string, envVar: string): string {
  return process.env[envVar] || fromBinDir(name) || name;
}
