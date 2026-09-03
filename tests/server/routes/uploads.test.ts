import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-uploads-"));
process.env.DATA_DIR = tmp;

const { UPLOADS_DIR } = await import("@server/core/paths");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const { uploadsRouter } = await import("@server/routes/uploads");

const app = express();
app.use("/api/uploads", uploadsRouter);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("POST /api/uploads (video)", () => {
  it("accepts a video file and returns an id", async () => {
    const res = await request(app)
      .post("/api/uploads")
      .attach("file", Buffer.from("fake mp4"), { filename: "clip.mp4", contentType: "video/mp4" });
    expect(res.status).toBe(201);
    expect(res.body.uploadId).toBeTruthy();
    expect(res.body.originalName).toBe("clip.mp4");
    expect(fs.existsSync(path.join(UPLOADS_DIR, `${res.body.uploadId}.mp4`))).toBe(true);
  });

  it("rejects a non-video extension", async () => {
    const res = await request(app)
      .post("/api/uploads")
      .attach("file", Buffer.from("x"), { filename: "notes.txt", contentType: "text/plain" });
    expect(res.status).toBe(422);
  });

  it("422s when no file is attached", async () => {
    const res = await request(app).post("/api/uploads");
    expect(res.status).toBe(422);
  });
});

describe("POST /api/uploads/image", () => {
  it("accepts a PNG", async () => {
    const res = await request(app)
      .post("/api/uploads/image")
      .attach("file", Buffer.from("PNG"), { filename: "logo.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.uploadId).toBeTruthy();
  });

  it("rejects a non-image", async () => {
    const res = await request(app)
      .post("/api/uploads/image")
      .attach("file", Buffer.from("x"), { filename: "a.mp4", contentType: "video/mp4" });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/uploads/:id", () => {
  it("streams an existing upload", async () => {
    const up = await request(app)
      .post("/api/uploads")
      .attach("file", Buffer.from("hello-bytes"), { filename: "c.mp4", contentType: "video/mp4" });
    const res = await request(app)
      .get(`/api/uploads/${up.body.uploadId}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect((res.body as Buffer).toString()).toBe("hello-bytes");
  });

  it("404s an unknown id", async () => {
    const res = await request(app).get("/api/uploads/nope");
    expect(res.status).toBe(404);
  });
});
