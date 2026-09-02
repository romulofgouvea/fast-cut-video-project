import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import type { Job, JobEvent } from "../../shared/types";
import { JOBS_DIR, jobManifest } from "./paths";

const jobs = new Map<string, Job>();
const emitters = new Map<string, EventEmitter>();

export function emitterFor(jobId: string): EventEmitter {
  let em = emitters.get(jobId);
  if (!em) {
    em = new EventEmitter();
    em.setMaxListeners(50);
    emitters.set(jobId, em);
  }
  return em;
}

function persist(job: Job): void {
  const file = jobManifest(job.id);
  const tmp = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, file);
}

export function createJob(job: Job): Job {
  jobs.set(job.id, job);
  persist(job);
  return job;
}

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Mutate a job in place, persist the new state, and optionally broadcast an
 * SSE event to listeners.
 */
export function patchJob(
  jobId: string,
  updater: (job: Job) => void,
  event?: JobEvent,
): Job | undefined {
  const job = jobs.get(jobId);
  if (!job) return undefined;
  updater(job);
  persist(job);
  if (event) emitterFor(jobId).emit("event", event);
  return job;
}

export function emit(jobId: string, event: JobEvent): void {
  emitterFor(jobId).emit("event", event);
}

/** Drop a job from memory + disk (used by the disk GC). */
export function forgetJob(jobId: string): void {
  jobs.delete(jobId);
  emitters.delete(jobId);
  try {
    fs.rmSync(jobManifest(jobId), { force: true });
  } catch {
    /* ignore */
  }
}

/** Load persisted manifests on boot; interrupted jobs become "failed". */
export function rehydrate(): void {
  let files: string[];
  try {
    files = fs.readdirSync(JOBS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  for (const f of files) {
    try {
      const job = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, f), "utf8")) as Job;
      if (job.phase === "downloading" || job.phase === "cutting") {
        job.phase = "failed";
        job.error = "Processamento interrompido (servidor reiniciado). Reprocesse o projeto.";
      }
      jobs.set(job.id, job);
    } catch {
      /* skip corrupt manifest */
    }
  }
}
