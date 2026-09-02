import fs from "node:fs";
import type { CutStatus, Job, OutputFormat } from "../../shared/types";
import { parseTimecode } from "../../shared/time";
import { outputDir, findUpload } from "./paths";
import { cachedSourcePath, ensureSource } from "./sourceCache";
import { buildCutArgs, runCut, type WatermarkArgs } from "./ffmpeg";
import { outputPath, pickCutFileName } from "./naming";
import { dateStamp } from "../../shared/filename";
import { emit, patchJob } from "./jobStore";
import { CancelledError, endJobControl, startJobControl, whenAborted } from "./jobControl";

/** Run the full pipeline for a job: download once, then generate every cut. */
export async function runPipeline(job: Job): Promise<void> {
  const jobId = job.id;
  const { signal } = startJobControl(jobId);
  const src = cachedSourcePath(job.project.sourceUrl);
  const dir = outputDir(jobId);
  fs.mkdirSync(dir, { recursive: true });
  patchJob(jobId, (j) => {
    j.sourcePath = src;
    j.outputDir = dir;
  });
  const date = dateStamp(new Date(job.createdAt));

  try {
    // 1. Get the source video. It is cached per-video, so this may already be
    //    done (or in progress) from the editor's pre-download — see sourceCache.
    //    A cancel during download stops the pipeline but leaves the shared
    //    download running (it's cached and useful to other jobs).
    let last = -1;
    await Promise.race([
      whenAborted(signal),
      ensureSource(job.project.sourceUrl, (percent) => {
        const rounded = Math.round(percent);
        if (rounded === last) return;
        last = rounded;
        patchJob(jobId, (j) => (j.downloadPercent = rounded), {
          type: "download-progress",
          percent: rounded,
        });
      }),
    ]);
    patchJob(
      jobId,
      (j) => {
        j.phase = "cutting";
        j.downloadPercent = 100;
      },
      { type: "download-progress", percent: 100 },
    );

    // 2. Process each cut sequentially, in array order.
    const reserved = new Set<string>();
    const cuts = job.project.cuts;
    const format: OutputFormat = job.project.format ?? "mp4";
    const ext = format;
    const wm = job.project.watermark;
    const watermark: WatermarkArgs | undefined = wm
      ? {
          text: wm.text,
          imagePath: wm.imageId ? findUpload(wm.imageId) : undefined,
          position: wm.position,
          opacity: wm.opacity,
          scale: wm.scale,
        }
      : undefined;

    for (let i = 0; i < cuts.length; i++) {
      if (signal.aborted) throw new CancelledError();
      const cut = cuts[i];
      const position = i + 1;
      const startSec = parseTimecode(cut.start) ?? 0;
      const endSec = parseTimecode(cut.end) ?? 0;
      const durationSec = Math.max(0, endSec - startSec);
      const fileName = pickCutFileName(
        {
          cutName: cut.name,
          projectName: job.project.name,
          title: job.project.title,
          date,
          ext,
        },
        dir,
        reserved,
      );

      const report = (status: CutStatus, percent: number, error?: string) =>
        patchJob(
          jobId,
          (j) => {
            const c = j.cuts.find((x) => x.position === position);
            if (c) {
              c.status = status;
              c.percent = percent;
              c.fileName = fileName;
              if (error) c.error = error;
            }
          },
          { type: "cut-progress", id: cut.id, position, status, percent, error },
        );

      report("processing", 0);
      try {
        const args = buildCutArgs({
          mode: job.project.cutMode,
          startSec,
          durationSec,
          input: src,
          output: outputPath(dir, fileName),
          format,
          watermark,
        });
        await runCut(args, durationSec, (p) => report("processing", Math.round(p)), signal);
        report("done", 100);
      } catch (err) {
        if (signal.aborted) throw new CancelledError();
        report("error", 0, (err as Error).message);
      }
    }

    const done = patchJob(jobId, (j) => (j.phase = "done"));
    if (done) emit(jobId, { type: "job-done", job: done });
  } catch (err) {
    const cancelled = err instanceof CancelledError || signal.aborted;
    const failed = patchJob(jobId, (j) => {
      j.phase = "failed";
      j.error = cancelled ? "Geração dos cortes cancelada." : (err as Error).message;
      if (cancelled) {
        for (const c of j.cuts) {
          if (c.status === "processing" || c.status === "pending") {
            c.status = "error";
            c.error = "Cancelado";
          }
        }
      }
    });
    if (failed) emit(jobId, { type: "job-failed", job: failed });
  } finally {
    endJobControl(jobId);
  }
}
