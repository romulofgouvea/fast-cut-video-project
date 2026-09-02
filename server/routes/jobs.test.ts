import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate DATA_DIR before importing modules that read it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-test-"));
process.env.DATA_DIR = tmp;

const { jobsRouter } = await import("./jobs");

const app = express();
app.use(express.json());
app.use("/api/jobs", jobsRouter);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("POST /api/jobs validation", () => {
  const baseProject = {
    id: "p1",
    sourceUrl: "https://www.youtube.com/watch?v=abc",
    cutMode: "precise" as const,
    duration: 600,
    cuts: [{ id: "c1", start: "00:01:00", end: "00:02:00" }],
  };

  it("rejects a project with no cuts", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .send({ project: { ...baseProject, cuts: [] } });
    expect(res.status).toBe(422);
  });

  it("rejects a cut whose end is before its start", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .send({
        project: { ...baseProject, cuts: [{ id: "c1", start: "00:02:00", end: "00:01:00" }] },
      });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Corte 1/);
  });

  it("rejects a cut past the video duration", async () => {
    const res = await request(app)
      .post("/api/jobs")
      .send({
        project: { ...baseProject, cuts: [{ id: "c1", start: "00:00:00", end: "00:20:00" }] },
      });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/jobs", () => {
  it("returns an array", async () => {
    const res = await request(app).get("/api/jobs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
