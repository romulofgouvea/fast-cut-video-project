import { describe, expect, it } from "vitest";
import { localSourceUrl, parseLocalSource } from "./localSource";
import { detectSource, isSupportedSourceUrl } from "./videoSource";

describe("localSource", () => {
  it("round-trips an upload id", () => {
    const url = localSourceUrl("abc-123_XY");
    expect(url).toBe("local:abc-123_XY");
    expect(parseLocalSource(url)).toBe("abc-123_XY");
  });

  it("rejects non-local strings", () => {
    expect(parseLocalSource("https://youtube.com/watch?v=x")).toBeNull();
    expect(parseLocalSource("local:")).toBeNull();
    expect(parseLocalSource("local:has space")).toBeNull();
  });

  it("detectSource + isSupportedSourceUrl recognise it", () => {
    const s = detectSource("local:vid42");
    expect(s.provider).toBe("local");
    expect(s.id).toBe("vid42");
    expect(s.hasBridge).toBe(false);
    expect(isSupportedSourceUrl("local:vid42")).toBe(true);
    expect(isSupportedSourceUrl("local:")).toBe(false);
  });
});
