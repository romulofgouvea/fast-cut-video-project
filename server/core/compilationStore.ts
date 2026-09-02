import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import type { Compilation, CompilationEvent } from "../../shared/types";
import { COMPILATIONS_DIR, compilationManifest } from "./paths";

const items = new Map<string, Compilation>();
const emitters = new Map<string, EventEmitter>();

export function emitterFor(id: string): EventEmitter {
  let em = emitters.get(id);
  if (!em) {
    em = new EventEmitter();
    em.setMaxListeners(50);
    emitters.set(id, em);
  }
  return em;
}

function persist(c: Compilation): void {
  const file = compilationManifest(c.id);
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, file);
}

export function createCompilation(c: Compilation): Compilation {
  items.set(c.id, c);
  persist(c);
  return c;
}

export function getCompilation(id: string): Compilation | undefined {
  return items.get(id);
}

/** Every known compilation, newest first (mirrors `listJobs()`). */
export function listCompilations(): Compilation[] {
  return [...items.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function patchCompilation(
  id: string,
  updater: (c: Compilation) => void,
  event?: CompilationEvent,
): Compilation | undefined {
  const c = items.get(id);
  if (!c) return undefined;
  updater(c);
  persist(c);
  if (event) emitterFor(id).emit("event", event);
  return c;
}

export function emit(id: string, event: CompilationEvent): void {
  emitterFor(id).emit("event", event);
}

/** Drop a compilation from memory + disk (used by the disk GC). */
export function forgetCompilation(id: string): void {
  items.delete(id);
  emitters.delete(id);
  try {
    fs.rmSync(compilationManifest(id), { force: true });
  } catch {
    /* ignore */
  }
}

/** Load persisted manifests on boot; interrupted runs become "failed". */
export function rehydrate(): void {
  let files: string[];
  try {
    files = fs.readdirSync(COMPILATIONS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  for (const f of files) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(COMPILATIONS_DIR, f), "utf8")) as Compilation;
      if (c.phase === "processing") {
        c.phase = "failed";
        c.error = "Montagem interrompida (servidor reiniciado). Gere novamente.";
      }
      items.set(c.id, c);
    } catch {
      /* skip corrupt manifest */
    }
  }
}
