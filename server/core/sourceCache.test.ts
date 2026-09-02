import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ytc-cache-"));
process.env.DATA_DIR = tmp;

// Stub the actual downloader so we can drive success / failure.
vi.mock("./ytdlp", () => ({
  YTDLP_BIN: "yt-dlp",
  download: vi.fn(),
}));

const { download } = await import("./ytdlp");
const { ensureSource, sourceStatus } = await import("./sourceCache");

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const URL = "https://vimeo.com/987654321";

describe("sourceStatus error state", () => {
  it("reports the last download failure, then clears it on a retry", async () => {
    vi.mocked(download).mockRejectedValueOnce(new Error("HTTP 403 — login required"));
    await expect(ensureSource(URL)).rejects.toThrow("login required");

    const failed = sourceStatus(URL);
    expect(failed.state).toBe("error");
    expect(failed.error).toContain("login required");

    // A retry that succeeds (writes the dest file) leaves it ready, no error.
    vi.mocked(download).mockImplementationOnce(async (_url, dest) => {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, "ok");
    });
    await ensureSource(URL);
    expect(sourceStatus(URL).state).toBe("ready");
  });
});
