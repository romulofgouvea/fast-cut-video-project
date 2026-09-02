import { describe, expect, it } from "vitest";
import { createLimiter } from "./limiter";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("createLimiter", () => {
  it("never runs more than `max` tasks at once", async () => {
    const gate = createLimiter(2);
    let running = 0;
    let peak = 0;

    const task = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
    };

    await Promise.all(Array.from({ length: 10 }, () => gate.run(task)));
    expect(peak).toBe(2);
  });

  it("keeps going after a task rejects, and propagates the error", async () => {
    const gate = createLimiter(1);
    await expect(gate.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(gate.run(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("treats max < 1 as 1", async () => {
    const gate = createLimiter(0);
    let running = 0;
    let peak = 0;
    const task = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
    };
    await Promise.all([gate.run(task), gate.run(task), gate.run(task)]);
    expect(peak).toBe(1);
  });
});
