import { describe, expect, it } from "vitest";
import {
  CancelledError,
  cancelJob,
  endJobControl,
  isJobRunning,
  startJobControl,
  whenAborted,
} from "@server/core/jobControl";

describe("jobControl", () => {
  it("tracks a running job between start and end", () => {
    expect(isJobRunning("j1")).toBe(false);
    const ac = startJobControl("j1");
    expect(isJobRunning("j1")).toBe(true);
    expect(ac.signal.aborted).toBe(false);
    endJobControl("j1");
    expect(isJobRunning("j1")).toBe(false);
  });

  it("cancelJob aborts a live controller and returns true once", () => {
    startJobControl("j2");
    expect(cancelJob("j2")).toBe(true);
    expect(isJobRunning("j2")).toBe(false); // aborted
    expect(cancelJob("j2")).toBe(false); // already aborted
    endJobControl("j2");
  });

  it("cancelJob returns false for an unknown job", () => {
    expect(cancelJob("ghost")).toBe(false);
  });

  it("whenAborted rejects with CancelledError when the signal is already aborted", async () => {
    const ac = startJobControl("j3");
    ac.abort();
    await expect(whenAborted(ac.signal)).rejects.toBeInstanceOf(CancelledError);
    endJobControl("j3");
  });

  it("whenAborted rejects when the signal aborts later", async () => {
    const ac = startJobControl("j4");
    const p = whenAborted(ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow("Processamento cancelado.");
    endJobControl("j4");
  });
});
