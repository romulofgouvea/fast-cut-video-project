import fs from "node:fs";

const CANDIDATES = [
  process.env.FONT_PATH,
  // Debian/Ubuntu (the Docker image installs fonts-dejavu-core)
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  // Windows
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/arial.ttf",
  "C:/Windows/Fonts/segoeui.ttf",
  // macOS
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/Library/Fonts/Arial.ttf",
].filter(Boolean) as string[];

let cached: string | null | undefined;

/** A TrueType font for ffmpeg's `drawtext`, or null if none is found. */
export function resolveFont(): string | null {
  if (cached !== undefined) return cached;
  cached = CANDIDATES.find((p) => fs.existsSync(p)) ?? null;
  return cached;
}
