import { useEffect, useState } from "react";
import { useStore, useActiveProject } from "../store";
import { validateCut } from "../../shared/time";
import type { VideoProject } from "../../shared/types";
import {
  createJob,
  deleteJob,
  prefetchSource,
  prefetchStatus,
  type SourceStatus,
} from "../lib/api";
import { detectSource } from "../../shared/videoSource";
import { uuid } from "../lib/uuid";
import { VideoPreview } from "./VideoPreview";
import { CutsManager } from "./CutsManager";
import { CutModeToggle } from "./CutModeToggle";
import { OutputOptions } from "./OutputOptions";

export function Editor() {
  const project = useActiveProject();
  const attachJob = useStore((s) => s.attachJob);
  const pruneMontageJob = useStore((s) => s.pruneMontageJob);
  const loadVideoInfo = useStore((s) => s.loadVideoInfo);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const [dl, setDl] = useState<SourceStatus>({ state: "idle", percent: 0 });
  const [dlRetry, setDlRetry] = useState(0);

  const projectId = project?.id;
  const infoStatus = project?.infoStatus;
  // Fetch the (slow) metadata once the editor is open; retry only on demand.
  useEffect(() => {
    if (projectId && infoStatus === "idle") void loadVideoInfo(projectId);
  }, [projectId, infoStatus, loadVideoInfo]);

  // Background source download: `wantSource` decides when to *kick it off*, but we
  // always *poll* the server's status while the editor is open so the progress
  // ribbon survives leaving and re-opening the project (and reflects a download
  // another tab / an earlier visit started). No cuts are made here.
  // YouTube has its own iframe player, so we only start pulling the file after the
  // first cut; every other provider needs it for the local scrub preview.
  const sourceUrl = project?.sourceUrl.trim() ?? "";
  const hasCuts = (project?.cuts.length ?? 0) > 0;
  const hasJob = Boolean(project?.job);
  const isYouTube = sourceUrl ? detectSource(sourceUrl).provider === "youtube" : false;
  const wantSource = Boolean(sourceUrl) && !hasJob && (hasCuts || !isYouTube);
  useEffect(() => {
    if (!sourceUrl || hasJob) return;
    let alive = true;
    let timer = 0;
    if (wantSource) void prefetchSource(sourceUrl);
    const tick = async () => {
      const s = await prefetchStatus(sourceUrl);
      if (!alive) return;
      setDl(s);
      // Poll on while it downloads; also while idle if we're expecting it to start.
      const keepGoing = s.state === "downloading" || (wantSource && s.state === "idle");
      if (keepGoing) timer = window.setTimeout(tick, 1500);
    };
    timer = window.setTimeout(tick, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [sourceUrl, hasJob, wantSource, dlRetry]);

  const retryDownload = () => {
    setDl({ state: "downloading", percent: 0 });
    setDlRetry((n) => n + 1);
  };

  const { cuts = [], duration } = project ?? {};
  const allValid = cuts.length > 0 && cuts.every((c) => validateCut(c.start, c.end, duration).ok);

  // Ctrl/Cmd+Enter → process.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && allValid && !starting) {
        e.preventDefault();
        void process();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allValid, starting]);

  if (!project) return null;

  async function process() {
    if (!project || !allValid || starting) return;
    setStarting(true);
    setError(undefined);
    // A fresh job id per run so re-processing a project never collides server-side.
    const jobId = uuid();
    const prevJobId = project.jobId;
    const payload: VideoProject = {
      id: jobId,
      sourceUrl: project.sourceUrl.trim(),
      name: project.name?.trim() || undefined,
      title: project.title,
      duration: project.duration,
      thumbnail: project.thumbnail,
      cutMode: project.cutMode,
      format: project.format ?? "mp4",
      watermark:
        project.watermark && (project.watermark.text?.trim() || project.watermark.imageId)
          ? project.watermark
          : undefined,
      cuts: project.cuts,
    };
    try {
      await createJob(payload);
      attachJob(project.id, jobId, {
        id: jobId,
        createdAt: new Date().toISOString(),
        project: payload,
        phase: "downloading",
        downloadPercent: 0,
        cuts: payload.cuts.map((c, i) => ({
          id: c.id,
          position: i + 1,
          fileName: "",
          status: "pending",
          percent: 0,
        })),
      });
      // Regenerating: only the newest clips should stay in the montage pool.
      if (prevJobId && prevJobId !== jobId) {
        pruneMontageJob(prevJobId);
        void deleteJob(prevJobId);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="editor">
      <div className="editor__grid">
        <div className="editor__col editor__col--left">
          <div className="editor__panel editor__panel--video">
            {dl.state === "downloading" && (
              <div className="dl-ribbon" role="status" aria-live="polite">
                <div className="dl-ribbon__band">
                  <span>Baixando</span>
                  <strong>{Math.round(dl.percent)}%</strong>
                </div>
              </div>
            )}
            <VideoPreview localReady={dl.state === "ready"} />
          </div>
          <section className="editor__panel process-block">
            <CutModeToggle />
            <OutputOptions />

            {dl.state === "ready" && (
              <p className="hint hint--ok">
                Vídeo baixado — prévia com scrub disponível e “Processar” vai direto aos cortes.
              </p>
            )}
            {dl.state === "error" && (
              <p className="hint hint--error">
                Não foi possível baixar o vídeo: {dl.error}{" "}
                <button type="button" className="btn btn--ghost btn--sm" onClick={retryDownload}>
                  Tentar de novo
                </button>
              </p>
            )}
            {infoStatus === "error" && project.infoError && dl.state === "idle" && (
              <p className="hint hint--error">
                Não foi possível ler os dados do vídeo: {project.infoError}{" "}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => projectId && void loadVideoInfo(projectId)}
                >
                  Tentar de novo
                </button>
              </p>
            )}

            {error && <p className="hint hint--error">{error}</p>}
            <button
              type="button"
              className="btn btn--success process-block__go"
              disabled={!allValid || starting}
              onClick={process}
            >
              {starting ? "Iniciando…" : "Processar cortes"}
            </button>
          </section>
        </div>
        <div className="editor__col editor__col--cuts editor__panel">
          <CutsManager />
        </div>
      </div>
    </div>
  );
}
