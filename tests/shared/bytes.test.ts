import { describe, expect, it } from "vitest";
import { formatBytes } from "@shared/bytes";

describe("formatBytes", () => {
  it("returns '0 B' for zero, negatives and non-finite input", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(Infinity)).toBe("0 B");
  });

  it("keeps bytes and KB as whole numbers", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB"); // 1.5 KB rounds to 2
    expect(formatBytes(912 * 1024)).toBe("912 KB");
  });

  it("shows one decimal from MB up", () => {
    expect(formatBytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
    expect(formatBytes(1.2 * 1024 ** 3)).toBe("1.2 GB");
  });

  it("caps at TB", () => {
    expect(formatBytes(5 * 1024 ** 4)).toBe("5 TB");
    expect(formatBytes(2048 * 1024 ** 4)).toBe("2048 TB");
  });
});
