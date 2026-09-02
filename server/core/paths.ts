import path from "node:path";
import fs from "node:fs";

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), "data");

export const SOURCES_DIR = path.join(DATA_DIR, "sources");
export const OUTPUT_DIR = path.join(DATA_DIR, "output");
export const JOBS_DIR = path.join(DATA_DIR, "jobs");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const COMPILATIONS_DIR = path.join(DATA_DIR, "compilations");

export function ensureDirs(): void {
  for (const dir of [SOURCES_DIR, OUTPUT_DIR, JOBS_DIR, UPLOADS_DIR, COMPILATIONS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function sourceDir(jobId: string): string {
  return path.join(SOURCES_DIR, jobId);
}

export function sourceFile(jobId: string): string {
  return path.join(sourceDir(jobId), "source.mp4");
}

export function outputDir(jobId: string): string {
  return path.join(OUTPUT_DIR, jobId);
}

export function jobManifest(jobId: string): string {
  return path.join(JOBS_DIR, `${jobId}.json`);
}

/** First file in UPLOADS_DIR whose name starts with the id (extension varies). */
export function findUpload(uploadId: string): string | undefined {
  try {
    const f = fs.readdirSync(UPLOADS_DIR).find((n) => n.startsWith(uploadId));
    return f ? path.join(UPLOADS_DIR, f) : undefined;
  } catch {
    return undefined;
  }
}

export function compilationDir(id: string): string {
  return path.join(COMPILATIONS_DIR, id);
}

export function compilationFile(id: string): string {
  return path.join(compilationDir(id), "final.mp4");
}

export function compilationManifest(id: string): string {
  return path.join(COMPILATIONS_DIR, `${id}.json`);
}
