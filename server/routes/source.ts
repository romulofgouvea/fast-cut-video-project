import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { cachedSourcePath, sourceStatus } from "../core/sourceCache";
import { cachedPeaks } from "../core/waveform";
import { isSupportedSourceUrl } from "../../shared/videoSource";

/** Any http(s) URL or a `local:<id>` upload reference. */
function readUrl(req: { query: Record<string, unknown> }): string | null {
  const url = String(req.query.url ?? "");
  return isSupportedSourceUrl(url) ? url : null;
}

export const sourceRouter = Router();

/**
 * Audio waveform (peak amplitude 0..1 per bucket) for the editor's timeline.
 * 404 until the source download finishes; the result is cached on disk.
 */
sourceRouter.get("/peaks", async (req, res) => {
  const url = readUrl(req);
  if (!url) return res.status(422).json({ error: "URL inválida" });

  const buckets = Math.min(4000, Math.max(200, Math.round(Number(req.query.n) || 1400)));

  if (sourceStatus(url).state !== "ready") {
    return res.status(404).json({ error: "Vídeo ainda não baixado" });
  }
  const file = cachedSourcePath(url);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Vídeo ainda não baixado" });

  try {
    const peaks = await cachedPeaks(file, path.dirname(file), buckets);
    res.json({ peaks });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * Stream the cached source video so the editor can preview *any* provider with a
 * real `<video>` element (scrub, mark in/out) once the background download from
 * `POST /api/prefetch` has finished. 404 until then. Express' `sendFile` handles
 * HTTP range requests, so seeking works without downloading the whole file.
 */
sourceRouter.get("/", (req, res) => {
  const url = readUrl(req);
  if (!url) return res.status(422).json({ error: "URL inválida" });

  if (sourceStatus(url).state !== "ready") {
    return res.status(404).json({ error: "Vídeo ainda não baixado" });
  }

  const file = cachedSourcePath(url);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "Vídeo ainda não baixado" });
  }

  const type =
    { ".webm": "video/webm", ".mov": "video/quicktime", ".mkv": "video/x-matroska" }[
      path.extname(file).toLowerCase()
    ] ?? "video/mp4";
  res.sendFile(file, { headers: { "Content-Type": type } }, (err) => {
    if (err && !res.headersSent) res.status(500).end();
  });
});
