import fs from "node:fs";
import path from "node:path";
import { cutOutputName, resolveCollision } from "../../shared/filename";

/**
 * Pick a collision-free output file name for a cut, considering both files
 * already on disk and names reserved earlier in this run.
 *
 * Name is `<base>_<date>.mp4` where `base` is, in order of preference, the cut's
 * own name, the project name, or the video title.
 */
export function pickCutFileName(
  opts: { cutName?: string; projectName?: string; title?: string; date: string; ext?: string },
  dir: string,
  reserved: Set<string>,
): string {
  const base = opts.cutName?.trim() || opts.projectName?.trim() || opts.title?.trim() || undefined;
  const wanted = cutOutputName(base, opts.date, opts.ext);
  let existing: string[] = [];
  try {
    existing = fs.readdirSync(dir);
  } catch {
    /* dir may not exist yet */
  }
  const taken = new Set<string>([...existing, ...reserved]);
  const name = resolveCollision(wanted, taken);
  reserved.add(name);
  return name;
}

export function outputPath(dir: string, fileName: string): string {
  return path.join(dir, fileName);
}
