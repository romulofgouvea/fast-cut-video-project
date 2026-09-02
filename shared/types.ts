export type CutMode = "fast" | "precise";

/** Output container/codec for the generated cuts. */
export type OutputFormat = "mp4" | "webm" | "gif" | "mp3";

export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** Optional logo/text burned into every cut. */
export type Watermark = {
  /** Short overlay text (sanitized server-side). */
  text?: string;
  /** uploadId of an image (PNG/JPG) to overlay. */
  imageId?: string;
  position: WatermarkPosition;
  /** 0..1 */
  opacity: number;
  /** Image width as a fraction of the video width (default 0.16). */
  scale?: number;
};

/** A single cut interval. `start`/`end` are "HH:MM:SS" strings. */
export type VideoCut = {
  id: string;
  start: string;
  end: string;
  /** Optional user-given name; drives the output file name for this cut. */
  name?: string;
};

export type VideoProject = {
  id: string;
  /** Video page URL — YouTube, Vimeo, Dailymotion, Rumble, or anything yt-dlp handles. */
  sourceUrl: string;
  /** Optional user-given project name; drives file/zip names and the tab label. */
  name?: string;
  title?: string;
  duration?: number; // seconds
  thumbnail?: string;
  cutMode: CutMode;
  /** Output format for every cut (default "mp4"). */
  format?: OutputFormat;
  /** Optional watermark burned into every cut. */
  watermark?: Watermark;
  cuts: VideoCut[];
};

export type VideoInfo = {
  title: string;
  duration: number; // seconds
  thumbnail?: string;
  videoId?: string; // provider-native id (yt-dlp's `id`), used for the preview / cache key
};

export type CutStatus = "pending" | "processing" | "done" | "error";

export type CutResult = {
  id: string;
  position: number; // 1-based processing order
  fileName: string;
  status: CutStatus;
  percent: number;
  error?: string;
};

export type JobPhase = "downloading" | "cutting" | "done" | "failed";

export type Job = {
  id: string;
  createdAt: string; // ISO
  project: VideoProject;
  phase: JobPhase;
  downloadPercent: number;
  cuts: CutResult[];
  error?: string;
  /** Absolute path of the downloaded source video (set once the pipeline runs). */
  sourcePath?: string;
  /** Absolute path of the folder holding this job's generated cuts. */
  outputDir?: string;
};

/* ----------------------------- Final-video montage ----------------------------- */

/** One clip on the montage timeline: an already-generated cut, or an uploaded file. */
export type CompilationItem =
  { kind: "cut"; jobId: string; position: number } | { kind: "upload"; uploadId: string };

export type CompilationPhase = "processing" | "done" | "failed";

export type Compilation = {
  id: string;
  createdAt: string; // ISO
  name?: string;
  items: CompilationItem[];
  phase: CompilationPhase;
  percent: number;
  error?: string;
  /** File name offered on download once ready. */
  fileName?: string;
  /** Absolute path of the generated file. */
  outputPath?: string;
};

/** A pickable clip in the montage pool (a "done" cut from any job). */
export type PoolClip = {
  jobId: string;
  position: number;
  fileName: string;
  /** Cut name if the user set one, else the generated file stem. */
  name: string;
  projectName: string;
};

export type CompilationEvent =
  | { type: "snapshot"; compilation: Compilation }
  | { type: "progress"; percent: number }
  | { type: "done"; compilation: Compilation }
  | { type: "failed"; compilation: Compilation };

/* --------------------------------- Dashboard --------------------------------- */

/**
 * What the client still references. Anything on the server not covered by these
 * is an "orphan" (e.g. a job whose project was deleted) — it stops counting in
 * the dashboard and can be purged from disk.
 */
export type KeptRefs = {
  jobs?: string[];
  compilations?: string[];
  uploads?: string[];
  sourceUrls?: string[];
};

/** System-wide counters shown on the Home dashboard (POST /api/stats). */
export type Stats = {
  jobs: { total: number; done: number; failed: number; running: number };
  cuts: { total: number; done: number };
  /** "done" cuts with a file — the montage pool size (mirrors GET /api/clips). */
  clips: number;
  compilations: { total: number; done: number; failed: number };
  /** Bytes on disk per `data/` subtree, plus their sum. */
  disk: { total: number; sources: number; output: number; uploads: number; compilations: number };
  /** Disk used by data no `KeptRefs` covers — reclaimable via POST /api/maintenance/purge. */
  orphans: { jobs: number; compilations: number; bytes: number };
};

/** SSE event payloads emitted on GET /api/jobs/:id/events */
export type JobEvent =
  | { type: "snapshot"; job: Job }
  | { type: "download-progress"; percent: number }
  | {
      type: "cut-progress";
      id: string;
      position: number;
      status: CutStatus;
      percent: number;
      error?: string;
    }
  | { type: "job-done"; job: Job }
  | { type: "job-failed"; job: Job };
