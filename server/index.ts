import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { ensureDirs } from "./core/paths";
import { rehydrate } from "./core/jobStore";
import { rehydrate as rehydrateCompilations } from "./core/compilationStore";
import { startDiskGc } from "./core/gc";
import { videoInfoRouter } from "./routes/videoInfo";
import { prefetchRouter } from "./routes/prefetch";
import { sourceRouter } from "./routes/source";
import { jobsRouter } from "./routes/jobs";
import { clipsRouter } from "./routes/clips";
import { uploadsRouter } from "./routes/uploads";
import { compilationsRouter } from "./routes/compilations";
import { statsRouter } from "./routes/stats";
import { maintenanceRouter } from "./routes/maintenance";

const PORT = Number(process.env.PORT) || 5000;
// Desktop (Tauri) passes HOST=127.0.0.1 so the sidecar is not reachable off-box.
const HOST = process.env.HOST || "0.0.0.0";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

ensureDirs();
rehydrate();
rehydrateCompilations();
startDiskGc();

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/video-info", videoInfoRouter);
app.use("/api/prefetch", prefetchRouter);
app.use("/api/source", sourceRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/clips", clipsRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/compilations", compilationsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/maintenance", maintenanceRouter);

// Serve the built SPA (dist/public) in production. PUBLIC_DIR lets the Tauri
// desktop shell point at the SPA it ships as a bundled resource.
const publicDir = process.env.PUBLIC_DIR
  ? path.resolve(process.env.PUBLIC_DIR)
  : path.resolve(__dirname, "../public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`fast-cut-video ouvindo em http://${HOST}:${PORT}`);
});
