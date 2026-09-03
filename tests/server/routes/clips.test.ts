import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Job } from "@shared/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-clips-"));
process.env.DATA_DIR = tmp;

const { createJob } = await import("@server/core/jobStore");
const { clipsRouter } = await import("@server/routes/clips");

const app = express();
app.use("/api/clips", clipsRouter);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const job = (over: Partial<Job> & { id: string }): Job => ({
  createdAt: new Date().toISOString(),
  project: { id: over.id, sourceUrl: "u", cutMode: "precise", format: "mp4", cuts: [] },
  phase: "done",
  downloadPercent: 100,
  cuts: [],
  ...over,
});

describe("GET /api/clips", () => {
  it("lists only done cuts, deriving name + projectName", async () => {
    createJob(
      job({
        id: "j1",
        project: {
          id: "j1",
          sourceUrl: "u",
          name: "My Project",
          cutMode: "precise",
          format: "mp4",
          cuts: [{ id: "c1", start: "00:00:00", end: "00:00:10", name: "Nice Cut" }],
        },
        cuts: [
          { id: "c1", position: 1, fileName: "Nice-Cut-2026.mp4", status: "done", percent: 100 },
          { id: "c2", position: 2, fileName: "x.mp4", status: "processing", percent: 10 },
        ],
      }),
    );

    const res = await request(app).get("/api/clips");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      jobId: "j1",
      position: 1,
      name: "Nice Cut",
      projectName: "My Project",
    });
  });

  it("falls back to the file stem and 'Sem título' when names are missing", async () => {
    createJob(
      job({
        id: "j2",
        cuts: [{ id: "c1", position: 1, fileName: "clip-2026.mp4", status: "done", percent: 100 }],
      }),
    );
    const res = await request(app).get("/api/clips");
    const clip = res.body.find((c: { jobId: string }) => c.jobId === "j2");
    expect(clip).toMatchObject({ name: "clip-2026", projectName: "Sem título" });
  });
});
