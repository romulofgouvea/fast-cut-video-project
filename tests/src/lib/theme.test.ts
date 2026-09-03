// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, getStoredTheme, initTheme, setTheme } from "@/lib/theme";

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const matchMediaLight = (light: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("light") ? light : !light,
    addEventListener: vi.fn(),
  }));

describe("getStoredTheme", () => {
  it("defaults to dark", () => {
    expect(getStoredTheme()).toBe("dark");
  });
  it("returns a stored valid value, ignores junk", () => {
    localStorage.setItem("fcv-theme", "light");
    expect(getStoredTheme()).toBe("light");
    localStorage.setItem("fcv-theme", "banana");
    expect(getStoredTheme()).toBe("dark");
  });
});

describe("applyTheme", () => {
  it("writes data-theme on <html>", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("resolves 'system' via prefers-color-scheme", () => {
    matchMediaLight(true);
    applyTheme("system");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    matchMediaLight(false);
    applyTheme("system");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});

describe("setTheme", () => {
  it("persists and applies", () => {
    setTheme("light");
    expect(localStorage.getItem("fcv-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("resilience", () => {
  it("getStoredTheme / setTheme survive a throwing localStorage", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getStoredTheme()).toBe("dark");
    expect(() => setTheme("light")).not.toThrow();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("resolves 'system' to dark when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    applyTheme("system");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("initTheme is a no-op subscription when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(() => initTheme()).not.toThrow();
  });
});

describe("initTheme", () => {
  it("applies the stored theme and subscribes to OS changes", () => {
    const addEventListener = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener }));
    localStorage.setItem("fcv-theme", "system");
    initTheme();
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
