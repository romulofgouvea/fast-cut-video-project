import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeSpawnMock } from "@tests/support/fakeChild";

const mock = makeSpawnMock();
vi.mock("node:child_process", () => ({
  spawn: (...a: unknown[]) => mock.spawn(...(a as [string])),
}));

const { dumpInfo, download } = await import("@server/core/ytdlp");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-ytdlp-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => {
  mock.calls.length = 0;
  mock.children.length = 0;
});

const tick = () => Promise.resolve();

describe("dumpInfo", () => {
  it("maps yt-dlp JSON to a VideoInfo, with fallbacks", async () => {
    const p = dumpInfo("https://x.test/v");
    await tick();
    mock.last.emitStdout(
      JSON.stringify({ id: "vid1", title: "Hello", duration: 61.7, thumbnail: "t.jpg" }),
    );
    mock.last.close(0);
    expect(await p).toEqual({
      title: "Hello",
      duration: 62,
      thumbnail: "t.jpg",
      videoId: "vid1",
    });
  });

  it("defaults title to 'video' and duration to 0", async () => {
    const p = dumpInfo("https://x.test/v");
    await tick();
    mock.last.emitStdout("{}");
    mock.last.close(0);
    expect(await p).toMatchObject({ title: "video", duration: 0 });
  });

  it("retries once without --impersonate when the first call fails, then succeeds", async () => {
    const p = dumpInfo("https://x.test/v");
    await tick();
    // first attempt (with --impersonate) fails
    mock.last.emitStderr("ERROR: Some transient failure");
    mock.last.close(1);
    await tick();
    // retry (plain) succeeds
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls[0].args).toContain("--impersonate");
    expect(mock.calls[1].args).not.toContain("--impersonate");
    mock.last.emitStdout(JSON.stringify({ title: "ok", duration: 1 }));
    mock.last.close(0);
    expect(await p).toMatchObject({ title: "ok" });
  });

  it("surfaces a cleaned ERROR: line when both attempts fail", async () => {
    const p = dumpInfo("https://x.test/v");
    await tick();
    mock.last.emitStderr("ERROR: video unavailable\n");
    mock.last.close(1);
    await tick();
    mock.last.emitStderr("ERROR: video unavailable\n");
    mock.last.close(1);
    await expect(p).rejects.toThrow("video unavailable");
  });
});

describe("download", () => {
  it("promotes the staged file to the destination and reports progress", async () => {
    const dest = path.join(tmp, "job1", "source.mp4");
    const seen: number[] = [];
    const p = download("https://x.test/v", dest, (n) => seen.push(n));
    await tick();
    mock.last.emitStdout("download:  42.0%\n");
    // yt-dlp writes the staging file; the module renames it on a clean exit
    fs.writeFileSync(path.join(path.dirname(dest), "source.download.mp4"), "video-bytes");
    mock.last.close(0);
    await p;
    expect(fs.readFileSync(dest, "utf8")).toBe("video-bytes");
    expect(seen).toContain(42);
    expect(seen).toContain(100);
  });

  it("rejects with a cleaned error and leaves no staging file", async () => {
    const dest = path.join(tmp, "job2", "source.mp4");
    const p = download("https://x.test/v", dest, () => {});
    await tick();
    mock.last.emitStderr("ERROR: Requested format is not available\n");
    mock.last.close(1);
    await tick();
    // second attempt (plain, no --impersonate) also fails
    mock.last.emitStderr("ERROR: Requested format is not available\n");
    mock.last.close(1);
    await expect(p).rejects.toThrow("Requested format is not available");
    expect(fs.existsSync(path.join(tmp, "job2", "source.download.mp4"))).toBe(false);
  });
});
