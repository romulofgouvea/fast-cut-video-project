import { describe, expect, it } from "vitest";
import { extractYouTubeId } from "./youtube";

describe("extractYouTubeId", () => {
  it("reads ?v= from a watch URL", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=LImU-UFZc98&t=10s")).toBe(
      "LImU-UFZc98",
    );
  });

  it("reads the path from youtu.be", () => {
    expect(extractYouTubeId("https://youtu.be/LImU-UFZc98?si=abc")).toBe("LImU-UFZc98");
  });

  it("handles shorts / embed / live paths", () => {
    expect(extractYouTubeId("https://www.youtube.com/shorts/LImU-UFZc98")).toBe("LImU-UFZc98");
    expect(extractYouTubeId("https://www.youtube.com/embed/LImU-UFZc98")).toBe("LImU-UFZc98");
    expect(extractYouTubeId("https://www.youtube.com/live/LImU-UFZc98")).toBe("LImU-UFZc98");
  });

  it("returns null for non-YouTube or malformed input", () => {
    expect(extractYouTubeId("not a url")).toBeNull();
    expect(extractYouTubeId("https://example.com/watch?v=LImU-UFZc98")).toBe("LImU-UFZc98");
    expect(extractYouTubeId("https://www.youtube.com/watch?v=tooshort")).toBeNull();
  });
});
