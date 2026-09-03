import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-peaks-"));
process.env.DATA_DIR = tmp;

const cachedPeaks = vi.fn();
vi.mock("@server/core/waveform", () => ({ cachedPeaks: (...a: unknown[]) => cachedPeaks(...a) }));

const { sourceRouter } = await import("@server/routes/source");
const { cachedSourcePath } = await import("@server/core/sourceCache");

const app = express();
app.use("/api/source", sourceRouter);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => vi.clearAllMocks());

const URL = "https://www.youtube.com/watch?v=peaksVIDEO1";
const putSource = () => {
  const file = cachedSourcePath(URL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "video");
  return file;
};

describe("GET /api/source/peaks", () => {
  it("422s a bad url", async () => {
    const res = await request(app).get("/api/source/peaks").query({ url: "nope" });
    expect(res.status).toBe(422);
  });

  it("404s before the source is downloaded", async () => {
    const res = await request(app).get("/api/source/peaks").query({ url: URL });
    expect(res.status).toBe(404);
  });

  it("returns clamped-bucket peaks once the source exists", async () => {
    putSource();
    cachedPeaks.mockResolvedValue([0, 0.5, 1]);
    const res = await request(app).get("/api/source/peaks").query({ url: URL, n: "5" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ peaks: [0, 0.5, 1] });
    // n=5 is below the floor of 200
    expect(cachedPeaks).toHaveBeenCalledWith(expect.any(String), expect.any(String), 200);
  });

  it("500s when peak computation throws", async () => {
    putSource();
    cachedPeaks.mockRejectedValue(new Error("decode failed"));
    const res = await request(app).get("/api/source/peaks").query({ url: URL });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("decode failed");
  });
});
