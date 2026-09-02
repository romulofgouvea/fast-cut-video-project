import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate DATA_DIR before importing modules that read it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-gc-"));
process.env.DATA_DIR = tmp;

const { SOURCES_DIR, OUTPUT_DIR, ensureDirs } = await import("./paths");
const { sweepData } = await import("./gc");

ensureDirs();
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function makeDir(root: string, name: string, ageDays: number, bytes = 1024) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "source.mp4"), Buffer.alloc(bytes));
  const when = Date.now() - ageDays * 86_400_000;
  fs.utimesSync(dir, new Date(when), new Date(when));
  fs.utimesSync(path.join(dir, "source.mp4"), new Date(when), new Date(when));
  return dir;
}

describe("sweepData", () => {
  it("removes items older than the TTL, keeps fresh ones", () => {
    const old = makeDir(SOURCES_DIR, "old-vid", 10);
    const fresh = makeDir(SOURCES_DIR, "fresh-vid", 1);

    const res = sweepData({ ttlMs: 7 * 86_400_000 });

    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(res.removed).toBe(1);
  });

  it("enforces a size cap, oldest first", () => {
    fs.rmSync(SOURCES_DIR, { recursive: true, force: true });
    fs.mkdirSync(SOURCES_DIR, { recursive: true });
    const a = makeDir(SOURCES_DIR, "a", 3, 1000);
    const b = makeDir(SOURCES_DIR, "b", 2, 1000);
    const c = makeDir(SOURCES_DIR, "c", 1, 1000);

    // cap below the 3-dir total: the two oldest (a, b) go.
    sweepData({ ttlMs: 0, maxBytes: 1500 });

    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(b)).toBe(false);
    expect(fs.existsSync(c)).toBe(true);
  });

  it("does nothing when both limits are off", () => {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const keep = makeDir(OUTPUT_DIR, "job1", 999);
    sweepData({ ttlMs: 0, maxBytes: 0 });
    expect(fs.existsSync(keep)).toBe(true);
  });
});
