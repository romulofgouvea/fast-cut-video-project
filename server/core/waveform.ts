import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FFMPEG_BIN } from "./ffmpeg";

const SAMPLE_RATE = 8000;

/** Decode the input's audio to mono 16-bit PCM and buffer it. */
function decodePcm(input: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      FFMPEG_BIN,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        input,
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(SAMPLE_RATE),
        "-f",
        "s16le",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(stderr.trim() || `ffmpeg (peaks) saiu com código ${code}`));
    });
  });
}

/** Peak amplitude (0..1) per bucket — the shape drawn as the editor's waveform. */
export async function computePeaks(input: string, buckets: number): Promise<number[]> {
  const raw = await decodePcm(input);
  const samples = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2));
  if (samples.length === 0) return new Array(buckets).fill(0);

  const peaks = new Array<number>(buckets).fill(0);
  const per = samples.length / buckets;
  for (let b = 0; b < buckets; b += 1) {
    const start = Math.floor(b * per);
    const end = Math.min(samples.length, Math.floor((b + 1) * per));
    let max = 0;
    for (let i = start; i < end; i += 1) {
      const v = Math.abs(samples[i]);
      if (v > max) max = v;
    }
    peaks[b] = max / 32768;
  }
  // Normalize to the loudest bucket so quiet recordings still show a shape.
  const loudest = Math.max(0.02, ...peaks);
  return peaks.map((p) => Math.min(1, p / loudest));
}

/** `computePeaks`, cached next to the source file as `peaks-<n>.json`. */
export async function cachedPeaks(
  input: string,
  cacheDir: string,
  buckets: number,
): Promise<number[]> {
  const file = path.join(cacheDir, `peaks-${buckets}.json`);
  try {
    const cached = JSON.parse(fs.readFileSync(file, "utf8")) as number[];
    if (Array.isArray(cached) && cached.length === buckets) return cached;
  } catch {
    /* recompute */
  }
  const peaks = await computePeaks(input, buckets);
  try {
    fs.writeFileSync(file, JSON.stringify(peaks));
  } catch {
    /* non-fatal */
  }
  return peaks;
}
