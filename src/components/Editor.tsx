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

  // Start (or keep) the source download in the background and poll its progress
  // for the status line — no cuts are made here, that only happens on "Processar".
  // YouTube has its own iframe player, so wait for the first cut before pulling the
  // file; every other provider needs the download for the local scrub preview, so
  // start it right away. The server dedupes / no-ops if it's already done.
  const sourceUrl = project?.sourceUrl.trim() ?? "";
  const hasCuts = (project?.cuts.length ?? 0) > 0;
  const hasJob = Boolean(project?.job);
  const isYouTube = sourceUrl ? detectSource(sourceUrl).provider === "youtube" : false;
  const wantSource = Boolean(sourceUrl) && !hasJob && (hasCuts || !isYouTube);
  useEffect(() => {
    if (!wantSource) return;
    let alive = true;
    let timer = 0;
    void prefetchSource(sourceUrl);
    const tick = async () => {
      const s = await prefetchStatus(sourceUrl);
      if (!alive) return;
      setDl(s);
      // Keep polling while it downloads; stop on ready or error (error offers a retry).
      if (s.state !== "ready" && s.state !== "error") timer = window.setTimeout(tick, 1500);
    };
    timer = window.setTimeout(tick, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [wantSource, sourceUrl, dlRetry]);

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
            <VideoPreview localReady={dl.state === "ready"} />
          </div>
          <section className="editor__panel process-block">
            <CutModeToggle />
            <OutputOptions />

            {dl.state === "downloading" && (
              <p className="hint">
                Baixando o vídeo em segundo plano… {dl.percent}% — depois a prévia com marcação de
                tempo abre aqui e o “Processar” só corta.
              </p>
            )}
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
