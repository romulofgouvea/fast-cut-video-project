import { Router } from "express";
import type { PoolClip } from "../../shared/types";
import { listJobs } from "../core/jobStore";

export const clipsRouter = Router();

/** Every "done" cut across all jobs — the pool for the montage timeline. */
clipsRouter.get("/", (_req, res) => {
  const clips: PoolClip[] = [];
  for (const job of listJobs()) {
    const projectName = job.project.name?.trim() || job.project.title?.trim() || "Sem título";
    for (const cut of job.cuts) {
      if (cut.status !== "done" || !cut.fileName) continue;
      const projectCut = job.project.cuts.find((c) => c.id === cut.id);
      clips.push({
        jobId: job.id,
        position: cut.position,
        fileName: cut.fileName,
        name: projectCut?.name?.trim() || cut.fileName.replace(/\.[^.]+$/, ""),
        projectName,
      });
    }
  }
  res.json(clips);
});
