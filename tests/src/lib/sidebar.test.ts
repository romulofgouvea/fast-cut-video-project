// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredSidebarCollapsed, storeSidebarCollapsed } from "@/lib/sidebar";

beforeEach(() => localStorage.clear());

describe("sidebar collapse persistence", () => {
  it("defaults to expanded (false)", () => {
    expect(getStoredSidebarCollapsed()).toBe(false);
  });

  it("round-trips through localStorage", () => {
    storeSidebarCollapsed(true);
    expect(localStorage.getItem("fcv-sidebar")).toBe("collapsed");
    expect(getStoredSidebarCollapsed()).toBe(true);

    storeSidebarCollapsed(false);
    expect(getStoredSidebarCollapsed()).toBe(false);
  });

  it("survives a throwing localStorage", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getStoredSidebarCollapsed()).toBe(false);
    expect(() => storeSidebarCollapsed(true)).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
