import { afterEach, describe, expect, it, vi } from "vitest";
import { uuid } from "@/lib/uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("uuid", () => {
  it("uses crypto.randomUUID when available", () => {
    const spy = vi.fn(() => "11111111-1111-4111-8111-111111111111");
    vi.stubGlobal("crypto", { randomUUID: spy });
    expect(uuid()).toBe("11111111-1111-4111-8111-111111111111");
    expect(spy).toHaveBeenCalled();
  });

  it("falls back to getRandomValues and still emits a valid v4", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = (i * 37) % 256;
        return arr;
      },
    });
    const id = uuid();
    expect(id).toMatch(V4);
  });

  it("falls back to Math.random when there is no crypto at all", () => {
    vi.stubGlobal("crypto", undefined);
    expect(uuid()).toMatch(V4);
  });
});
