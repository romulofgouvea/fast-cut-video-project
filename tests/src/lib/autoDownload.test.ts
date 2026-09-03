// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAutoDownload, setAutoDownload } from "@/lib/autoDownload";

beforeEach(() => localStorage.clear());

describe("autoDownload preference", () => {
  it("defaults to on", () => {
    expect(getAutoDownload()).toBe(true);
  });

  it("is off only when explicitly stored 'off'", () => {
    setAutoDownload(false);
    expect(localStorage.getItem("fcv-autodownload")).toBe("off");
    expect(getAutoDownload()).toBe(false);

    setAutoDownload(true);
    expect(getAutoDownload()).toBe(true);
  });

  it("defaults to on when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("nope");
    });
    expect(getAutoDownload()).toBe(true);
    vi.restoreAllMocks();
  });
});
