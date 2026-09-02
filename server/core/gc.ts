import fs from "node:fs";
import path from "node:path";
import { COMPILATIONS_DIR, OUTPUT_DIR, SOURCES_DIR, UPLOADS_DIR } from "./paths";
import { dirSize } from "./diskUsage";
import { isJobRunning } from "./jobControl";
import { isSourceInFlight } from "./sourceCache";
import { forgetJob } from "./jobStore";
import { forgetCompilation, getCompilation } from "./compilationStore";

/**
 * Disk garbage collection. The `data/` tree grows without bound otherwise —
 * every processed video leaves a full-resolution source download plus its cuts.
 * We prune by age, and optionally enforce a total-size cap (oldest first).
 *
 *   DATA_TTL_DAYS     idade máxima de um item ocioso (default 7, 0 desliga a poda por idade)
 *   DATA_MAX_GB       teto do data/ inteiro (default 0 = sem teto)
 *   DATA_SWEEP_HOURS  intervalo entre varreduras (default 6)
 */
const DAY = 86_400_000;
const TTL_MS = (Number(process.env.DATA_TTL_DAYS) || 7) * DAY;
const MAX_BYTES = (Number(process.env.DATA_MAX_GB) || 0) * 1024 ** 3;
const SWEEP_MS = Math.max(0.25, Number(process.env.DATA_SWEEP_HOURS) || 6) * 3_600_000;

type Kind = "source" | "output" | "upload" | "compilation";

type Entry = {
  kind: Kind;
  id: string;
  path: string;
  isDir: boolean;
  mtimeMs: number;
  size: number;
  /** Currently being written / read — never delete. */
  locked: boolean;
};

function scan(dir: string, kind: Kind, isLocked: (id: string) => boolean): Entry[] {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Entry[] = [];
  for (const e of names) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    // The stores keep a sibling `<id>.json` manifest next to the `<id>/` dir.
    if (!e.isDirectory() && e.name.endsWith(".json")) continue;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    const id = e.isDirectory() ? e.name : e.name.replace(/\.[^.]+$/, "");
    out.push({
      kind,
      id,
      path: full,
      isDir: e.isDirectory(),
      mtimeMs: stat.mtimeMs,
      size: e.isDirectory() ? dirSize(full) : stat.size,
      locked: isLocked(id),
    });
  }
  return out;
}

function remove(entry: Entry): void {
  try {
    fs.rmSync(entry.path, { recursive: true, force: true });
  } catch {
    return;
  }
  if (entry.kind === "output") forgetJob(entry.id);
  if (entry.kind === "compilation") forgetCompilation(entry.id);
}

export type SweepOptions = { now?: number; ttlMs?: number; maxBytes?: number };

/** One sweep. Returns how many entries were removed and bytes freed. */
export function sweepData(opts: SweepOptions = {}): { removed: number; freed: number } {
  const now = opts.now ?? Date.now();
  const ttlMs = opts.ttlMs ?? TTL_MS;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;

  const entries = [
    ...scan(SOURCES_DIR, "source", isSourceInFlight),
    ...scan(OUTPUT_DIR, "output", isJobRunning),
    ...scan(UPLOADS_DIR, "upload", () => false),
    ...scan(COMPILATIONS_DIR, "compilation", (id) => getCompilation(id)?.phase === "processing"),
  ];

  let removed = 0;
  let freed = 0;
  const survivors: Entry[] = [];

  for (const e of entries) {
    if (e.locked) {
      survivors.push(e);
      continue;
    }
    if (ttlMs > 0 && now - e.mtimeMs > ttlMs) {
      remove(e);
      removed += 1;
      freed += e.size;
    } else {
      survivors.push(e);
    }
  }

  // Size cap: drop the oldest survivors until the tree is under the limit.
  if (maxBytes > 0) {
    let total = survivors.reduce((s, e) => s + e.size, 0);
    survivors.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const e of survivors) {
      if (total <= maxBytes) break;
      if (e.locked) continue;
      remove(e);
      removed += 1;
      freed += e.size;
      total -= e.size;
    }
  }

  if (removed > 0) {
    console.log(`[gc] removidos ${removed} itens, ${(freed / 1024 ** 2).toFixed(0)} MB liberados`);
  }
  return { removed, freed };
}

/** Run one sweep now, then every DATA_SWEEP_HOURS. Call once on boot. */
export function startDiskGc(): void {
  if (TTL_MS <= 0 && MAX_BYTES <= 0) return;
  const tick = () => {
    try {
      sweepData();
    } catch (err) {
      console.warn("[gc] varredura falhou:", (err as Error).message);
    }
  };
  tick();
  const timer = setInterval(tick, SWEEP_MS);
  timer.unref?.();
}
