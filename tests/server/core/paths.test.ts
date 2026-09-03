import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate DATA_DIR before importing the module (it resolves paths at load).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-paths-"));
process.env.DATA_DIR = tmp;

const paths = await import("@server/core/paths");

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("paths", () => {
  it("derives every data subdir from DATA_DIR", () => {
    expect(paths.DATA_DIR).toBe(path.resolve(tmp));
    expect(paths.SOURCES_DIR).toBe(path.join(tmp, "sources"));
    expect(paths.OUTPUT_DIR).toBe(path.join(tmp, "output"));
    expect(paths.JOBS_DIR).toBe(path.join(tmp, "jobs"));
    expect(paths.UPLOADS_DIR).toBe(path.join(tmp, "uploads"));
    expect(paths.COMPILATIONS_DIR).toBe(path.join(tmp, "compilations"));
  });

  it("ensureDirs creates all five", () => {
    paths.ensureDirs();
    for (const d of [
      paths.SOURCES_DIR,
      paths.OUTPUT_DIR,
      paths.JOBS_DIR,
      paths.UPLOADS_DIR,
      paths.COMPILATIONS_DIR,
    ]) {
      expect(fs.existsSync(d)).toBe(true);
    }
  });

  it("builds per-job source / output / manifest paths", () => {
    expect(paths.sourceDir("J1")).toBe(path.join(tmp, "sources", "J1"));
    expect(paths.sourceFile("J1")).toBe(path.join(tmp, "sources", "J1", "source.mp4"));
    expect(paths.outputDir("J1")).toBe(path.join(tmp, "output", "J1"));
    expect(paths.jobManifest("J1")).toBe(path.join(tmp, "jobs", "J1.json"));
  });

  it("builds per-compilation paths", () => {
    expect(paths.compilationDir("C1")).toBe(path.join(tmp, "compilations", "C1"));
    expect(paths.compilationFile("C1")).toBe(path.join(tmp, "compilations", "C1", "final.mp4"));
    expect(paths.compilationManifest("C1")).toBe(path.join(tmp, "compilations", "C1.json"));
  });

  describe("findUpload", () => {
    it("returns undefined when the uploads dir is missing or has no match", () => {
      expect(paths.findUpload("nope")).toBeUndefined();
    });

    it("finds the first file whose name starts with the id", () => {
      fs.mkdirSync(paths.UPLOADS_DIR, { recursive: true });
      fs.writeFileSync(path.join(paths.UPLOADS_DIR, "abc123.mp4"), "x");
      expect(paths.findUpload("abc123")).toBe(path.join(paths.UPLOADS_DIR, "abc123.mp4"));
      expect(paths.findUpload("zzz")).toBeUndefined();
    });
  });
});
