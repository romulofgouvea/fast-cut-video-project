import { afterAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-maint-route-"));
process.env.DATA_DIR = tmp;

const { OUTPUT_DIR, ensureDirs } = await import("@server/core/paths");
const { maintenanceRouter } = await import("@server/routes/maintenance");

ensureDirs();
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const app = express();
app.use(express.json());
app.use("/api/maintenance", maintenanceRouter);

describe("POST /api/maintenance/purge", () => {
  it("422s without a jobs array (won't wipe everything)", async () => {
    const res = await request(app).post("/api/maintenance/purge").send({});
    expect(res.status).toBe(422);
  });

  it("removes orphan job dirs and reports freed bytes", async () => {
    fs.mkdirSync(path.join(OUTPUT_DIR, "orphan"), { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, "orphan", "a.bin"), Buffer.alloc(1024));
    fs.mkdirSync(path.join(OUTPUT_DIR, "kept"), { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, "kept", "b.bin"), Buffer.alloc(1024));

    const res = await request(app)
      .post("/api/maintenance/purge")
      .send({ jobs: ["kept"], compilations: [] });

    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(1);
    expect(res.body.freed).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(OUTPUT_DIR, "orphan"))).toBe(false);
    expect(fs.existsSync(path.join(OUTPUT_DIR, "kept"))).toBe(true);
  });
});
