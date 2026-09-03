import { describe, expect, it } from "vitest";
import {
  bundleName,
  cutOutputName,
  dateStamp,
  fileBase,
  resolveCollision,
  safeDownloadName,
  sanitizeTitle,
} from "./filename";

describe("sanitizeTitle", () => {
  it("removes invalid characters and spaces", () => {
    expect(sanitizeTitle('My: Video / "Great"?')).toBe("My-Video-Great");
  });
  it("returns empty for nullish", () => {
    expect(sanitizeTitle(undefined)).toBe("");
    expect(sanitizeTitle("")).toBe("");
  });
  it("truncates to maxLen", () => {
    expect(sanitizeTitle("a".repeat(200)).length).toBe(80);
  });
});

describe("dateStamp", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(dateStamp(new Date(2026, 7, 5))).toBe("2026-08-05");
  });
});

describe("cutOutputName", () => {
  it("is <title>-<date>.mp4", () => {
    expect(cutOutputName("Cool Clip", "2026-08-05")).toBe("Cool-Clip-2026-08-05.mp4");
  });
  it("falls back to 'video' without a base", () => {
    expect(fileBase(undefined)).toBe("video");
    expect(cutOutputName(undefined, "2026-08-05")).toBe("video-2026-08-05.mp4");
  });
});

describe("bundleName", () => {
  it("appends the date and the given extension", () => {
    expect(bundleName("My Project", "2026-08-05", "zip")).toBe("My-Project-2026-08-05.zip");
  });
});

describe("safeDownloadName", () => {
  const fallback = "montagem-2026-08-05.mp4";
  it("keeps a clean proposal and swaps in the fallback extension", () => {
    expect(safeDownloadName("LOFI 1h-2026-08-05.mp4", fallback)).toBe("LOFI-1h-2026-08-05.mp4");
  });
  it("strips path components and invalid chars (no traversal)", () => {
    expect(safeDownloadName("../../etc/passwd", fallback)).toBe("passwd.mp4");
    expect(safeDownloadName('a:b*c?"<>|.mp4', fallback)).toBe("abc.mp4");
  });
  it("falls back when the proposal is empty or unusable", () => {
    expect(safeDownloadName(undefined, fallback)).toBe(fallback);
    expect(safeDownloadName("", fallback)).toBe(fallback);
    expect(safeDownloadName("///", fallback)).toBe(fallback);
  });
});

describe("resolveCollision", () => {
  it("keeps the name when free", () => {
    expect(resolveCollision("v_2026-08-05.mp4", [])).toBe("v_2026-08-05.mp4");
  });
  it("adds an incrementing suffix", () => {
    expect(resolveCollision("v_2026-08-05.mp4", ["v_2026-08-05.mp4"])).toBe("v_2026-08-05_(2).mp4");
    expect(resolveCollision("v_2026-08-05.mp4", ["v_2026-08-05.mp4", "v_2026-08-05_(2).mp4"])).toBe(
      "v_2026-08-05_(3).mp4",
    );
  });
});
