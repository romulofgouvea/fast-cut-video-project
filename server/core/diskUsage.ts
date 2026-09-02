import fs from "node:fs";
import path from "node:path";
import { COMPILATIONS_DIR, OUTPUT_DIR, SOURCES_DIR, UPLOADS_DIR } from "./paths";

/** Recursive byte size of a directory tree. A missing/unreadable path counts as 0. */
export function dirSize(p: string): number {
  let total = 0;
  const stack = [p];
  while (stack.length) {
    const cur = stack.pop()!;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else {
        try {
          total += fs.statSync(full).size;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return total;
}

export type DiskUsage = {
  total: number;
  sources: number;
  output: number;
  uploads: number;
  compilations: number;
};

/** Byte size of each `data/` subtree plus their sum. */
export function diskUsage(): DiskUsage {
  const sources = dirSize(SOURCES_DIR);
  const output = dirSize(OUTPUT_DIR);
  const uploads = dirSize(UPLOADS_DIR);
  const compilations = dirSize(COMPILATIONS_DIR);
  return {
    total: sources + output + uploads + compilations,
    sources,
    output,
    uploads,
    compilations,
  };
}
