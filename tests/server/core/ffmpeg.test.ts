import { describe, expect, it } from "vitest";
import { buildCutArgs, sanitizeWatermarkText } from "@server/core/ffmpeg";

const base = { startSec: 60, durationSec: 90, input: "/src/source.mp4", output: "/out/a.mp4" };

describe("buildCutArgs", () => {
  it("seeks with -ss before -i and uses -t duration", () => {
    const args = buildCutArgs({ ...base, mode: "precise" });
    const ss = args.indexOf("-ss");
    const i = args.indexOf("-i");
    expect(ss).toBeGreaterThanOrEqual(0);
    expect(ss).toBeLessThan(i);
    expect(args[args.indexOf("-t") + 1]).toBe("90");
  });

  it("fast mode copies video and re-encodes audio (keeps A/V in sync)", () => {
    const args = buildCutArgs({ ...base, mode: "fast" });
    expect(args[args.indexOf("-c:v") + 1]).toBe("copy");
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args.some((a) => a.startsWith("aresample"))).toBe(true);
    expect(args).not.toContain("libx264");
  });

  it("precise mode re-encodes with libx264 + aac", () => {
    const args = buildCutArgs({ ...base, mode: "precise" });
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
  });

  it("puts the output path last", () => {
    const args = buildCutArgs({ ...base, mode: "fast" });
    expect(args[args.length - 1]).toBe("/out/a.mp4");
  });

  it("mp3: audio only, no video codec", () => {
    const args = buildCutArgs({ ...base, mode: "fast", format: "mp3", output: "/out/a.mp3" });
    expect(args).toContain("-vn");
    expect(args).toContain("libmp3lame");
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("-movflags");
  });

  it("gif: palette pipeline, no audio", () => {
    const args = buildCutArgs({ ...base, mode: "precise", format: "gif", output: "/out/a.gif" });
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("palettegen");
    expect(fc).toContain("paletteuse");
    expect(args).toContain("-an");
  });

  it("webm: vp9 + opus", () => {
    const args = buildCutArgs({ ...base, mode: "fast", format: "webm", output: "/out/a.webm" });
    expect(args).toContain("libvpx-vp9");
    expect(args).toContain("libopus");
  });

  it("a watermark forces a re-encode in fast mp4 mode", () => {
    const args = buildCutArgs({
      ...base,
      mode: "fast",
      watermark: { text: "@canal", position: "bottom-right", opacity: 0.8 },
    });
    expect(args).toContain("libx264");
    expect(args.join(" ")).toContain("drawtext=");
    expect(args.join(" ")).toContain("@canal");
  });

  it("image watermark adds a second input and an overlay", () => {
    const args = buildCutArgs({
      ...base,
      mode: "precise",
      watermark: { imagePath: "/up/logo.png", position: "top-left", opacity: 0.9, scale: 0.2 },
    });
    expect(args.filter((a) => a === "-i")).toHaveLength(2);
    expect(args.join(" ")).toContain("overlay=");
  });
});

describe("sanitizeWatermarkText", () => {
  it("strips ffmpeg-hostile characters", () => {
    expect(sanitizeWatermarkText("hi: [x] 'quote' \\ %d")).toBe("hi x quote d");
    expect(sanitizeWatermarkText("@canal_oficial")).toBe("@canal oficial");
    expect(sanitizeWatermarkText("  spaced  ")).toBe("spaced");
    expect(sanitizeWatermarkText("olá, mundo! 2024")).toBe("olá, mundo! 2024");
  });
});
