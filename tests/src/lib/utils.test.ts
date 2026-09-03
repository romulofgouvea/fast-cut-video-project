import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class values and drops falsy ones", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(cn("a", { b: true, c: false })).toBe("a b");
  });

  it("resolves conflicting Tailwind utilities (last wins)", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });
});
