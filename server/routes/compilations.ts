import crypto from "node:crypto";
import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";
import type { Compilation } from "../../shared/types";
import { bundleName, dateStamp, safeDownloadName } from "../../shared/filename";
import {
  createCompilation,
  emitterFor,
  getCompilation,
  listCompilations,
} from "../core/compilationStore";
import { compilationBaseName, runCompilation } from "../core/compilationPipeline";
import { compilationFile } from "../core/paths";

const itemSchema = z.union([
  z.object({
    kind: z.literal("cut"),
    jobId: z.string().min(1),
    position: z.number().int().positive(),
  }),
  z.object({ kind: z.literal("upload"), uploadId: z.string().min(1) }),
]);

const bodySchema = z.object({
  name: z.string().optional(),
  items: z.array(itemSchema).min(2, "Escolha pelo menos 2 clipes."),
});

export const compilationsRouter = Router();

compilationsRouter.post("/", (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.issues[0]?.message ?? "Montagem inválida" });
  }
  const compilation: Compilation = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: parsed.data.name,
    items: parsed.data.items,
    phase: "processing",
    percent: 0,
  };
  createCompilation(compilation);
  void runCompilation(compilation);
  res.status(201).json({ id: compilation.id });
});

/** Every known compilation, newest first — the montage gallery uses this to rehydrate status. */
compilationsRouter.get("/", (_req, res) => {
  res.json(listCompilations());
});

compilationsRouter.get("/:id", (req, res) => {
  const c = getCompilation(req.params.id);
  if (!c) return res.status(404).json({ error: "Montagem não encontrada" });
  res.json(c);
});

compilationsRouter.get("/:id/events", (req, res) => {
  const c = getCompilation(req.params.id);
  if (!c) return res.status(404).json({ error: "Montagem não encontrada" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  const initial =
    c.phase === "done"
      ? { type: "done", compilation: c }
      : c.phase === "failed"
        ? { type: "failed", compilation: c }
        : { type: "snapshot", compilation: c };
  res.write(`data: ${JSON.stringify(initial)}\n\n`);

  const em = emitterFor(c.id);
  const onEvent = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  em.on("event", onEvent);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15000);
  req.on("close", () => {
    clearInterval(keepAlive);
    em.off("event", onEvent);
  });
});

compilationsRouter.get("/:id/download", (req, res) => {
  const c = getCompilation(req.params.id);
  if (!c || c.phase !== "done") {
    return res.status(404).json({ error: "Vídeo final não disponível" });
  }
  const file = compilationFile(c.id);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "Arquivo não encontrado" });
  }
  // The montage's name only exists in the browser, so trust `?name=` (hardened)
  // when the client sends it; otherwise fall back to the source-project name.
  const fallback = bundleName(compilationBaseName(c), dateStamp(new Date(c.createdAt)), "mp4");
  const proposed = typeof req.query.name === "string" ? req.query.name : undefined;
  res.download(file, safeDownloadName(proposed, fallback));
});
