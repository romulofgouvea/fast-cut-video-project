import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-src-"));
process.env.DATA_DIR = tmp;

const { sourceRouter } = await import("./source");
const { cachedSourcePath } = await import("../core/sourceCache");

const app = express();
app.use("/api/source", sourceRouter);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const URL = "https://www.youtube.com/watch?v=abcdef12345";

describe("GET /api/source", () => {
  it("422 on a bad url", async () => {
    await request(app).get("/api/source").query({ url: "nope" }).expect(422);
  });

  it("404 before the source is downloaded", async () => {
    await request(app).get("/api/source").query({ url: URL }).expect(404);
  });

  it("streams the file (with range support) once it's on disk", async () => {
    const file = cachedSourcePath(URL);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from("0123456789"));

    const full = await request(app).get("/api/source").query({ url: URL }).expect(200);
    expect(full.headers["accept-ranges"]).toBe("bytes");
    expect(full.body.toString()).toBe("0123456789");

    const part = await request(app)
      .get("/api/source")
      .query({ url: URL })
      .set("Range", "bytes=2-5")
      .expect(206);
    expect(part.body.toString()).toBe("2345");
  });
});
