import { describe, expect, it } from "vitest";
import { formatTimecode, parseTimecode, validateCut } from "./time";

describe("parseTimecode", () => {
  it("parses HH:MM:SS", () => {
    expect(parseTimecode("00:01:00")).toBe(60);
    expect(parseTimecode("01:02:03")).toBe(3723);
    expect(parseTimecode("1:00:00")).toBe(3600);
  });
  it("rejects malformed input", () => {
    expect(parseTimecode("1:2")).toBeNull();
    expect(parseTimecode("00:60:00")).toBeNull();
    expect(parseTimecode("abc")).toBeNull();
    expect(parseTimecode("00:00:99")).toBeNull();
  });
});

describe("formatTimecode", () => {
  it("zero-pads", () => {
    expect(formatTimecode(0)).toBe("00:00:00");
    expect(formatTimecode(3723)).toBe("01:02:03");
    expect(formatTimecode(90)).toBe("00:01:30");
  });
});

describe("validateCut", () => {
  it("accepts a valid interval", () => {
    expect(validateCut("00:01:00", "00:02:30")).toEqual({ ok: true, startSec: 60, endSec: 150 });
  });
  it("rejects end <= start", () => {
    expect(validateCut("00:02:00", "00:02:00").ok).toBe(false);
    expect(validateCut("00:03:00", "00:02:00").ok).toBe(false);
  });
  it("rejects end beyond duration", () => {
    expect(validateCut("00:00:00", "00:10:00", 120).ok).toBe(false);
    expect(validateCut("00:00:00", "00:02:00", 120).ok).toBe(true);
  });
});
