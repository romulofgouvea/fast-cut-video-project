// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { setAutoDownload, useAutoDownload } from "@/lib/autoDownload";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal render harness (the project has no @testing-library/react).
function renderHook<T>(hook: () => T) {
  const result = { current: undefined as T };
  const Probe = () => {
    result.current = hook();
    return null;
  };
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<Probe />));
  return { result, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => localStorage.clear());

describe("useAutoDownload", () => {
  it("starts from the stored preference and re-renders when it changes", () => {
    const { result, unmount } = renderHook(() => useAutoDownload());
    expect(result.current).toBe(true);

    act(() => setAutoDownload(false));
    expect(result.current).toBe(false);

    act(() => setAutoDownload(true));
    expect(result.current).toBe(true);

    unmount();
    // a change after unmount must not throw (listener was removed)
    expect(() => setAutoDownload(false)).not.toThrow();
  });
});
