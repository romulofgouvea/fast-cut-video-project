import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-vinfo-"));
process.env.DATA_DIR = tmp;

const dumpInfo = vi.fn();
vi.mock("@server/core/ytdlp", () => ({
  YTDLP_BIN: "yt-dlp",
  dumpInfo: (...a: unknown[]) => dumpInfo(...a),
}));
const probeDuration = vi.fn();
vi.mock("@server/core/probe", () => ({ probeDuration: (...a: unknown[]) => probeDuration(...a) }));

const { videoInfoRouter } = await import("@server/routes/videoInfo");
const { UPLOADS_DIR } = await import("@server/core/paths");

const app = express();
app.use(express.json());
app.use("/api/video-info", videoInfoRouter);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => vi.clearAllMocks());

describe("POST /api/video-info", () => {
  it("422s an empty body", async () => {
    const res = await request(app).post("/api/video-info").send({});
    expect(res.status).toBe(422);
  });

  it("probes a local upload directly", async () => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, "up9.mp4"), "x");
    probeDuration.mockResolvedValue(42.6);

    const res = await request(app).post("/api/video-info").send({ url: "local:up9" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ title: "Arquivo enviado", duration: 43 });
  });

  it("422s a local upload that is gone", async () => {
    const res = await request(app).post("/api/video-info").send({ url: "local:missing" });
    expect(res.status).toBe(422);
  });

  it("422s a non-URL string", async () => {
    const res = await request(app).post("/api/video-info").send({ url: "just text" });
    expect(res.status).toBe(422);
  });

  it("returns yt-dlp info for a valid URL", async () => {
    dumpInfo.mockResolvedValue({ title: "T", duration: 10, videoId: "v" });
    const res = await request(app)
      .post("/api/video-info")
      .send({ url: "https://youtube.com/watch?v=v" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "T", duration: 10 });
  });

  it("422s with yt-dlp's message when it throws", async () => {
    dumpInfo.mockRejectedValue(new Error("Video unavailable"));
    const res = await request(app).post("/api/video-info").send({ url: "https://x.test/v" });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Video unavailable");
  });
});
