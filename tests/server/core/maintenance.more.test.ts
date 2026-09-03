import { afterAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Job } from "@shared/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-maint-more-"));
process.env.DATA_DIR = tmp;

const { SOURCES_DIR, OUTPUT_DIR, UPLOADS_DIR, COMPILATIONS_DIR, ensureDirs } =
  await import("@server/core/paths");
const { findOrphans, purgeOrphans, keptFilter } = await import("@server/core/maintenance");
const { createJob, getJob } = await import("@server/core/jobStore");
const { createCompilation, getCompilation } = await import("@server/core/compilationStore");
const { sourceKey } = await import("@server/core/sourceCache");

ensureDirs();
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const seed = (root: string, name: string, bytes = 64) => {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "f.bin"), Buffer.alloc(bytes));
  return dir;
};

const stubJob = (id: string): Job => ({
  id,
  createdAt: "",
  project: { id, sourceUrl: "u", cutMode: "precise", format: "mp4", cuts: [] },
  phase: "done",
  downloadPercent: 100,
  cuts: [],
});

beforeEach(() => {
  for (const d of [SOURCES_DIR, OUTPUT_DIR, UPLOADS_DIR, COMPILATIONS_DIR]) {
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
  }
});

describe("isKept coverage", () => {
  it("keeps a source referenced by URL and an upload referenced via local: source URL", () => {
    const url = "https://vimeo.com/424242";
    seed(SOURCES_DIR, sourceKey(url));
    seed(SOURCES_DIR, "upload-U1"); // an in-place uploaded source dir
    seed(UPLOADS_DIR, "U1");

    const found = findOrphans({ sourceUrls: [url, "local:U1"], jobs: [], compilations: [] });
    const ids = found.orphans.map((o) => o.id);
    expect(ids).not.toContain(sourceKey(url));
    expect(ids).not.toContain("upload-U1");
    expect(ids).not.toContain("U1");
  });
});

describe("keptFilter", () => {
  it("is inactive without a jobs array and active with one", () => {
    expect(keptFilter({}).active).toBe(false);
    const f = keptFilter({ jobs: ["a"], compilations: ["c"] });
    expect(f.active).toBe(true);
    expect(f.keepsJob("a")).toBe(true);
    expect(f.keepsCompilation("c")).toBe(true);
  });
});

describe("purgeOrphans in-memory cleanup", () => {
  it("forgets unreferenced in-memory jobs / compilations even with no dir on disk", () => {
    createJob(stubJob("mem-job"));
    createCompilation({
      id: "mem-comp",
      createdAt: "",
      items: [],
      phase: "done",
      percent: 100,
    });

    purgeOrphans({ jobs: [], compilations: [] });

    expect(getJob("mem-job")).toBeUndefined();
    expect(getCompilation("mem-comp")).toBeUndefined();
  });

  it("removes orphan dirs on disk and reports bytes freed", () => {
    seed(OUTPUT_DIR, "drop-job", 128);
    const { removed, freed } = purgeOrphans({ jobs: [], compilations: [] });
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(freed).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(OUTPUT_DIR, "drop-job"))).toBe(false);
  });
});
