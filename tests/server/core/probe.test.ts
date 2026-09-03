import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSpawnMock } from "@tests/support/fakeChild";

const mock = makeSpawnMock();
vi.mock("node:child_process", () => ({
  spawn: (...a: unknown[]) => mock.spawn(...(a as [string])),
}));

const { probeDuration, probeHasAudio } = await import("@server/core/probe");

beforeEach(() => {
  mock.calls.length = 0;
  mock.children.length = 0;
});
afterEach(() => vi.clearAllMocks());

/** Let the function attach its listeners, then drive the fake child. */
const drive = (fn: (c: (typeof mock.children)[number]) => void) =>
  Promise.resolve().then(() => fn(mock.last));

describe("probeDuration", () => {
  it("parses the numeric ffprobe output", async () => {
    const p = probeDuration("/v.mp4");
    await drive((c) => c.emitStdout("123.45\n").close(0));
    expect(await p).toBeCloseTo(123.45);
  });

  it("returns 0 on non-numeric output", async () => {
    const p = probeDuration("/v.mp4");
    await drive((c) => c.emitStdout("N/A").close(0));
    expect(await p).toBe(0);
  });

  it("returns 0 when ffprobe fails", async () => {
    const p = probeDuration("/v.mp4");
    await drive((c) => c.emitStderr("boom").close(1));
    expect(await p).toBe(0);
  });
});

describe("probeHasAudio", () => {
  it("is true when ffprobe lists an audio stream index", async () => {
    const p = probeHasAudio("/v.mp4");
    await drive((c) => c.emitStdout("0\n").close(0));
    expect(await p).toBe(true);
  });

  it("is false on empty output", async () => {
    const p = probeHasAudio("/v.mp4");
    await drive((c) => c.close(0));
    expect(await p).toBe(false);
  });

  it("is false when ffprobe errors", async () => {
    const p = probeHasAudio("/v.mp4");
    await drive((c) => c.error(new Error("spawn ENOENT")));
    expect(await p).toBe(false);
  });
});
