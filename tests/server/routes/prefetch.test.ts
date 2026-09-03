import { afterAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-prefetch-"));
process.env.DATA_DIR = tmp;

const prefetchSource = vi.fn();
vi.mock("@server/core/sourceCache", async (orig) => ({
  ...(await orig<typeof import("@server/core/sourceCache")>()),
  prefetchSource: (...a: unknown[]) => prefetchSource(...a),
}));

const { prefetchRouter } = await import("@server/routes/prefetch");

const app = express();
app.use(express.json());
app.use("/api/prefetch", prefetchRouter);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("POST /api/prefetch", () => {
  it("kicks off a background download for a supported URL", async () => {
    const res = await request(app)
      .post("/api/prefetch")
      .send({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ ok: true });
    expect(prefetchSource).toHaveBeenCalledWith("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("422s an unsupported URL", async () => {
    const res = await request(app).post("/api/prefetch").send({ url: "not a url" });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/prefetch", () => {
  it("returns the source status for a valid URL", async () => {
    const res = await request(app).get("/api/prefetch").query({ url: "https://vimeo.com/12345" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: "idle", percent: 0 });
  });

  it("422s a missing / invalid URL", async () => {
    const res = await request(app).get("/api/prefetch");
    expect(res.status).toBe(422);
  });
});
