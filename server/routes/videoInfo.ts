import { Router } from "express";
import { z } from "zod";
import { dumpInfo } from "../core/ytdlp";
import { parseLocalSource } from "../../shared/localSource";
import { cachedSourcePath } from "../core/sourceCache";
import { probeDuration } from "../core/probe";
import fs from "node:fs";

// Any http(s) URL — yt-dlp supports ~1800 sites; it errors clearly if it can't.
// `local:<id>` is an uploaded file: probe it directly.
const bodySchema = z.object({
  url: z.string().min(1),
});

export const videoInfoRouter = Router();

videoInfoRouter.post("/", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.issues[0]?.message ?? "URL inválida" });
  }
  const { url } = parsed.data;

  if (parseLocalSource(url)) {
    const file = cachedSourcePath(url);
    if (!fs.existsSync(file))
      return res.status(422).json({ error: "Arquivo enviado não encontrado." });
    const duration = Math.round(await probeDuration(file));
    return res.json({ title: "Arquivo enviado", duration });
  }

  if (!z.string().url().safeParse(url).success) {
    return res.status(422).json({ error: "URL inválida" });
  }

  try {
    const info = await dumpInfo(url);
    res.json(info);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});
