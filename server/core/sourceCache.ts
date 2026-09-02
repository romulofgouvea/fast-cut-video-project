import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { detectSource } from "../../shared/videoSource";
import { parseLocalSource } from "../../shared/localSource";
import { SOURCES_DIR, findUpload } from "./paths";
import { download } from "./ytdlp";

/**
 * A downloaded source video is cached by the *video*, not by the job — so the
 * editor can pre-download it while cuts are still being marked, and a reprocess
 * (which gets a fresh job id) reuses the file instead of downloading again.
 */

/** Stable cache key for a URL: the provider-native id when we can read one, else a hash. */
export function sourceKey(url: string): string {
  const s = detectSource(url);
  if (s.id) return s.provider === "youtube" ? s.id : `${s.provider}-${s.id}`;
  return "url-" + crypto.createHash("sha1").update(url.trim()).digest("hex").slice(0, 16);
}

/**
 * Where the source video for `url` lives. An uploaded file (`local:<id>`) is used
 * in place — there's nothing to download and nothing to cache.
 */
export function cachedSourcePath(url: string): string {
  const uploadId = parseLocalSource(url);
  if (uploadId)
    return findUpload(uploadId) ?? path.join(SOURCES_DIR, `upload-${uploadId}`, "missing");
  return path.join(SOURCES_DIR, sourceKey(url), "source.mp4");
}

type Pending = {
  promise: Promise<string>;
  percent: number;
  listeners: Set<(percent: number) => void>;
};

const inFlight = new Map<string, Pending>();
/** Last download error per cache key, so the editor can show it instead of hanging. */
const failures = new Map<string, string>();

export type SourceStatus = {
  state: "idle" | "downloading" | "ready" | "error";
  percent: number;
  error?: string;
};

/** Where the download for `url` stands right now (for the editor's status line). */
export function sourceStatus(url: string): SourceStatus {
  if (parseLocalSource(url)) {
    const file = cachedSourcePath(url);
    return fs.existsSync(file) ? { state: "ready", percent: 100 } : { state: "idle", percent: 0 };
  }
  const key = sourceKey(url);
  if (fs.existsSync(path.join(SOURCES_DIR, key, "source.mp4"))) {
    return { state: "ready", percent: 100 };
  }
  const pending = inFlight.get(key);
  if (pending) return { state: "downloading", percent: Math.round(pending.percent) };
  const error = failures.get(key);
  if (error) return { state: "error", percent: 0, error };
  return { state: "idle", percent: 0 };
}

/**
 * Ensure the source video for `url` is on disk and return its path.
 *
 * Concurrent callers for the same video share a single download (and its
 * progress); a finished file is reused across jobs and server restarts. Safe to
 * call speculatively — see `POST /api/prefetch`.
 */
export function ensureSource(url: string, onProgress?: (percent: number) => void): Promise<string> {
  if (parseLocalSource(url)) {
    const file = cachedSourcePath(url);
    if (!fs.existsSync(file)) {
      return Promise.reject(new Error("Arquivo enviado não encontrado (foi limpo do servidor?)."));
    }
    onProgress?.(100);
    return Promise.resolve(file);
  }

  const key = sourceKey(url);
  const dest = path.join(SOURCES_DIR, key, "source.mp4");

  if (fs.existsSync(dest)) {
    onProgress?.(100);
    return Promise.resolve(dest);
  }

  const existing = inFlight.get(key);
  if (existing) {
    if (onProgress) {
      existing.listeners.add(onProgress);
      onProgress(existing.percent);
    }
    return existing.promise;
  }

  // Fresh attempt — drop any error from a previous try so a retry starts clean.
  failures.delete(key);

  const pending: Pending = {
    percent: 0,
    listeners: new Set(onProgress ? [onProgress] : []),
    promise: Promise.resolve(dest), // replaced below
  };

  pending.promise = download(url, dest, (percent) => {
    pending.percent = percent;
    for (const listener of pending.listeners) listener(percent);
  })
    .then(() => {
      for (const listener of pending.listeners) listener(100);
      return dest;
    })
    .catch((err) => {
      failures.set(key, (err as Error).message || "Falha ao baixar o vídeo.");
      throw err;
    })
    .finally(() => {
      inFlight.delete(key);
      pending.listeners.clear();
    });

  inFlight.set(key, pending);
  return pending.promise;
}

/** True while a download for this cache key is running (used by the disk GC). */
export function isSourceInFlight(key: string): boolean {
  return inFlight.has(key);
}

/** Fire-and-forget pre-download; errors are swallowed (the job will surface them). */
export function prefetchSource(url: string): void {
  ensureSource(url).catch(() => {
    /* the real processing run reports download failures to the user */
  });
}
