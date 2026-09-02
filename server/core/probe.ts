import { spawn } from "node:child_process";
import { FFPROBE_BIN } from "./ffmpeg";

function ffprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFPROBE_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `ffprobe saiu com código ${code}`));
    });
  });
}

/** Duration of a media file in seconds (0 when unknown). */
export async function probeDuration(file: string): Promise<number> {
  try {
    const out = await ffprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const n = Number.parseFloat(out);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Whether a media file carries at least one audio stream. */
export async function probeHasAudio(file: string): Promise<boolean> {
  try {
    const out = await ffprobe([
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=index",
      "-of",
      "csv=p=0",
      file,
    ]);
    return out.length > 0;
  } catch {
    return false;
  }
}
