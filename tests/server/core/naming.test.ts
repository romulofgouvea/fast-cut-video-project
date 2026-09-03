import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { outputPath, pickCutFileName } from "@server/core/naming";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-naming-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("outputPath", () => {
  it("joins dir + file", () => {
    expect(outputPath("/a/b", "c.mp4")).toBe(path.join("/a/b", "c.mp4"));
  });
});

describe("pickCutFileName", () => {
  it("prefers the cut name, then project name, then title", () => {
    const reserved = new Set<string>();
    expect(
      pickCutFileName(
        { cutName: "Intro", projectName: "Proj", title: "Title", date: "2026-01-02" },
        path.join(tmp, "nope"),
        reserved,
      ),
    ).toBe("Intro-2026-01-02.mp4");
    expect(
      pickCutFileName(
        { projectName: "Proj", title: "Title", date: "2026-01-02" },
        path.join(tmp, "nope"),
        new Set(),
      ),
    ).toBe("Proj-2026-01-02.mp4");
    expect(
      pickCutFileName({ title: "Title", date: "2026-01-02" }, path.join(tmp, "nope"), new Set()),
    ).toBe("Title-2026-01-02.mp4");
  });

  it("falls back to 'video' and honours a custom extension", () => {
    expect(
      pickCutFileName({ date: "2026-01-02", ext: "webm" }, path.join(tmp, "x"), new Set()),
    ).toBe("video-2026-01-02.webm");
  });

  it("avoids names already on disk and names reserved earlier in the run", () => {
    const dir = path.join(tmp, "run");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "Clip-2026-01-02.mp4"), "");
    const reserved = new Set<string>();
    const first = pickCutFileName({ cutName: "Clip", date: "2026-01-02" }, dir, reserved);
    expect(first).toBe("Clip-2026-01-02_(2).mp4");
    const second = pickCutFileName({ cutName: "Clip", date: "2026-01-02" }, dir, reserved);
    expect(second).toBe("Clip-2026-01-02_(3).mp4");
    expect(reserved.has(first)).toBe(true);
  });
});
