import { describe, expect, it } from "vitest";
import { buildConcatArgs, type ConcatInput } from "./compile";

const clip = (over: Partial<ConcatInput> = {}): ConcatInput => ({
  path: "/data/output/j/a.mp4",
  hasAudio: true,
  durationSec: 10,
  ...over,
});

describe("buildConcatArgs", () => {
  it("requires at least two inputs", () => {
    expect(() => buildConcatArgs([clip()], "/out.mp4")).toThrow();
  });

  it("adds one -i per input and a concat filter over all of them", () => {
    const args = buildConcatArgs([clip(), clip({ path: "/b.mp4" })], "/out.mp4");
    expect(args.filter((a) => a === "-i")).toHaveLength(2);
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toContain("concat=n=2:v=1:a=1[vout][aout]");
    expect(args[args.length - 1]).toBe("/out.mp4");
    expect(args).toContain("libx264");
  });

  it("synthesizes a silent track for inputs without audio", () => {
    const args = buildConcatArgs([clip({ hasAudio: false }), clip({ path: "/b.mp4" })], "/out.mp4");
    expect(args).toContain("lavfi");
    expect(args.some((a) => a.startsWith("anullsrc"))).toBe(true);
    // real inputs (2) + one silence input
    expect(args.filter((a) => a === "-i")).toHaveLength(3);
  });
});
