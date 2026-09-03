import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-gc-more-"));
process.env.DATA_DIR = tmp;

const isSourceInFlight = vi.fn().mockReturnValue(false);
const isJobRunning = vi.fn().mockReturnValue(false);
vi.mock("@server/core/sourceCache", () => ({
  isSourceInFlight: (...a: unknown[]) => isSourceInFlight(...a),
}));
vi.mock("@server/core/jobControl", () => ({
  isJobRunning: (...a: unknown[]) => isJobRunning(...a),
}));
const getCompilation = vi.fn();
const forgetCompilation = vi.fn();
const forgetJob = vi.fn();
vi.mock("@server/core/compilationStore", () => ({
  getCompilation: (...a: unknown[]) => getCompilation(...a),
  forgetCompilation: (...a: unknown[]) => forgetCompilation(...a),
}));
vi.mock("@server/core/jobStore", () => ({ forgetJob: (...a: unknown[]) => forgetJob(...a) }));

const { SOURCES_DIR, OUTPUT_DIR, COMPILATIONS_DIR, ensureDirs } =
  await import("@server/core/paths");
const { sweepData, startDiskGc } = await import("@server/core/gc");

ensureDirs();
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const aged = (dir: string, name: string, days: number) => {
  const full = path.join(dir, name);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, "f.bin"), Buffer.alloc(100));
  const t = new Date(Date.now() - days * 86_400_000);
  fs.utimesSync(full, t, t);
  fs.utimesSync(path.join(full, "f.bin"), t, t);
  return full;
};

beforeEach(() => {
  vi.clearAllMocks();
  isSourceInFlight.mockReturnValue(false);
  isJobRunning.mockReturnValue(false);
  getCompilation.mockReturnValue(undefined);
  for (const d of [SOURCES_DIR, OUTPUT_DIR, COMPILATIONS_DIR]) {
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
  }
});

describe("sweepData locking", () => {
  it("never deletes a locked entry even past the TTL", () => {
    aged(SOURCES_DIR, "inflight", 30);
    isSourceInFlight.mockReturnValue(true);
    const res = sweepData({ ttlMs: 7 * 86_400_000 });
    expect(res.removed).toBe(0);
    expect(fs.existsSync(path.join(SOURCES_DIR, "inflight"))).toBe(true);
  });

  it("keeps a compilation dir while its run is still processing", () => {
    aged(COMPILATIONS_DIR, "running", 30);
    getCompilation.mockReturnValue({ phase: "processing" });
    expect(sweepData({ ttlMs: 1 }).removed).toBe(0);
  });

  it("forgets the in-memory job / compilation when it deletes their dir", () => {
    aged(OUTPUT_DIR, "job-old", 30);
    aged(COMPILATIONS_DIR, "comp-old", 30);
    sweepData({ ttlMs: 7 * 86_400_000 });
    expect(forgetJob).toHaveBeenCalledWith("job-old");
    expect(forgetCompilation).toHaveBeenCalledWith("comp-old");
  });

  it("skips a locked survivor during the size-cap pass", () => {
    aged(OUTPUT_DIR, "locked", 1);
    aged(OUTPUT_DIR, "free", 2);
    isJobRunning.mockImplementation((id: string) => id === "locked");
    sweepData({ ttlMs: 0, maxBytes: 50 });
    expect(fs.existsSync(path.join(OUTPUT_DIR, "locked"))).toBe(true);
    expect(fs.existsSync(path.join(OUTPUT_DIR, "free"))).toBe(false);
  });
});

describe("startDiskGc", () => {
  it("runs an immediate sweep and schedules the next one", () => {
    vi.useFakeTimers();
    const setInterval = vi.spyOn(globalThis, "setInterval");
    aged(SOURCES_DIR, "toclean", 999);
    startDiskGc();
    expect(fs.existsSync(path.join(SOURCES_DIR, "toclean"))).toBe(false); // immediate tick ran
    expect(setInterval).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
