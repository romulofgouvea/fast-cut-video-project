import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSpawnMock } from "@tests/support/fakeChild";

const mock = makeSpawnMock();
vi.mock("node:child_process", () => ({
  spawn: (...a: unknown[]) => mock.spawn(...(a as [string])),
}));

const { computePeaks, cachedPeaks } = await import("@server/core/waveform");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-wave-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => {
  mock.calls.length = 0;
  mock.children.length = 0;
});

/** 16-bit mono PCM: `samples` little-endian Int16 values as a Buffer. */
const pcm = (samples: number[]): Buffer => {
  const b = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => b.writeInt16LE(s, i * 2));
  return b;
};

describe("computePeaks", () => {
  it("returns a normalized peak per bucket (loudest bucket -> 1)", async () => {
    // 4 samples, 2 buckets: bucket 0 peak = 8192, bucket 1 peak = 32768
    const p = computePeaks("/in.mp4", 2);
    await Promise.resolve();
    mock.last.emitStdout(pcm([8192, -4096, 32000, -32768]));
    mock.last.close(0);
    const peaks = await p;
    expect(peaks).toHaveLength(2);
    expect(peaks[1]).toBeCloseTo(1, 5);
    expect(peaks[0]).toBeGreaterThan(0);
    expect(peaks[0]).toBeLessThan(peaks[1]);
  });

  it("returns all-zero buckets for empty audio", async () => {
    const p = computePeaks("/in.mp4", 3);
    await Promise.resolve();
    mock.last.close(0);
    expect(await p).toEqual([0, 0, 0]);
  });

  it("rejects when ffmpeg exits non-zero", async () => {
    const p = computePeaks("/in.mp4", 2);
    await Promise.resolve();
    mock.last.emitStderr("decode fail");
    mock.last.close(1);
    await expect(p).rejects.toThrow("decode fail");
  });
});

describe("cachedPeaks", () => {
  it("computes then caches to peaks-<n>.json", async () => {
    const p = cachedPeaks("/in.mp4", tmp, 2);
    await Promise.resolve();
    mock.last.emitStdout(pcm([100, 200, 300, 400]));
    mock.last.close(0);
    await p;
    expect(fs.existsSync(path.join(tmp, "peaks-2.json"))).toBe(true);
  });

  it("returns the cached array without spawning ffmpeg when it matches the bucket count", async () => {
    fs.writeFileSync(path.join(tmp, "peaks-5.json"), JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5]));
    const peaks = await cachedPeaks("/in.mp4", tmp, 5);
    expect(peaks).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(mock.calls).toHaveLength(0);
  });

  it("ignores a cache file with the wrong length and recomputes", async () => {
    fs.writeFileSync(path.join(tmp, "peaks-4.json"), JSON.stringify([1, 2]));
    const p = cachedPeaks("/in.mp4", tmp, 4);
    await Promise.resolve();
    mock.last.emitStdout(pcm([1, 2, 3, 4, 5, 6, 7, 8]));
    mock.last.close(0);
    expect(await p).toHaveLength(4);
  });
});
