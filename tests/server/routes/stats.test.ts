import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate DATA_DIR before importing modules that read it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-stats-"));
process.env.DATA_DIR = tmp;

const { ensureDirs } = await import("@server/core/paths");
const { statsRouter } = await import("@server/routes/stats");

ensureDirs();

const app = express();
app.use(express.json());
app.use("/api/stats", statsRouter);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("stats endpoint", () => {
  it("GET reports everything zero on a clean data dir", async () => {
    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      jobs: { total: 0, done: 0, failed: 0, running: 0 },
      cuts: { total: 0, done: 0 },
      clips: 0,
      compilations: { total: 0, done: 0, failed: 0 },
      disk: { total: 0, sources: 0, output: 0, uploads: 0, compilations: 0 },
      orphans: { jobs: 0, compilations: 0, bytes: 0 },
    });
  });

  it("POST with kept refs also returns the Stats shape", async () => {
    const res = await request(app).post("/api/stats").send({ jobs: [], compilations: [] });
    expect(res.status).toBe(200);
    expect(res.body.orphans).toEqual({ jobs: 0, compilations: 0, bytes: 0 });
  });
});
