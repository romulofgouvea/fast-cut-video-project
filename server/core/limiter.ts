/**
 * Tiny async concurrency gate. Used to cap how many ffmpeg processes run at once
 * so a burst of simultaneous jobs doesn't thrash the CPU (each ffmpeg encode
 * already uses every core it can get).
 */
export type Limiter = {
  run<T>(fn: () => Promise<T>): Promise<T>;
  readonly active: number;
  readonly pending: number;
};

export function createLimiter(max: number): Limiter {
  const limit = Math.max(1, Math.floor(max) || 1);
  const queue: (() => void)[] = [];
  let active = 0;

  const pump = () => {
    while (active < limit && queue.length > 0) {
      active += 1;
      queue.shift()!();
    }
  };

  return {
    run(fn) {
      return new Promise((resolve, reject) => {
        queue.push(() => {
          fn()
            .then(resolve, reject)
            .finally(() => {
              active -= 1;
              pump();
            });
        });
        pump();
      });
    },
    get active() {
      return active;
    },
    get pending() {
      return queue.length;
    },
  };
}
