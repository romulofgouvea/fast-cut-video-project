import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Job } from "@shared/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-jobs-more-"));
process.env.DATA_DIR = tmp;

const runPipeline = vi.fn().mockResolvedValue(undefined);
vi.mock("@server/core/pipeline", () => ({ runPipeline: (...a: unknown[]) => runPipeline(...a) }));

const { jobsRouter } = await import("@server/routes/jobs");
const { createJob, getJob } = await import("@server/core/jobStore");
const { outputDir } = await import("@server/core/paths");

const app = express();
app.use(express.json());
app.use("/api/jobs", jobsRouter);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => vi.clearAllMocks());

const mkJob = (over: Partial<Job> & { id: string }): Job => ({
  createdAt: "2026-08-05T00:00:00.000Z",
  project: {
    id: over.id,
    sourceUrl: "https://x.test/v",
    cutMode: "precise",
    format: "mp4",
    cuts: [],
  },
  phase: "done",
  downloadPercent: 100,
  cuts: [],
  ...over,
});

const withDoneCut = (id: string, fileName = "clip.mp4") => {
  const job = mkJob({
    id,
    cuts: [{ id: "c1", position: 1, fileName, status: "done", percent: 100 }],
  });
  createJob(job);
  const dir = outputDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), "cut-bytes");
  return job;
};

describe("POST /api/jobs", () => {
  const project = {
    id: "created",
    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    cutMode: "precise" as const,
    duration: 600,
    cuts: [{ id: "c1", start: "00:00:10", end: "00:00:20" }],
  };

  it("creates the job and starts the pipeline", async () => {
    const res = await request(app).post("/api/jobs").send({ project });
    expect(res.status).toBe(201);
    expect(res.body.jobId).toBe("created");
    expect(runPipeline).toHaveBeenCalledOnce();
  });

  it("422s an unsupported source URL", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .send({ project: { ...project, id: "x", sourceUrl: "ftp://nope" } });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/jobs", () => {
  it("lists jobs", async () => {
    createJob(mkJob({ id: "listed" }));
    const res = await request(app).get("/api/jobs");
    expect(res.status).toBe(200);
    expect(res.body.some((j: Job) => j.id === "listed")).toBe(true);
  });
});

describe("GET /api/jobs/:id/files & /preview", () => {
  it("downloads a finished cut and 404s a missing one", async () => {
    withDoneCut("dljob");
    const ok = await request(app).get("/api/jobs/dljob/files/1");
    expect(ok.status).toBe(200);
    expect(ok.headers["content-disposition"]).toContain("clip.mp4");

    const miss = await request(app).get("/api/jobs/dljob/files/2");
    expect(miss.status).toBe(404);
  });

  it("previews a finished cut inline", async () => {
    withDoneCut("pvjob");
    const res = await request(app).get("/api/jobs/pvjob/preview/1");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/jobs/:id/cancel", () => {
  it("404s unknown, 409s a finished job, marks a running one failed", async () => {
    expect((await request(app).post("/api/jobs/ghost/cancel")).status).toBe(404);

    createJob(mkJob({ id: "finished", phase: "done" }));
    expect((await request(app).post("/api/jobs/finished/cancel")).status).toBe(409);

    createJob(
      mkJob({
        id: "running",
        phase: "cutting",
        cuts: [{ id: "c1", position: 1, fileName: "", status: "processing", percent: 20 }],
      }),
    );
    const res = await request(app).post("/api/jobs/running/cancel");
    expect(res.status).toBe(200);
    expect(res.body.phase).toBe("failed");
    expect(res.body.cuts[0].error).toBe("Cancelado");
  });
});

describe("POST /api/jobs/:id/retry", () => {
  it("resumes only the not-done cuts", async () => {
    createJob(
      mkJob({
        id: "retryme",
        phase: "failed",
        cuts: [
          { id: "c1", position: 1, fileName: "a.mp4", status: "done", percent: 100 },
          { id: "c2", position: 2, fileName: "", status: "error", percent: 0, error: "x" },
        ],
      }),
    );
    const res = await request(app).post("/api/jobs/retryme/retry");
    expect(res.status).toBe(200);
    expect(res.body.phase).toBe("downloading");
    expect(res.body.cuts[0].status).toBe("done");
    expect(res.body.cuts[1].status).toBe("pending");
    expect(runPipeline).toHaveBeenCalledOnce();
  });

  it("409s when the job is still processing or already complete", async () => {
    createJob(mkJob({ id: "busy", phase: "cutting" }));
    expect((await request(app).post("/api/jobs/busy/retry")).status).toBe(409);

    createJob(
      mkJob({
        id: "alldone",
        phase: "done",
        cuts: [{ id: "c1", position: 1, fileName: "a.mp4", status: "done", percent: 100 }],
      }),
    );
    expect((await request(app).post("/api/jobs/alldone/retry")).status).toBe(409);
  });
});

describe("DELETE /api/jobs/:id/cuts/:position", () => {
  it("removes the cut and its file", async () => {
    withDoneCut("delcut");
    const res = await request(app).delete("/api/jobs/delcut/cuts/1");
    expect(res.status).toBe(200);
    expect(res.body.cuts).toHaveLength(0);
    expect(fs.existsSync(path.join(outputDir("delcut"), "clip.mp4"))).toBe(false);
  });

  it("404s an unknown job or cut", async () => {
    expect((await request(app).delete("/api/jobs/ghost/cuts/1")).status).toBe(404);
    createJob(mkJob({ id: "nocut" }));
    expect((await request(app).delete("/api/jobs/nocut/cuts/9")).status).toBe(404);
  });
});

describe("DELETE /api/jobs/:id", () => {
  it("forgets the job and deletes its output dir", async () => {
    withDoneCut("wipe");
    const res = await request(app).delete("/api/jobs/wipe");
    expect(res.status).toBe(200);
    expect(getJob("wipe")).toBeUndefined();
    expect(fs.existsSync(outputDir("wipe"))).toBe(false);
  });

  it("404s an unknown job", async () => {
    expect((await request(app).delete("/api/jobs/ghost")).status).toBe(404);
  });
});

describe("GET /api/jobs/:id/download-all", () => {
  it("404s when the job has no finished files", async () => {
    createJob(mkJob({ id: "empty" }));
    expect((await request(app).get("/api/jobs/empty/download-all")).status).toBe(404);
  });

  it("streams a zip named after the project", async () => {
    const job = withDoneCut("zipjob");
    job.project.name = "Cool Project";
    const res = await request(app).get("/api/jobs/zipjob/download-all").buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(
      /filename="Cool-Project-\d{4}-\d{2}-\d{2}\.zip"/,
    );
  });
});

describe("GET /api/jobs/:id/events (SSE)", () => {
  it("streams the current snapshot to a late subscriber", async () => {
    createJob(mkJob({ id: "sse", phase: "cutting" }));
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    try {
      const ac = new AbortController();
      const res = await fetch(`http://localhost:${port}/api/jobs/sse/events`, {
        signal: ac.signal,
      });
      const chunk = await res.body!.getReader().read();
      expect(new TextDecoder().decode(chunk.value)).toContain('"type":"snapshot"');
      ac.abort();
    } finally {
      server.close();
    }
  });

  it("404s an unknown job", async () => {
    expect((await request(app).get("/api/jobs/ghost/events")).status).toBe(404);
  });
});
