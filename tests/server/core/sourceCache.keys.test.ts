import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-cache-keys-"));
process.env.DATA_DIR = tmp;

vi.mock("@server/core/ytdlp", () => ({ YTDLP_BIN: "yt-dlp", download: vi.fn() }));

const { download } = await import("@server/core/ytdlp");
const {
  sourceKey,
  cachedSourcePath,
  sourceStatus,
  ensureSource,
  isSourceInFlight,
  prefetchSource,
} = await import("@server/core/sourceCache");
const { SOURCES_DIR, UPLOADS_DIR } = await import("@server/core/paths");

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("sourceKey", () => {
  it("uses the bare id for YouTube", () => {
    expect(sourceKey("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("prefixes the provider for other sites", () => {
    expect(sourceKey("https://vimeo.com/12345")).toBe("vimeo-12345");
  });
  it("hashes URLs with no readable id (stable + short)", () => {
    const k1 = sourceKey("https://example.com/video/abc");
    const k2 = sourceKey("  https://example.com/video/abc  ");
    expect(k1).toMatch(/^url-[0-9a-f]{16}$/);
    expect(k1).toBe(k2);
  });
});

describe("cachedSourcePath", () => {
  it("points inside SOURCES_DIR/<key> for a normal URL", () => {
    expect(cachedSourcePath("https://vimeo.com/999")).toBe(
      path.join(SOURCES_DIR, "vimeo-999", "source.mp4"),
    );
  });

  it("resolves an existing upload in place for local:<id>", () => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, "up1.mov"), "x");
    expect(cachedSourcePath("local:up1")).toBe(path.join(UPLOADS_DIR, "up1.mov"));
  });

  it("returns a 'missing' sentinel for an unknown upload", () => {
    expect(cachedSourcePath("local:ghost")).toBe(path.join(SOURCES_DIR, "upload-ghost", "missing"));
  });
});

describe("sourceStatus", () => {
  it("is idle for an unknown URL, ready once the file exists", () => {
    const url = "https://vimeo.com/222";
    expect(sourceStatus(url).state).toBe("idle");
    const dest = path.join(SOURCES_DIR, "vimeo-222", "source.mp4");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, "x");
    expect(sourceStatus(url)).toEqual({ state: "ready", percent: 100 });
  });

  it("reflects a local upload's presence", () => {
    expect(sourceStatus("local:up1").state).toBe("ready");
    expect(sourceStatus("local:ghost").state).toBe("idle");
  });
});

describe("ensureSource (local uploads)", () => {
  it("resolves to the file path and reports 100%", async () => {
    const onProgress = vi.fn();
    await expect(ensureSource("local:up1", onProgress)).resolves.toContain("up1.mov");
    expect(onProgress).toHaveBeenCalledWith(100);
  });

  it("rejects when the uploaded file is gone", async () => {
    await expect(ensureSource("local:ghost")).rejects.toThrow(/não encontrado/i);
  });

  it("reuses an already-downloaded file without calling download()", async () => {
    await ensureSource("https://vimeo.com/222"); // dest written above
    expect(download).not.toHaveBeenCalled();
  });
});

describe("ensureSource (concurrent downloads share one job)", () => {
  it("coalesces callers and fans progress out to every listener", async () => {
    const url = "https://vimeo.com/333";
    let report!: (p: number) => void;
    vi.mocked(download).mockImplementationOnce((_u, dest, onProgress) => {
      report = onProgress;
      return new Promise((resolve) => {
        setTimeout(() => {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, "x");
          resolve();
        }, 10);
      });
    });

    const a = vi.fn();
    const b = vi.fn();
    const p1 = ensureSource(url, a);
    const p2 = ensureSource(url, b); // joins the in-flight download
    expect(isSourceInFlight(sourceKey(url))).toBe(true);
    report(42);
    await Promise.all([p1, p2]);

    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
    expect(a).toHaveBeenLastCalledWith(100);
    expect(download).toHaveBeenCalledTimes(1);
    expect(isSourceInFlight(sourceKey(url))).toBe(false);
  });
});

describe("prefetchSource", () => {
  it("swallows download errors", async () => {
    vi.mocked(download).mockRejectedValueOnce(new Error("boom"));
    expect(() => prefetchSource("https://vimeo.com/444")).not.toThrow();
    await new Promise((r) => setTimeout(r, 5));
  });
});
