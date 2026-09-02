import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-maint-"));
process.env.DATA_DIR = tmp;

const { OUTPUT_DIR, COMPILATIONS_DIR, ensureDirs } = await import("./paths");
const { findOrphans, purgeOrphans } = await import("./maintenance");

ensureDirs();
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function seedDir(root: string, name: string, bytes = 512) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "file.bin"), Buffer.alloc(bytes));
  return dir;
}

describe("findOrphans / purgeOrphans", () => {
  it("keeps referenced jobs/compilations and purges the rest", () => {
    const keep = seedDir(OUTPUT_DIR, "job-keep");
    const drop = seedDir(OUTPUT_DIR, "job-drop");
    const dropComp = seedDir(COMPILATIONS_DIR, "comp-drop");

    const kept = { jobs: ["job-keep"], compilations: [] as string[] };

    const found = findOrphans(kept);
    expect(found.jobs).toBe(1);
    expect(found.compilations).toBe(1);
    expect(found.bytes).toBeGreaterThan(0);
    expect(found.orphans.map((o) => o.id).sort()).toEqual(["comp-drop", "job-drop"]);

    const { removed } = purgeOrphans(kept);
    expect(removed).toBe(2);
    expect(fs.existsSync(keep)).toBe(true);
    expect(fs.existsSync(drop)).toBe(false);
    expect(fs.existsSync(dropComp)).toBe(false);
  });

  it("treats a missing jobs array as 'keep nothing new' — no filter, no orphans reported for counts", () => {
    seedDir(OUTPUT_DIR, "job-x");
    // With jobs undefined, keptFilter.active is false; findOrphans still lists it.
    const found = findOrphans({});
    expect(found.orphans.some((o) => o.id === "job-x")).toBe(true);
  });
});
