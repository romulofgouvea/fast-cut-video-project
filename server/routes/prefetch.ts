import { Router } from "express";
import { z } from "zod";
import { prefetchSource, sourceStatus } from "../core/sourceCache";
import { isSupportedSourceUrl } from "../../shared/videoSource";

// Accepts any http(s) URL or a `local:<id>` upload reference.
const schema = z.object({ url: z.string().refine(isSupportedSourceUrl, "URL inválida") });

export const prefetchRouter = Router();

/**
 * Start downloading a source video ahead of time (called by the editor once the
 * first cut exists). Returns immediately; the download runs in the background and
 * the eventual "Processar" job reuses whatever is already on disk — it only cuts.
 */
prefetchRouter.post("/", (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: "URL inválida" });
  }
  prefetchSource(parsed.data.url);
  res.status(202).json({ ok: true });
});

/** Progress of that background download, for the editor's status line. */
prefetchRouter.get("/", (req, res) => {
  const url = String(req.query.url ?? "");
  if (!isSupportedSourceUrl(url)) return res.status(422).json({ error: "URL inválida" });
  res.json(sourceStatus(url));
});
