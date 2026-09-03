import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Job } from "@shared/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-jobstore-"));
process.env.DATA_DIR = tmp;

const store = await import("@server/core/jobStore");
const { JOBS_DIR, jobManifest } = await import("@server/core/paths");

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const mkJob = (id: string, createdAt = new Date().toISOString()): Job => ({
  id,
  createdAt,
  project: { id, sourceUrl: "u", cutMode: "precise", format: "mp4", cuts: [] },
  phase: "downloading",
  downloadPercent: 0,
  cuts: [{ id: "c1", position: 1, fileName: "", status: "pending", percent: 0 }],
});

describe("jobStore", () => {
  it("createJob stores in memory and persists a manifest", () => {
    store.createJob(mkJob("a"));
    expect(store.getJob("a")?.id).toBe("a");
    expect(fs.existsSync(jobManifest("a"))).toBe(true);
  });

  it("listJobs returns newest first by createdAt", () => {
    store.createJob(mkJob("old", "2026-01-01T00:00:00.000Z"));
    store.createJob(mkJob("new", "2026-06-01T00:00:00.000Z"));
    const ids = store.listJobs().map((j) => j.id);
    expect(ids.indexOf("new")).toBeLessThan(ids.indexOf("old"));
  });

  it("patchJob mutates + persists and emits an event when given one", () => {
    store.createJob(mkJob("p"));
    const seen: unknown[] = [];
    store.emitterFor("p").on("event", (e) => seen.push(e));
    const updated = store.patchJob(
      "p",
      (j) => {
        j.phase = "done";
      },
      { type: "job-done", job: mkJob("p") },
    );
    expect(updated?.phase).toBe("done");
    expect(seen).toHaveLength(1);
    const onDisk = JSON.parse(fs.readFileSync(jobManifest("p"), "utf8")) as Job;
    expect(onDisk.phase).toBe("done");
  });

  it("patchJob returns undefined for an unknown job", () => {
    expect(store.patchJob("ghost", () => {})).toBeUndefined();
  });

  it("forgetJob drops memory + manifest", () => {
    store.createJob(mkJob("gone"));
    store.forgetJob("gone");
    expect(store.getJob("gone")).toBeUndefined();
    expect(fs.existsSync(jobManifest("gone"))).toBe(false);
  });

  it("rehydrate reloads manifests and fails interrupted jobs", () => {
    fs.mkdirSync(JOBS_DIR, { recursive: true });
    const interrupted = mkJob("rehydrated");
    interrupted.phase = "cutting";
    fs.writeFileSync(jobManifest("rehydrated"), JSON.stringify(interrupted));
    fs.writeFileSync(path.join(JOBS_DIR, "broken.json"), "{ not json");

    store.rehydrate();
    const j = store.getJob("rehydrated");
    expect(j?.phase).toBe("failed");
    expect(j?.error).toMatch(/interrompido/i);
  });
});
