import { spawn } from "node:child_process";
import os from "node:os";
import type { CutMode, OutputFormat, WatermarkPosition } from "../../shared/types";
import { resolveBinary } from "./binaries";
import { createLimiter } from "./limiter";

export const FFMPEG_BIN = resolveBinary("ffmpeg", "FFMPEG_PATH");
export const FFPROBE_BIN = resolveBinary("ffprobe", "FFPROBE_PATH");

/**
 * Cap concurrent ffmpeg processes. Cuts inside one job already run sequentially;
 * this bounds the total across simultaneous jobs so N big encodes at once don't
 * lock up the machine. Default: half the cores (min 1). Override with `MAX_FFMPEG`.
 */
const MAX_FFMPEG = Math.max(
  1,
  Number(process.env.MAX_FFMPEG) || Math.ceil((os.cpus().length || 2) / 2),
);
const ffmpegGate = createLimiter(MAX_FFMPEG);

export function ffmpegLoad(): { active: number; pending: number; max: number } {
  return { active: ffmpegGate.active, pending: ffmpegGate.pending, max: MAX_FFMPEG };
}

/** Resolved watermark for `buildCutArgs` (the route turns an `imageId` into a path). */
export type WatermarkArgs = {
  text?: string;
  imagePath?: string;
  position: WatermarkPosition;
  opacity: number;
  scale?: number;
};

const MARGIN = 14;

/** drawtext x/y for a corner (uses the input `w/h` and text `tw/th`). */
function textXY(pos: WatermarkPosition): string {
  const top = `y=${MARGIN}`;
  const bot = `y=h-th-${MARGIN}`;
  const left = `x=${MARGIN}`;
  const right = `x=w-tw-${MARGIN}`;
  return pos === "top-left"
    ? `${left}:${top}`
    : pos === "top-right"
      ? `${right}:${top}`
      : pos === "bottom-left"
        ? `${left}:${bot}`
        : `${right}:${bot}`;
}

/** overlay x/y for a corner (main `W/H`, overlay `w/h`). */
function overlayXY(pos: WatermarkPosition): string {
  const top = `${MARGIN}`;
  const bot = `H-h-${MARGIN}`;
  const left = `${MARGIN}`;
  const right = `W-w-${MARGIN}`;
  return pos === "top-left"
    ? `${left}:${top}`
    : pos === "top-right"
      ? `${right}:${top}`
      : pos === "bottom-left"
        ? `${left}:${bot}`
        : `${right}:${bot}`;
}

/** ffmpeg-safe text: drop the characters that need escaping inside drawtext. */
export function sanitizeWatermarkText(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} .,!?@#&()\-+/*=°ºª]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Font for drawtext. With no spec, ffmpeg resolves a default via fontconfig
 * (present on the Docker image, which also installs fonts-dejavu-core). Override
 * the family with `FONT_NAME` if the host has fontconfig but an odd default.
 */
function fontArg(): string {
  const name = process.env.FONT_NAME?.trim();
  return name ? `font='${name.replace(/'/g, "")}':` : "";
}

/** The video filter for a text watermark, or "" when there's no usable text. */
function drawtextFilter(wm: WatermarkArgs): string {
  const text = wm.text ? sanitizeWatermarkText(wm.text) : "";
  if (!text) return "";
  const op = Math.min(1, Math.max(0, wm.opacity ?? 0.85));
  return (
    `drawtext=${fontArg()}text='${text}':${textXY(wm.position)}:` +
    `fontsize=h/20:fontcolor=white@${op}:box=1:boxcolor=black@${(op * 0.45).toFixed(2)}:boxborderw=10`
  );
}

/**
 * Build ffmpeg args for a single cut.
 * `-ss` before `-i` gives fast input seeking; `-t` (duration) is used instead of
 * `-to` so both modes behave consistently regardless of seek position.
 *
 * `format` picks the container (mp4 default; webm/gif/mp3). A watermark (text
 * and/or image) forces a re-encode even in "fast" mode.
 */
