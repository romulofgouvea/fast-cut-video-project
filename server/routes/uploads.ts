import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { UPLOADS_DIR, findUpload } from "../core/paths";

const ALLOWED_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);
const MAX_BYTES = 512 * 1024 * 1024; // 512 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const okExt = ALLOWED_EXT.has(ext);
    const okMime =
      file.mimetype.startsWith("video/") || file.mimetype === "application/octet-stream";
    cb(null, okExt && okMime);
  },
});

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const imageUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, IMAGE_EXT.has(ext) && file.mimetype.startsWith("image/"));
  },
});

export const uploadsRouter = Router();

/** Small image (logo) for a watermark. */
uploadsRouter.post("/image", (req, res) => {
  imageUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Falha no upload";
      return res.status(422).json({ error: msg });
    }
    if (!req.file) return res.status(422).json({ error: "Envie uma imagem (PNG/JPG/WebP)." });
    const uploadId = path.basename(req.file.filename, path.extname(req.file.filename));
    res.status(201).json({ uploadId, originalName: req.file.originalname });
  });
});

uploadsRouter.post("/", (req, res) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Falha no upload";
      return res.status(422).json({ error: msg });
    }
    if (!req.file) {
      return res.status(422).json({ error: "Envie um arquivo de vídeo válido." });
    }
    const uploadId = path.basename(req.file.filename, path.extname(req.file.filename));
    res.status(201).json({ uploadId, originalName: req.file.originalname });
  });
});

// Inline (range-enabled) streaming so uploaded clips get a preview in the montage.
uploadsRouter.get("/:id", (req, res) => {
  const p = findUpload(req.params.id);
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: "Arquivo não encontrado" });
  res.sendFile(p);
});
