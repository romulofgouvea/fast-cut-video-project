import { describe, expect, it } from "vitest";
import {
  bundleName,
  cutOutputName,
  dateStamp,
  fileBase,
  resolveCollision,
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
  it("is <base>_<date>.mp4", () => {
    expect(cutOutputName("Cool Clip", "2026-08-05")).toBe("Cool-Clip_2026-08-05.mp4");
  });
  it("falls back to 'video' without a base", () => {
    expect(fileBase(undefined)).toBe("video");
    expect(cutOutputName(undefined, "2026-08-05")).toBe("video_2026-08-05.mp4");
  });
});

describe("bundleName", () => {
  it("appends the date and the given extension", () => {
    expect(bundleName("My Project", "2026-08-05", "zip")).toBe("My-Project_2026-08-05.zip");
  });
});

describe("resolveCollision", () => {
  it("keeps the name when free", () => {
    expect(resolveCollision("v_2026-08-05.mp4", [])).toBe("v_2026-08-05.mp4");
  });
  it("adds an incrementing suffix", () => {
    expect(resolveCollision("v_2026-08-05.mp4", ["v_2026-08-05.mp4"])).toBe(
      "v_2026-08-05_(2).mp4",
    );
    expect(
      resolveCollision("v_2026-08-05.mp4", [
        "v_2026-08-05.mp4",
        "v_2026-08-05_(2).mp4",
      ]),
    ).toBe("v_2026-08-05_(3).mp4");
  });
});
