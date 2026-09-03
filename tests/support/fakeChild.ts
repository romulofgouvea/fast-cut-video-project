import { EventEmitter } from "node:events";

/**
 * A stand-in for the object `child_process.spawn` returns, good enough for the
 * modules here: they only read `.stdout`/`.stderr` as streams and listen for
 * `error` / `close`. Drive it from a test with `emitStdout`, `emitStderr`,
 * `close` and `error`.
 */
export class FakeChild extends EventEmitter {
  stdout = new EventEmitter() as EventEmitter & { setEncoding(enc: string): void };
  stderr = new EventEmitter() as EventEmitter & { setEncoding(enc: string): void };
  killed = false;

  constructor() {
    super();
    this.stdout.setEncoding = () => {};
    this.stderr.setEncoding = () => {};
  }

  emitStdout(chunk: string | Buffer) {
    this.stdout.emit("data", chunk);
    return this;
  }
  emitStderr(chunk: string) {
    this.stderr.emit("data", chunk);
    return this;
  }
  close(code: number) {
    this.emit("close", code);
    return this;
  }
  error(err: Error) {
    this.emit("error", err);
    return this;
  }
  kill() {
    this.killed = true;
  }
}

/** Records every spawn call and hands back a FakeChild the test can drive. */
export function makeSpawnMock() {
  const calls: { cmd: string; args: string[] }[] = [];
  const children: FakeChild[] = [];
  const spawn = (cmd: string, args: string[] = []) => {
    calls.push({ cmd, args });
    const child = new FakeChild();
    children.push(child);
    return child;
  };
  return {
    spawn,
    calls,
    children,
    /** The most recently created child (the one a just-called function is waiting on). */
    get last() {
      return children[children.length - 1];
    },
  };
}
