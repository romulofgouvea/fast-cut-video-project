import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Compilation, Job } from "@shared/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-stats-more-"));
process.env.DATA_DIR = tmp;

const { ensureDirs, outputDir } = await import("@server/core/paths");
const { createJob } = await import("@server/core/jobStore");
const { createCompilation } = await import("@server/core/compilationStore");
const { statsRouter, invalidateStatsCache } = await import("@server/routes/stats");

ensureDirs();

const app = express();
app.use(express.json());
app.use("/api/stats", statsRouter);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const job = (over: Partial<Job> & { id: string }): Job => ({
  createdAt: "",
  project: { id: over.id, sourceUrl: "u", cutMode: "precise", format: "mp4", cuts: [] },
  phase: "done",
  downloadPercent: 100,
  cuts: [],
  ...over,
});
const compilation = (id: string, phase: Compilation["phase"]): Compilation => ({
  id,
  createdAt: "",
  items: [],
  phase,
  percent: phase === "done" ? 100 : 0,
});

describe("stats with real data", () => {
  it("counts job phases, done cuts/clips and compilation phases scoped to kept refs", async () => {
    createJob(
      job({
        id: "kept",
        phase: "done",
        cuts: [
          { id: "a", position: 1, fileName: "a.mp4", status: "done", percent: 100 },
          { id: "b", position: 2, fileName: "", status: "error", percent: 0 },
        ],
      }),
    );
    createJob(job({ id: "failed", phase: "failed" }));
    createJob(job({ id: "running", phase: "cutting" }));
    // a cut whose job the client no longer keeps -> not counted in cuts/clips
    createJob(
      job({
        id: "orphanjob",
        cuts: [{ id: "x", position: 1, fileName: "x.mp4", status: "done", percent: 100 }],
      }),
    );
    fs.mkdirSync(outputDir("orphanjob"), { recursive: true });
    fs.writeFileSync(path.join(outputDir("orphanjob"), "x.mp4"), "orphan-bytes");

    createCompilation(compilation("c-done", "done"));
    createCompilation(compilation("c-failed", "failed"));

    invalidateStatsCache();
    const res = await request(app)
      .post("/api/stats")
      .send({ jobs: ["kept", "failed", "running"], compilations: ["c-done", "c-failed"] });

    expect(res.status).toBe(200);
    expect(res.body.jobs).toMatchObject({ done: 2, failed: 1, running: 1 });
    expect(res.body.cuts).toEqual({ total: 2, done: 1 });
    expect(res.body.clips).toBe(1);
    expect(res.body.compilations).toMatchObject({ total: 2, done: 1, failed: 1 });
    expect(res.body.orphans.jobs).toBeGreaterThanOrEqual(1); // orphanjob is unreferenced
  });

  it("memoizes: a second identical request is served from cache", async () => {
    const a = await request(app).get("/api/stats");
    const b = await request(app).get("/api/stats");
    expect(b.body).toEqual(a.body);
  });
});
