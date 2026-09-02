import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import archiver from "archiver";
import { z } from "zod";
import type { Job } from "../../shared/types";
import { validateCut } from "../../shared/time";
import {
  createJob,
  emit,
  emitterFor,
  forgetJob,
  getJob,
  listJobs,
  patchJob,
} from "../core/jobStore";
import { runPipeline } from "../core/pipeline";
import { cancelJob } from "../core/jobControl";
import { outputDir } from "../core/paths";
import { bundleName, dateStamp } from "../../shared/filename";
import { isSupportedSourceUrl } from "../../shared/videoSource";

const cutSchema = z.object({
  id: z.string().min(1),
  start: z.string(),
  end: z.string(),
  name: z.string().optional(),
});

const watermarkSchema = z.object({
  text: z.string().max(200).optional(),
  imageId: z.string().max(200).optional(),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
  opacity: z.number().min(0).max(1),
  scale: z.number().min(0.02).max(1).optional(),
});

const projectSchema = z.object({
  id: z.string().min(1),
  sourceUrl: z.string().refine(isSupportedSourceUrl, "URL de vídeo inválida"),
  name: z.string().optional(),
  title: z.string().optional(),
  duration: z.number().nonnegative().optional(),
  thumbnail: z.string().optional(),
  cutMode: z.enum(["fast", "precise"]),
  format: z.enum(["mp4", "webm", "gif", "mp3"]).optional(),
  watermark: watermarkSchema
    .refine((w) => Boolean(w.text?.trim()) || Boolean(w.imageId), "Marca d'água vazia")
    .optional(),
  cuts: z.array(cutSchema).min(1),
});

export const jobsRouter = Router();

jobsRouter.get("/", (_req, res) => {
  res.json(listJobs());
});

jobsRouter.post("/", (req, res) => {
  const parsed = projectSchema.safeParse(req.body?.project);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.issues[0]?.message ?? "Projeto inválido" });
  }
  const project = parsed.data;

  for (let i = 0; i < project.cuts.length; i++) {
    const c = project.cuts[i];
    const v = validateCut(c.start, c.end, project.duration);
    if (!v.ok) {
      return res.status(422).json({ error: `Corte ${i + 1}: ${v.reason}` });
    }
  }

  const job: Job = {
    id: project.id,
    createdAt: new Date().toISOString(),
    project,
    phase: "downloading",
    downloadPercent: 0,
    cuts: project.cuts.map((c, i) => ({
      id: c.id,
      position: i + 1,
      fileName: "",
      status: "pending",
      percent: 0,
    })),
  };
  createJob(job);
  void runPipeline(job);
  res.status(201).json({ jobId: job.id });
});

jobsRouter.get("/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job não encontrado" });
  res.json(job);
});

jobsRouter.get("/:id/events", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job não encontrado" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  // Sync late subscribers with current state, then stream live events.
  if (job.phase === "done") {
    res.write(`data: ${JSON.stringify({ type: "job-done", job })}\n\n`);
  } else if (job.phase === "failed") {
    res.write(`data: ${JSON.stringify({ type: "job-failed", job })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ type: "snapshot", job })}\n\n`);
  }

  const em = emitterFor(job.id);
  const onEvent = (payload: unknown) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  em.on("event", onEvent);

  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    clearInterval(keepAlive);
    em.off("event", onEvent);
  });
});

function cutFilePath(jobId: string, position: number): string | undefined {
  const job = getJob(jobId);
  const cut = job?.cuts.find((c) => c.position === position && c.status === "done" && c.fileName);
  if (!cut) return undefined;
  const p = path.join(outputDir(jobId), cut.fileName);
  return fs.existsSync(p) ? p : undefined;
}

jobsRouter.get("/:id/files/:position", (req, res) => {
  const p = cutFilePath(req.params.id, Number(req.params.position));
  if (!p) return res.status(404).json({ error: "Arquivo não disponível" });
  res.download(p, path.basename(p));
});

// Inline (range-enabled) streaming for the in-page <video> previews.
jobsRouter.get("/:id/preview/:position", (req, res) => {
  const p = cutFilePath(req.params.id, Number(req.params.position));
  if (!p) return res.status(404).json({ error: "Arquivo não disponível" });
  res.sendFile(p);
});

// Cancel a running job — kills the current ffmpeg and marks the job failed.
jobsRouter.post("/:id/cancel", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job não encontrado" });
  if (job.phase === "done" || job.phase === "failed") {
    return res.status(409).json({ error: "O processamento já terminou" });
  }
  cancelJob(job.id);
  const updated =
    patchJob(job.id, (j) => {
      j.phase = "failed";
      j.error = "Geração dos cortes cancelada.";
      for (const c of j.cuts) {
        if (c.status === "processing" || c.status === "pending") {
          c.status = "error";
          c.error = "Cancelado";
        }
      }
    }) ?? job;
  emit(job.id, { type: "job-failed", job: updated });
  res.json(updated);
});

// Remove a single cut from a finished job: delete its file and drop it from the
// manifest. Other cuts keep their positions (used by the preview/download URLs).
jobsRouter.delete("/:id/cuts/:position", (req, res) => {
  const jobId = req.params.id;
  const position = Number(req.params.position);
  const job = getJob(jobId);
  if (!job) return res.status(404).json({ error: "Job não encontrado" });
  const cut = job.cuts.find((c) => c.position === position);
  if (!cut) return res.status(404).json({ error: "Corte não encontrado" });

  if (cut.fileName) {
    try {
      fs.rmSync(path.join(outputDir(jobId), cut.fileName), { force: true });
    } catch {
      /* file may already be gone */
    }
  }

  const updated = patchJob(jobId, (j) => {
    j.cuts = j.cuts.filter((c) => c.position !== position);
  });
  if (updated) emit(jobId, { type: "snapshot", job: updated });
  res.json(updated);
});

// Drop a whole job: kill it if still running, delete its cut files, forget the
// manifest. Used when a project is re-processed — only the latest generation of
// clips should linger in the montage pool.
jobsRouter.delete("/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job não encontrado" });
  if (job.phase === "downloading" || job.phase === "cutting") {
    cancelJob(job.id);
  }
  try {
    fs.rmSync(outputDir(job.id), { recursive: true, force: true });
  } catch {
    /* already gone */
  }
  forgetJob(job.id);
  res.json({ ok: true });
});

jobsRouter.get("/:id/download-all", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job não encontrado" });
  const files = job.cuts
    .filter((c) => c.status === "done" && c.fileName)
    .map((c) => path.join(outputDir(job.id), c.fileName))
    .filter((p) => fs.existsSync(p));
  if (files.length === 0) return res.status(404).json({ error: "Nenhum arquivo pronto" });

  res.attachment(
    bundleName(job.project.name || job.project.title, dateStamp(new Date(job.createdAt)), "zip"),
  );
  const archive = archiver("zip", { zlib: { level: 0 } });
  archive.on("error", () => res.destroy());
  archive.pipe(res);
  for (const f of files) archive.file(f, { name: path.basename(f) });
  void archive.finalize();
});
