import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpawnMock } from "@tests/support/fakeChild";

const mock = makeSpawnMock();
vi.mock("node:child_process", () => ({
  spawn: (...a: unknown[]) => mock.spawn(...(a as [string])),
}));

const { runFfmpeg, runCut, ffmpegLoad } = await import("@server/core/ffmpeg");

beforeEach(() => {
  mock.calls.length = 0;
  mock.children.length = 0;
});

const tick = () => Promise.resolve();

describe("runFfmpeg", () => {
  it("resolves and reports 100% on a clean exit", async () => {
    const seen: number[] = [];
    const p = runFfmpeg(["-i", "a"], 10, (n) => seen.push(n));
    await tick();
    mock.last.emitStdout("out_time_ms=5000000\n"); // 5s of 10s -> 50%
    mock.last.close(0);
    await p;
    expect(seen).toContain(100);
    expect(seen.some((n) => n > 40 && n < 60)).toBe(true);
  });

  it("rejects with stderr on a non-zero exit", async () => {
    const p = runFfmpeg(["-i", "a"], 10, () => {});
    await tick();
    mock.last.emitStderr("Invalid data found");
    mock.last.close(1);
    await expect(p).rejects.toThrow("Invalid data found");
  });

  it("rejects immediately when the signal is already aborted (no spawn)", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(runFfmpeg(["-i", "a"], 10, () => {}, ac.signal)).rejects.toThrow(
      "Processamento cancelado.",
    );
    expect(mock.calls).toHaveLength(0);
  });

  it("rejects with the cancel message when aborted mid-run", async () => {
    const ac = new AbortController();
    const p = runFfmpeg(["-i", "a"], 10, () => {}, ac.signal);
    await tick();
    ac.abort();
    mock.last.close(1);
    await expect(p).rejects.toThrow("Processamento cancelado.");
  });

  it("runCut is the same function", () => {
    expect(runCut).toBe(runFfmpeg);
  });

  it("ffmpegLoad exposes the gate counters", () => {
    const load = ffmpegLoad();
    expect(load).toHaveProperty("active");
    expect(load).toHaveProperty("pending");
    expect(load.max).toBeGreaterThanOrEqual(1);
  });
});
