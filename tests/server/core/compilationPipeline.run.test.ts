import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Compilation, Job } from "@shared/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-comprun-"));
process.env.DATA_DIR = tmp;

vi.mock("@server/core/probe", () => ({
  probeDuration: vi.fn().mockResolvedValue(10),
  probeHasAudio: vi.fn().mockResolvedValue(true),
}));
const runConcat = vi.fn().mockResolvedValue(undefined);
vi.mock("@server/core/compile", () => ({ runConcat: (...a: unknown[]) => runConcat(...a) }));

const { runCompilation } = await import("@server/core/compilationPipeline");
const { createJob } = await import("@server/core/jobStore");
const { createCompilation, getCompilation } = await import("@server/core/compilationStore");
const { outputDir, compilationFile, UPLOADS_DIR } = await import("@server/core/paths");

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => vi.clearAllMocks());

const seedCutJob = (id: string) => {
  const job: Job = {
    id,
    createdAt: "",
    project: { id, sourceUrl: "u", cutMode: "precise", format: "mp4", cuts: [] },
    phase: "done",
    downloadPercent: 100,
    cuts: [
      { id: "c1", position: 1, fileName: "a.mp4", status: "done", percent: 100 },
      { id: "c2", position: 2, fileName: "b.mp4", status: "done", percent: 100 },
    ],
  };
  createJob(job);
  fs.mkdirSync(outputDir(id), { recursive: true });
  fs.writeFileSync(path.join(outputDir(id), "a.mp4"), "a");
  fs.writeFileSync(path.join(outputDir(id), "b.mp4"), "b");
};

const comp = (id: string, over: Partial<Compilation> = {}): Compilation => ({
  id,
  createdAt: "2026-08-05T00:00:00.000Z",
  items: [
    { kind: "cut", jobId: "src", position: 1 },
    { kind: "cut", jobId: "src", position: 2 },
  ],
  phase: "processing",
  percent: 0,
  ...over,
});

describe("runCompilation", () => {
  it("concatenates the resolved clips and marks the run done with a file name", async () => {
    seedCutJob("src");
    const c = comp("done1");
    createCompilation(c);
    await runCompilation(c);

    const out = getCompilation("done1")!;
    expect(out.phase).toBe("done");
    expect(out.percent).toBe(100);
    expect(out.outputPath).toBe(compilationFile("done1"));
    expect(out.fileName).toMatch(/\.mp4$/);
    expect(runConcat).toHaveBeenCalledOnce();
  });

  it("reports progress from the concat callback", async () => {
    seedCutJob("src2");
    runConcat.mockImplementationOnce(
      (_inputs: unknown, _out: unknown, onProgress: (n: number) => void) => {
        onProgress(40);
        onProgress(40.4); // same rounded value -> ignored
        onProgress(80);
        return Promise.resolve();
      },
    );
    const c = comp("prog", {
      items: [
        { kind: "cut", jobId: "src2", position: 1 },
        { kind: "cut", jobId: "src2", position: 2 },
      ],
    });
    createCompilation(c);
    await runCompilation(c);
    expect(getCompilation("prog")!.phase).toBe("done");
  });

  it("fails the run when a referenced clip is gone", async () => {
    const c = comp("missing", {
      items: [
        { kind: "cut", jobId: "nope", position: 1 },
        { kind: "upload", uploadId: "ghost" },
      ],
    });
    createCompilation(c);
    await runCompilation(c);
    const out = getCompilation("missing")!;
    expect(out.phase).toBe("failed");
    expect(out.error).toMatch(/não está mais disponível|não está mais/i);
  });

  it("fails the run and records the error when concat throws", async () => {
    seedCutJob("src3");
    runConcat.mockRejectedValueOnce(new Error("ffmpeg concat boom"));
    const c = comp("boom", {
      items: [
        { kind: "cut", jobId: "src3", position: 1 },
        { kind: "cut", jobId: "src3", position: 2 },
      ],
    });
    createCompilation(c);
    await runCompilation(c);
    expect(getCompilation("boom")).toMatchObject({ phase: "failed", error: "ffmpeg concat boom" });
  });

  it("resolves an uploaded clip via findUpload", async () => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, "u1.mp4"), "x");
    seedCutJob("src4");
    const c = comp("mix", {
      items: [
        { kind: "upload", uploadId: "u1" },
        { kind: "cut", jobId: "src4", position: 1 },
      ],
    });
    createCompilation(c);
    await runCompilation(c);
    expect(getCompilation("mix")!.phase).toBe("done");
  });
});
