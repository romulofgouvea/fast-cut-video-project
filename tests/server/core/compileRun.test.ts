import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpawnMock } from "@tests/support/fakeChild";
import type { ConcatInput } from "@server/core/compile";

const mock = makeSpawnMock();
vi.mock("node:child_process", () => ({
  spawn: (...a: unknown[]) => mock.spawn(...(a as [string])),
}));

const { runConcat } = await import("@server/core/compile");

beforeEach(() => {
  mock.calls.length = 0;
  mock.children.length = 0;
});

const clip = (over: Partial<ConcatInput> = {}): ConcatInput => ({
  path: "/a.mp4",
  hasAudio: true,
  durationSec: 10,
  ...over,
});

describe("runConcat", () => {
  it("spawns ffmpeg once and totals the input durations for progress", async () => {
    const seen: number[] = [];
    const p = runConcat([clip(), clip({ path: "/b.mp4", durationSec: 30 })], "/out.mp4", (n) =>
      seen.push(n),
    );
    await Promise.resolve();
    expect(mock.calls).toHaveLength(1);
    // 20s of 40s total -> 50%
    mock.last.emitStdout("out_time_ms=20000000\n");
    mock.last.close(0);
    await p;
    expect(seen.some((n) => n > 45 && n < 55)).toBe(true);
    expect(seen).toContain(100);
  });

  it("propagates an ffmpeg failure", async () => {
    const p = runConcat([clip(), clip()], "/out.mp4", () => {});
    await Promise.resolve();
    mock.last.emitStderr("concat error");
    mock.last.close(1);
    await expect(p).rejects.toThrow("concat error");
  });
});
