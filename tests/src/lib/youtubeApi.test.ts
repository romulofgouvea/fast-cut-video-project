// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeYT = () => ({ Player: class {}, PlayerState: {} }) as unknown as YTNamespace;

beforeEach(() => {
  vi.resetModules();
  delete window.YT;
  delete window.onYouTubeIframeAPIReady;
  document.head.querySelectorAll("script").forEach((s) => s.remove());
});
afterEach(() => vi.restoreAllMocks());

describe("loadYouTubeApi", () => {
  it("resolves immediately when window.YT is already loaded", async () => {
    window.YT = fakeYT();
    const { loadYouTubeApi } = await import("@/lib/youtubeApi");
    await expect(loadYouTubeApi()).resolves.toBe(window.YT);
  });

  it("injects the iframe_api script and resolves on the ready callback", async () => {
    const { loadYouTubeApi } = await import("@/lib/youtubeApi");
    const p = loadYouTubeApi();

    expect(
      document.querySelector('script[src="https://www.youtube.com/iframe_api"]'),
    ).not.toBeNull();

    window.YT = fakeYT();
    window.onYouTubeIframeAPIReady!();
    await expect(p).resolves.toBe(window.YT);
  });

  it("returns the same promise on repeated calls and only injects one script", async () => {
    const { loadYouTubeApi } = await import("@/lib/youtubeApi");
    const p1 = loadYouTubeApi();
    const p2 = loadYouTubeApi();
    expect(p1).toBe(p2);
    expect(
      document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]'),
    ).toHaveLength(1);
  });

  it("chains a pre-existing onYouTubeIframeAPIReady handler", async () => {
    const prev = vi.fn();
    window.onYouTubeIframeAPIReady = prev;
    const { loadYouTubeApi } = await import("@/lib/youtubeApi");
    const p = loadYouTubeApi();
    window.YT = fakeYT();
    window.onYouTubeIframeAPIReady!();
    await p;
    expect(prev).toHaveBeenCalled();
  });
});
