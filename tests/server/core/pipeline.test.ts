import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Job } from "@shared/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-pipeline-"));
process.env.DATA_DIR = tmp;

const ensureSource = vi.fn();
vi.mock("@server/core/sourceCache", () => ({
  ensureSource: (...a: unknown[]) => ensureSource(...a),
  cachedSourcePath: () => path.join(tmp, "sources", "k", "source.mp4"),
}));

const runCut = vi.fn();
vi.mock("@server/core/ffmpeg", async (orig) => ({
  ...(await orig<typeof import("@server/core/ffmpeg")>()),
  runCut: (...a: unknown[]) => runCut(...a),
  runFfmpeg: (...a: unknown[]) => runCut(...a),
}));

const { runPipeline } = await import("@server/core/pipeline");
const { createJob, getJob } = await import("@server/core/jobStore");
const { outputDir } = await import("@server/core/paths");
const { cancelJob } = await import("@server/core/jobControl");

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

beforeEach(() => {
  vi.clearAllMocks();
  ensureSource.mockImplementation((_url: string, onProgress?: (n: number) => void) => {
    onProgress?.(50);
    onProgress?.(100);
    return Promise.resolve(path.join(tmp, "sources", "k", "source.mp4"));
  });
  runCut.mockResolvedValue(undefined);
});

const mkJob = (id: string, cuts = 2): Job => ({
  id,
  createdAt: "2026-08-05T00:00:00.000Z",
  project: {
    id,
    sourceUrl: "https://x.test/v",
    name: "Proj",
    cutMode: "precise",
    format: "mp4",
    cuts: Array.from({ length: cuts }, (_, i) => ({
      id: `c${i + 1}`,
      start: "00:00:00",
      end: "00:00:05",
    })),
  },
  phase: "downloading",
  downloadPercent: 0,
  cuts: Array.from({ length: cuts }, (_, i) => ({
    id: `c${i + 1}`,
    position: i + 1,
    fileName: "",
    status: "pending",
    percent: 0,
  })),
});

describe("runPipeline", () => {
  it("downloads once then cuts every clip and marks the job done", async () => {
    const job = mkJob("ok");
    createJob(job);
    await runPipeline(job);

    const done = getJob("ok")!;
    expect(done.phase).toBe("done");
    expect(done.downloadPercent).toBe(100);
    expect(done.cuts.every((c) => c.status === "done")).toBe(true);
    expect(runCut).toHaveBeenCalledTimes(2);
    expect(ensureSource).toHaveBeenCalledTimes(1);
  });

  it("keeps going when a single cut fails; the job still completes", async () => {
    runCut.mockRejectedValueOnce(new Error("bad frame"));
    const job = mkJob("partial");
    createJob(job);
    await runPipeline(job);

    const out = getJob("partial")!;
    expect(out.phase).toBe("done");
    expect(out.cuts[0]).toMatchObject({ status: "error", error: "bad frame" });
    expect(out.cuts[1].status).toBe("done");
  });

  it("fails the whole job when the source download fails", async () => {
    ensureSource.mockRejectedValueOnce(new Error("HTTP 403"));
    const job = mkJob("nodl");
    createJob(job);
    await runPipeline(job);

    expect(getJob("nodl")).toMatchObject({ phase: "failed", error: "HTTP 403" });
  });

  it("skips a cut that is already done and whose file is still on disk (resume)", async () => {
    const job = mkJob("resume");
    // pretend cut #1 succeeded on an earlier run
    const dir = outputDir("resume");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "done1.mp4"), "x");
    job.cuts[0] = { id: "c1", position: 1, fileName: "done1.mp4", status: "done", percent: 100 };
    createJob(job);

    await runPipeline(job);
    expect(runCut).toHaveBeenCalledTimes(1); // only cut #2
    expect(getJob("resume")!.phase).toBe("done");
  });

  it("cancellation stops the run and marks it cancelled", async () => {
    let release!: () => void;
    runCut.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const job = mkJob("cancel");
    createJob(job);
    const p = runPipeline(job);
    await vi.waitFor(() => expect(runCut).toHaveBeenCalled());
    cancelJob("cancel");
    release();
    await p;

    const out = getJob("cancel")!;
    expect(out.phase).toBe("failed");
    expect(out.error).toMatch(/cancelada/i);
    expect(out.cuts.some((c) => c.error === "Cancelado")).toBe(true);
  });
});
