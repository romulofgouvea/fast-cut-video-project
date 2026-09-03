// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isTauri } from "@/lib/platform";

const w = () => window as unknown as Record<string, unknown>;

afterEach(() => {
  delete w().__TAURI_INTERNALS__;
});

describe("isTauri", () => {
  it("is false in a plain browser window", () => {
    expect(isTauri()).toBe(false);
  });

  it("is true when the Tauri internals global is present", () => {
    w().__TAURI_INTERNALS__ = {};
    expect(isTauri()).toBe(true);
  });
});
