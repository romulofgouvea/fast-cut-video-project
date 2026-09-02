import { runFfmpeg } from "./ffmpeg";

export type ConcatInput = {
  path: string;
  hasAudio: boolean;
  /** Duration in seconds — used to synthesize silence for clips with no audio. */
  durationSec: number;
};

const TARGET_W = 1920;
const TARGET_H = 1080;
const TARGET_FPS = 30;
const TARGET_SR = 48000;

/**
 * Build a single ffmpeg invocation that normalizes every input to a common
 * format (1920x1080 / 30fps / stereo 48kHz) and concatenates them into `output`.
 * Clips with no audio get a synthesized silent track so the concat filter stays
 * balanced.
 */
export function buildConcatArgs(inputs: ConcatInput[], output: string): string[] {
  if (inputs.length < 2) {
    throw new Error("A montagem precisa de pelo menos 2 clipes.");
  }

  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const clip of inputs) args.push("-i", clip.path);

  // Append one lavfi silence input per clip that lacks audio.
  const silenceIndexFor = new Map<number, number>();
  let nextInput = inputs.length;
  inputs.forEach((clip, i) => {
    if (!clip.hasAudio) {
      args.push(
        "-f",
        "lavfi",
        "-t",
        String(Math.max(0.1, clip.durationSec)),
        "-i",
        `anullsrc=channel_layout=stereo:sample_rate=${TARGET_SR}`,
      );
      silenceIndexFor.set(i, nextInput);
      nextInput += 1;
    }
  });

  const parts: string[] = [];
  const concatLabels: string[] = [];
  inputs.forEach((clip, i) => {
    parts.push(
      `[${i}:v]scale=${TARGET_W}:${TARGET_H}:force_original_aspect_ratio=decrease,` +
        `pad=${TARGET_W}:${TARGET_H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${TARGET_FPS},` +
        `format=yuv420p[v${i}]`,
    );
    const aSrc = clip.hasAudio ? `${i}:a` : `${silenceIndexFor.get(i)}:a`;
    parts.push(
      `[${aSrc}]aresample=async=1:osr=${TARGET_SR},` +
        `aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`,
    );
    concatLabels.push(`[v${i}][a${i}]`);
  });
  parts.push(`${concatLabels.join("")}concat=n=${inputs.length}:v=1:a=1[vout][aout]`);

  args.push(
    "-filter_complex",
    parts.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    output,
  );
  return args;
}

/** Run a concat, reporting 0..100 progress. */
export function runConcat(
  inputs: ConcatInput[],
  output: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const total = inputs.reduce((sum, c) => sum + Math.max(0, c.durationSec), 0);
  return runFfmpeg(buildConcatArgs(inputs, output), total, onProgress);
}