export function buildCutArgs(opts: {
  mode: CutMode;
  startSec: number;
  durationSec: number;
  input: string;
  output: string;
  format?: OutputFormat;
  watermark?: WatermarkArgs;
}): string[] {
  const { mode, startSec, durationSec, input, output } = opts;
  const format: OutputFormat = opts.format ?? "mp4";
  const wm = opts.watermark;
  const hasImage = Boolean(wm?.imagePath) && format !== "mp3";
  const textFilter = wm && format !== "mp3" ? drawtextFilter(wm) : "";
  const hasWatermark = hasImage || Boolean(textFilter);

  const head = ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(startSec), "-i", input];
  if (hasImage) head.push("-i", wm!.imagePath!);
  head.push("-t", String(durationSec));

  const tail = ["-progress", "pipe:1", "-nostats", output];

  // --- audio only ---
  if (format === "mp3") {
    return [...head, "-vn", "-c:a", "libmp3lame", "-q:a", "2", "-map", "0:a:0?", ...tail];
  }

  // --- build the video filtergraph ---
  const steps: string[] = [];
  let label = "0:v";
  if (hasImage) {
    const scale = Math.min(1, Math.max(0.02, wm!.scale ?? 0.16));
    const op = Math.min(1, Math.max(0, wm!.opacity ?? 0.85));
    steps.push(
      `[1:v]scale=iw*${scale}:-1,format=rgba,colorchannelmixer=aa=${op}[wm]`,
      `[${label}][wm]overlay=${overlayXY(wm!.position)}[v1]`,
    );
    label = "v1";
  }
  if (textFilter) {
    steps.push(`[${label}]${textFilter}[v2]`);
    label = "v2";
  }

  if (format === "gif") {
    // Palette pipeline for a clean GIF; no audio.
    steps.push(
      `[${label}]fps=12,scale=480:-1:flags=lanczos,split[s0][s1]`,
      `[s0]palettegen=stats_mode=diff[p]`,
      `[s1][p]paletteuse=dither=bayer[vout]`,
    );
    return [
      ...head,
      "-filter_complex",
      steps.join(";"),
      "-map",
      "[vout]",
      "-an",
      "-loop",
      "0",
      ...tail,
    ];
  }

  const videoCodec =
    format === "webm"
      ? ["-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1"]
      : ["-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p"];
  const audioCodec =
    format === "webm" ? ["-c:a", "libopus", "-b:a", "128k"] : ["-c:a", "aac", "-b:a", "128k"];

  // "fast" mp4 with no watermark: stream-copy video, realign audio.
  if (format === "mp4" && mode === "fast" && !hasWatermark) {
    return [
      ...head,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-af",
      "aresample=async=1:first_pts=0",
      "-movflags",
      "+faststart",
      ...tail,
    ];
  }

  const mapArgs = steps.length
    ? ["-filter_complex", steps.join(";"), "-map", `[${label}]`, "-map", "0:a:0?"]
    : [];
  const faststart = format === "mp4" ? ["-movflags", "+faststart"] : [];

  return [...head, ...mapArgs, ...videoCodec, ...audioCodec, ...faststart, ...tail];
}

/**
 * Run ffmpeg, reporting 0..100 progress via `onProgress` (derived from
 * `out_time_ms` on stdout vs `durationSec`). Rejects with ffmpeg's stderr on
 * a non-zero exit. Args must include `-progress pipe:1 -nostats`.
 */
export function runFfmpeg(
  args: string[],
  durationSec: number,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  // Don't take a slot if this call is already cancelled or gets cancelled while
  // waiting in the queue.
  return ffmpegGate.run(() => {
    if (signal?.aborted) return Promise.reject(new Error("Processamento cancelado."));
    return spawnFfmpeg(args, durationSec, onProgress, signal);
  });
}

function spawnFfmpeg(
  args: string[],
  durationSec: number,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Processamento cancelado."));
    const child = spawn(FFMPEG_BIN, args, { stdio: ["ignore", "pipe", "pipe"], signal });
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      for (const line of chunk.split("\n")) {
        const m = /^out_time_ms=(\d+)/.exec(line.trim());
        if (m && durationSec > 0) {
          const pct = Math.min(99, (Number(m[1]) / 1e6 / durationSec) * 100);
          onProgress(pct);
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => {
      stderr += c;
    });

    child.on("error", (err) =>
      reject(signal?.aborted ? new Error("Processamento cancelado.") : err),
    );
    child.on("close", (code) => {
      if (signal?.aborted) {
        reject(new Error("Processamento cancelado."));
      } else if (code === 0) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(stderr.trim() || `ffmpeg saiu com código ${code}`));
      }
    });
  });
}

/** Back-compat alias: run a single cut. */
export const runCut = runFfmpeg;
