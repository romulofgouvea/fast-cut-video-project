import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpBin = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-bin-"));
process.env.BIN_DIR = tmpBin;

const { resolveBinary, BIN_DIR } = await import("@server/core/binaries");

afterAll(() => fs.rmSync(tmpBin, { recursive: true, force: true }));

describe("resolveBinary", () => {
  beforeEach(() => {
    delete process.env.TEST_TOOL_PATH;
    for (const f of fs.readdirSync(tmpBin)) fs.rmSync(path.join(tmpBin, f), { force: true });
  });

  it("BIN_DIR honours the env override", () => {
    expect(BIN_DIR).toBe(path.resolve(tmpBin));
  });

  it("prefers an explicit env override above everything", () => {
    process.env.TEST_TOOL_PATH = "/custom/tool";
    fs.writeFileSync(path.join(tmpBin, "tool"), "");
    expect(resolveBinary("tool", "TEST_TOOL_PATH")).toBe("/custom/tool");
  });

  it("falls back to ./bin/<name> (or <name>.exe) when present", () => {
    fs.writeFileSync(path.join(tmpBin, "tool.exe"), "");
    expect(resolveBinary("tool", "TEST_TOOL_PATH")).toBe(path.join(tmpBin, "tool.exe"));
  });

  it("falls back to the bare name when nothing else resolves", () => {
    expect(resolveBinary("tool", "TEST_TOOL_PATH")).toBe("tool");
  });
});

describe("resolveFont", () => {
  afterAll(() => vi.restoreAllMocks());

  it("returns the first candidate that exists on disk, then caches it", async () => {
    const fakeFont = path.join(tmpBin, "Font.ttf");
    fs.writeFileSync(fakeFont, "");
    process.env.FONT_PATH = fakeFont;
    vi.resetModules();
    const { resolveFont } = await import("@server/core/fonts");
    expect(resolveFont()).toBe(fakeFont);
    // second call is served from cache even after the file goes away
    fs.rmSync(fakeFont);
    expect(resolveFont()).toBe(fakeFont);
    delete process.env.FONT_PATH;
  });

  it("returns null when no candidate exists", async () => {
    delete process.env.FONT_PATH;
    vi.resetModules();
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const { resolveFont } = await import("@server/core/fonts");
    expect(resolveFont()).toBeNull();
  });
});
