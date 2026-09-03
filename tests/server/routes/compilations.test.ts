import { afterAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-comp-route-"));
process.env.DATA_DIR = tmp;

const runCompilation = vi.fn();
vi.mock("@server/core/compilationPipeline", async (orig) => ({
  ...(await orig<typeof import("@server/core/compilationPipeline")>()),
  runCompilation: (...a: unknown[]) => runCompilation(...a),
}));

const { compilationsRouter } = await import("@server/routes/compilations");
const { createCompilation, patchCompilation, getCompilation } =
  await import("@server/core/compilationStore");
const { compilationFile } = await import("@server/core/paths");

const app = express();
app.use(express.json());
app.use("/api/compilations", compilationsRouter);

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const twoItems = [
  { kind: "cut", jobId: "J", position: 1 },
  { kind: "cut", jobId: "J", position: 2 },
];

describe("POST /api/compilations", () => {
  it("422s fewer than two items", async () => {
    const res = await request(app)
      .post("/api/compilations")
      .send({ items: [twoItems[0]] });
    expect(res.status).toBe(422);
  });

  it("creates a compilation and starts the pipeline", async () => {
    const res = await request(app)
      .post("/api/compilations")
      .send({ name: "My Montage", items: twoItems });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(runCompilation).toHaveBeenCalledOnce();
    expect(getCompilation(res.body.id)?.name).toBe("My Montage");
  });
});

describe("GET /api/compilations", () => {
  it("lists known compilations", async () => {
    const res = await request(app).get("/api/compilations");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/compilations/:id", () => {
  it("404s an unknown id", async () => {
    const res = await request(app).get("/api/compilations/ghost");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/compilations/:id/download", () => {
  it("404s while the run is not done", async () => {
    createCompilation({
      id: "dl1",
      createdAt: "2026-08-05T00:00:00.000Z",
      items: twoItems as never,
      phase: "processing",
      percent: 0,
    });
    const res = await request(app).get("/api/compilations/dl1/download");
    expect(res.status).toBe(404);
  });

  it("uses ?name= (hardened) for the download filename once done", async () => {
    createCompilation({
      id: "dl2",
      createdAt: "2026-08-05T00:00:00.000Z",
      items: twoItems as never,
      phase: "processing",
      percent: 0,
    });
    patchCompilation("dl2", (c) => {
      c.phase = "done";
    });
    fs.mkdirSync(path.dirname(compilationFile("dl2")), { recursive: true });
    fs.writeFileSync(compilationFile("dl2"), "final-video");

    const res = await request(app)
      .get("/api/compilations/dl2/download")
      .query({ name: "LOFI 1h-2026-08-05.mp4" });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("LOFI-1h-2026-08-05.mp4");
  });

  it("falls back to a generated name when ?name= is absent", async () => {
    const res = await request(app).get("/api/compilations/dl2/download");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(
      /filename="montagem-\d{4}-\d{2}-\d{2}\.mp4"/,
    );
  });
});

describe("GET /api/compilations/:id/events (SSE)", () => {
  it("404s an unknown id", async () => {
    const res = await request(app).get("/api/compilations/ghost/events");
    expect(res.status).toBe(404);
  });

  it("streams the current state to a subscriber", async () => {
    createCompilation({
      id: "sse",
      createdAt: "2026-08-05T00:00:00.000Z",
      items: twoItems as never,
      phase: "processing",
      percent: 0,
    });
    const server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    try {
      const ac = new AbortController();
      const res = await fetch(`http://localhost:${port}/api/compilations/sse/events`, {
        signal: ac.signal,
      });
      const chunk = await res.body!.getReader().read();
      expect(new TextDecoder().decode(chunk.value)).toContain('"type":"snapshot"');
      ac.abort();
    } finally {
      server.close();
    }
  });
});
