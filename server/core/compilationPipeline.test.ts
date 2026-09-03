import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Compilation, Job } from "../../shared/types";

// Isolate DATA_DIR before importing modules that read it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-test-"));
process.env.DATA_DIR = tmp;

const { createJob } = await import("./jobStore");
const { compilationBaseName } = await import("./compilationPipeline");

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const job = (id: string, projectName?: string, title?: string): Job => ({
  id,
  createdAt: new Date().toISOString(),
  project: {
    id,
    sourceUrl: "https://example.com/v",
    name: projectName,
    title,
    cutMode: "precise",
    format: "mp4",
    cuts: [],
  },
  phase: "done",
  downloadPercent: 100,
  cuts: [],
});

const comp = (over: Partial<Compilation>): Compilation => ({
  id: "c",
  createdAt: new Date().toISOString(),
  items: [],
  phase: "done",
  percent: 100,
  ...over,
});

describe("compilationBaseName", () => {
  createJob(job("J-name", "Lofi Beats"));
  createJob(job("J-title", undefined, "Raw Title"));
  createJob(job("J-other", "Other Project"));

  it("prefers the explicit compilation name", () => {
    expect(compilationBaseName(comp({ name: "  My Montage " }))).toBe("My Montage");
  });

  it("borrows the source name when every cut is from one project", () => {
    expect(
      compilationBaseName(
        comp({
          items: [
            { kind: "cut", jobId: "J-name", position: 1 },
            { kind: "cut", jobId: "J-name", position: 2 },
          ],
        }),
      ),
    ).toBe("Lofi Beats");
  });

  it("falls back to the project title when it has no user name", () => {
    expect(
      compilationBaseName(comp({ items: [{ kind: "cut", jobId: "J-title", position: 1 }] })),
    ).toBe("Raw Title");
  });

  it("is 'montagem' when cuts span different projects", () => {
    expect(
      compilationBaseName(
        comp({
          items: [
            { kind: "cut", jobId: "J-name", position: 1 },
            { kind: "cut", jobId: "J-other", position: 1 },
          ],
        }),
      ),
    ).toBe("montagem");
  });

  it("is 'montagem' when there is nothing to go on", () => {
    expect(compilationBaseName(comp({ items: [{ kind: "upload", uploadId: "U" }] }))).toBe(
      "montagem",
    );
  });
});
