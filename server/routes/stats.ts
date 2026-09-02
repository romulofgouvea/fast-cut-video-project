import { Router } from "express";
import type { KeptRefs, Stats } from "../../shared/types";
import { listJobs } from "../core/jobStore";
import { listCompilations } from "../core/compilationStore";
import { diskUsage } from "../core/diskUsage";
import { findOrphans, keptFilter } from "../core/maintenance";

export const statsRouter = Router();

const CACHE_MS = 8_000;
let cache: { at: number; key: string; value: Stats } | undefined;

/** Drop the memoized stats so the next request recomputes (e.g. after a purge). */
export function invalidateStatsCache(): void {
  cache = undefined;
}

function compute(kept: KeptRefs): Stats {
  const f = keptFilter(kept);
  const jobs = listJobs();
  const stats: Stats = {
    jobs: { total: jobs.length, done: 0, failed: 0, running: 0 },
    cuts: { total: 0, done: 0 },
    clips: 0,
    compilations: { total: 0, done: 0, failed: 0 },
    disk: diskUsage(),
    orphans: { jobs: 0, compilations: 0, bytes: 0 },
  };

  for (const job of jobs) {
    if (job.phase === "done") stats.jobs.done += 1;
    else if (job.phase === "failed") stats.jobs.failed += 1;
    else stats.jobs.running += 1;

    // Cuts / clips only count jobs the client still keeps.
    if (f.active && !f.keepsJob(job.id)) continue;
    for (const cut of job.cuts) {
      stats.cuts.total += 1;
      if (cut.status === "done") {
        stats.cuts.done += 1;
        if (cut.fileName) stats.clips += 1;
      }
    }
  }

  for (const c of listCompilations()) {
    stats.compilations.total += 1;
    if (f.active && !f.keepsCompilation(c.id)) continue;
    if (c.phase === "done") stats.compilations.done += 1;
    else if (c.phase === "failed") stats.compilations.failed += 1;
  }

  if (f.active) {
    const o = findOrphans(kept);
    stats.orphans = { jobs: o.jobs, compilations: o.compilations, bytes: o.bytes };
  }

  return stats;
}

/**
 * System-wide counters for the Home dashboard. POST a `KeptRefs` body so cuts /
 * merged-videos / reclaimable-disk reflect only what the client still references;
 * an empty body (or GET) returns raw totals. The disk scan is synchronous and
 * walks the whole `data/` tree, so results are cached briefly.
 */
function handle(kept: KeptRefs, res: import("express").Response) {
  const key = JSON.stringify(kept);
  const now = Date.now();
  if (!cache || cache.key !== key || now - cache.at > CACHE_MS) {
    cache = { at: now, key, value: compute(kept) };
  }
  res.json(cache.value);
}

statsRouter.get("/", (_req, res) => handle({}, res));
statsRouter.post("/", (req, res) => handle((req.body ?? {}) as KeptRefs, res));
