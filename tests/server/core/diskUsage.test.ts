import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-disk-"));
process.env.DATA_DIR = tmp;

const { dirSize, diskUsage } = await import("@server/core/diskUsage");
const { SOURCES_DIR, OUTPUT_DIR, UPLOADS_DIR, COMPILATIONS_DIR } =
  await import("@server/core/paths");

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const writeN = (file: string, bytes: number) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.alloc(bytes));
};

describe("dirSize", () => {
  it("is 0 for a missing path", () => {
    expect(dirSize(path.join(tmp, "does-not-exist"))).toBe(0);
  });

  it("sums files recursively through nested directories", () => {
    const root = path.join(tmp, "tree");
    writeN(path.join(root, "a.bin"), 100);
    writeN(path.join(root, "sub", "b.bin"), 250);
    writeN(path.join(root, "sub", "deep", "c.bin"), 30);
    expect(dirSize(root)).toBe(380);
  });
});

describe("diskUsage", () => {
  it("reports each data subtree and their sum", () => {
    writeN(path.join(SOURCES_DIR, "s.mp4"), 1000);
    writeN(path.join(OUTPUT_DIR, "job", "o.mp4"), 500);
    writeN(path.join(UPLOADS_DIR, "u.mp4"), 200);
    writeN(path.join(COMPILATIONS_DIR, "c", "final.mp4"), 300);

    const u = diskUsage();
    expect(u.sources).toBe(1000);
    expect(u.output).toBe(500);
    expect(u.uploads).toBe(200);
    expect(u.compilations).toBe(300);
    expect(u.total).toBe(2000);
  });
});
