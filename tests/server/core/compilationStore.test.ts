import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Compilation } from "@shared/types";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-compstore-"));
process.env.DATA_DIR = tmp;

const store = await import("@server/core/compilationStore");
const { COMPILATIONS_DIR, compilationManifest } = await import("@server/core/paths");

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const mk = (id: string, createdAt = new Date().toISOString()): Compilation => ({
  id,
  createdAt,
  items: [
    { kind: "cut", jobId: "J", position: 1 },
    { kind: "cut", jobId: "J", position: 2 },
  ],
  phase: "processing",
  percent: 0,
});

describe("compilationStore", () => {
  it("createCompilation stores + persists", () => {
    store.createCompilation(mk("a"));
    expect(store.getCompilation("a")?.id).toBe("a");
    expect(fs.existsSync(compilationManifest("a"))).toBe(true);
  });

  it("listCompilations is newest-first", () => {
    store.createCompilation(mk("c-old", "2026-01-01T00:00:00.000Z"));
    store.createCompilation(mk("c-new", "2026-09-01T00:00:00.000Z"));
    const ids = store.listCompilations().map((c) => c.id);
    expect(ids.indexOf("c-new")).toBeLessThan(ids.indexOf("c-old"));
  });

  it("patchCompilation updates, persists and emits", () => {
    store.createCompilation(mk("p"));
    const events: unknown[] = [];
    store.emitterFor("p").on("event", (e) => events.push(e));
    const out = store.patchCompilation(
      "p",
      (c) => {
        c.phase = "done";
        c.percent = 100;
      },
      { type: "progress", percent: 100 },
    );
    expect(out?.phase).toBe("done");
    expect(events).toHaveLength(1);
  });

  it("patchCompilation returns undefined for an unknown id", () => {
    expect(store.patchCompilation("ghost", () => {})).toBeUndefined();
  });

  it("forgetCompilation removes memory + manifest", () => {
    store.createCompilation(mk("gone"));
    store.forgetCompilation("gone");
    expect(store.getCompilation("gone")).toBeUndefined();
    expect(fs.existsSync(compilationManifest("gone"))).toBe(false);
  });

  it("rehydrate reloads manifests and fails interrupted runs", () => {
    fs.mkdirSync(COMPILATIONS_DIR, { recursive: true });
    const running = mk("reh");
    running.phase = "processing";
    fs.writeFileSync(compilationManifest("reh"), JSON.stringify(running));
    fs.writeFileSync(path.join(COMPILATIONS_DIR, "corrupt.json"), "nope");

    store.rehydrate();
    expect(store.getCompilation("reh")?.phase).toBe("failed");
  });
});
