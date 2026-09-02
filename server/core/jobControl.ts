/** Lets a running pipeline be cancelled from an HTTP route. */

const controllers = new Map<string, AbortController>();

export function startJobControl(jobId: string): AbortController {
  const ac = new AbortController();
  controllers.set(jobId, ac);
  return ac;
}

export function endJobControl(jobId: string): void {
  controllers.delete(jobId);
}

/** True while a pipeline is actively running for this job (used by the disk GC). */
export function isJobRunning(jobId: string): boolean {
  const ac = controllers.get(jobId);
  return !!ac && !ac.signal.aborted;
}

/** Abort the pipeline for `jobId` (kills the running ffmpeg). Returns false if it's not running. */
export function cancelJob(jobId: string): boolean {
  const ac = controllers.get(jobId);
  if (!ac || ac.signal.aborted) return false;
  ac.abort();
  return true;
}

export class CancelledError extends Error {
  constructor() {
    super("Processamento cancelado.");
    this.name = "CancelledError";
  }
}

/** A promise that never resolves and rejects with CancelledError when `signal` aborts. */
export function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) return reject(new CancelledError());
    signal.addEventListener("abort", () => reject(new CancelledError()), { once: true });
  });
}
