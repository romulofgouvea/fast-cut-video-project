import type {
  Compilation,
  CompilationEvent,
  CompilationItem,
  Job,
  JobEvent,
  KeptRefs,
  PoolClip,
  Stats,
  VideoInfo,
  VideoProject,
} from "../../shared/types";

async function jsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Erro ${res.status}`);
  }
  return body;
}

export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  let lastErr: unknown;
  // yt-dlp metadata calls are flaky for some sites (Instagram especially); a
  // single transient network failure shouldn't dead-end the editor.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/video-info", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      return (await jsonOrThrow(res)) as VideoInfo;
    } catch (err) {
      lastErr = err;
      // Retry only a dropped connection (TypeError), not a 4xx/5xx from the server.
      if (err instanceof TypeError && attempt === 0) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      break;
    }
  }
  if (lastErr instanceof TypeError) {
    throw new Error("não foi possível falar com o servidor — ele está rodando?");
  }
  throw lastErr;
}

export type SourceStatus = {
  state: "idle" | "downloading" | "ready" | "error";
  percent: number;
  error?: string;
};

/**
 * Ask the server to start downloading a source video now (fired once the first
 * cut exists) so "Processar" only has to cut. Best-effort — failures are ignored
 * here and surfaced later by the real job.
 */
export async function prefetchSource(url: string): Promise<void> {
  try {
    await fetch("/api/prefetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    /* best effort */
  }
}

/** Stream URL for the cached source video (works only once it's downloaded). */
export function sourceStreamUrl(url: string): string {
  return `/api/source?url=${encodeURIComponent(url)}`;
}

/** How far the background pre-download has got. */
export async function prefetchStatus(url: string): Promise<SourceStatus> {
  try {
    const res = await fetch(`/api/prefetch?url=${encodeURIComponent(url)}`);
    if (!res.ok) return { state: "idle", percent: 0 };
    return (await res.json()) as SourceStatus;
  } catch {
    return { state: "idle", percent: 0 };
  }
}

export async function createJob(project: VideoProject): Promise<{ jobId: string }> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project }),
  });
  return (await jsonOrThrow(res)) as { jobId: string };
}

/** Delete a job entirely (files + manifest). Best-effort — errors are swallowed. */
export async function deleteJob(jobId: string): Promise<void> {
  try {
    await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
  } catch {
    /* best effort — the disk GC will catch it later */
  }
}

/** Cancel a running job (kills the current ffmpeg). Returns the updated job. */
export async function cancelJob(jobId: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
  return (await jsonOrThrow(res)) as Job;
}

export async function getJob(jobId: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${jobId}`);
  return (await jsonOrThrow(res)) as Job;
}

export async function listJobs(): Promise<Job[]> {
  const res = await fetch("/api/jobs");
  return (await jsonOrThrow(res)) as Job[];
}

/**
 * Subscribe to job progress via SSE. Returns an unsubscribe function.
 * Falls back to polling if the EventSource errors out.
 */
export function subscribeJob(
  jobId: string,
  onEvent: (ev: JobEvent) => void,
  onError?: (err: Error) => void,
): () => void {
  let closed = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const es = new EventSource(`/api/jobs/${jobId}/events`);
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as JobEvent);
    } catch {
      /* ignore malformed frame */
    }
  };
  es.onerror = () => {
    es.close();
    if (closed || pollTimer) return;
    // Fallback: poll the snapshot endpoint.
    pollTimer = setInterval(async () => {
      try {
        const job = await getJob(jobId);
        onEvent({ type: job.phase === "failed" ? "job-failed" : "job-done", job } as JobEvent);
        if (job.phase === "done" || job.phase === "failed") {
          clearInterval(pollTimer);
        }
      } catch (err) {
        onError?.(err as Error);
      }
    }, 2000);
  };

  return () => {
    closed = true;
    es.close();
    if (pollTimer) clearInterval(pollTimer);
  };
}

/** Remove one cut from a finished job (deletes its file). Returns the updated job. */
export async function deleteCut(jobId: string, position: number): Promise<Job> {
  const res = await fetch(`/api/jobs/${jobId}/cuts/${position}`, { method: "DELETE" });
  return (await jsonOrThrow(res)) as Job;
}

export function fileUrl(jobId: string, position: number): string {
  return `/api/jobs/${jobId}/files/${position}`;
}

export function previewUrl(jobId: string, position: number): string {
  return `/api/jobs/${jobId}/preview/${position}`;
}

/** Inline stream URL for an uploaded clip (used by montage previews). */
export function uploadPreviewUrl(uploadId: string): string {
  return `/api/uploads/${uploadId}`;
}

export function downloadAllUrl(jobId: string): string {
  return `/api/jobs/${jobId}/download-all`;
}

/* --------------------------- Final-video montage --------------------------- */

export async function listClips(): Promise<PoolClip[]> {
  const res = await fetch("/api/clips");
  return (await jsonOrThrow(res)) as PoolClip[];
}

export async function uploadClip(file: File): Promise<{ uploadId: string; originalName: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  return (await jsonOrThrow(res)) as { uploadId: string; originalName: string };
}

/** Upload a small logo/image for a watermark. */
export async function uploadWatermarkImage(
  file: File,
): Promise<{ uploadId: string; originalName: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/uploads/image", { method: "POST", body: form });
  return (await jsonOrThrow(res)) as { uploadId: string; originalName: string };
}

export async function createCompilation(payload: {
  name?: string;
  items: CompilationItem[];
}): Promise<{ id: string }> {
  const res = await fetch("/api/compilations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await jsonOrThrow(res)) as { id: string };
}

export async function getCompilation(id: string): Promise<Compilation> {
  const res = await fetch(`/api/compilations/${id}`);
  return (await jsonOrThrow(res)) as Compilation;
}

/** Every known compilation, newest first — used to rehydrate montage card status. */
export async function listCompilations(): Promise<Compilation[]> {
  const res = await fetch("/api/compilations");
  return (await jsonOrThrow(res)) as Compilation[];
}

/** System-wide counters for the Home dashboard, scoped to what the client keeps. */
export async function getStats(kept: KeptRefs): Promise<Stats> {
  const res = await fetch("/api/stats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(kept),
  });
  return (await jsonOrThrow(res)) as Stats;
}

/** Delete every job / compilation / source on disk the client no longer references. */
export async function purgeDisk(kept: KeptRefs): Promise<{ removed: number; freed: number }> {
  const res = await fetch("/api/maintenance/purge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(kept),
  });
  return (await jsonOrThrow(res)) as { removed: number; freed: number };
}

export function subscribeCompilation(
  id: string,
  onEvent: (ev: CompilationEvent) => void,
  onError?: (err: Error) => void,
): () => void {
  let closed = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const es = new EventSource(`/api/compilations/${id}/events`);
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as CompilationEvent);
    } catch {
      /* ignore malformed frame */
    }
  };
  es.onerror = () => {
    es.close();
    if (closed || pollTimer) return;
    pollTimer = setInterval(async () => {
      try {
        const compilation = await getCompilation(id);
        onEvent({
          type: compilation.phase === "failed" ? "failed" : "done",
          compilation,
        } as CompilationEvent);
        if (compilation.phase === "done" || compilation.phase === "failed") {
          clearInterval(pollTimer);
        }
      } catch (err) {
        onError?.(err as Error);
      }
    }, 2000);
  };

  return () => {
    closed = true;
    es.close();
    if (pollTimer) clearInterval(pollTimer);
  };
}

export function compilationDownloadUrl(id: string): string {
  return `/api/compilations/${id}/download`;
}
