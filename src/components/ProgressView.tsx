import { useState } from "react";
import { useStore, useActiveProject } from "../store";
import { ClipVideo } from "./ClipVideo";
import { ConfirmDialog } from "./ConfirmDialog";
import { cancelJob, previewUrl } from "../lib/api";
import { cutDuration } from "../../shared/time";
import type { CutResult } from "../../shared/types";

const STATUS_LABEL: Record<CutResult["status"], string> = {
  pending: "Na fila",
  processing: "Processando",
  done: "Concluído",
  error: "Erro",
};

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export function ProgressView() {
  const project = useActiveProject();
  const goTo = useStore((s) => s.goTo);
  const updateJob = useStore((s) => s.updateJob);
  const [askCancel, setAskCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const job = project?.job;
  if (!project || !job) return null;

  async function doCancel() {
    if (!project || !job || cancelling) return;
    setCancelling(true);
    try {
      updateJob(project.id, await cancelJob(job.id));
      setAskCancel(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  const done = job.cuts.filter((c) => c.status === "done").length;
  const failed = job.cuts.filter((c) => c.status === "error").length;
  const total = job.cuts.length;
  const downloading = job.phase === "downloading";
  const dl = clamp(job.downloadPercent);

  return (
    <div className="progress">
      <header className="progress__summary">
        <span className="progress__summary-icon" aria-hidden="true" />
        <div className="progress__summary-text">
          <h2>{downloading ? "Baixando o vídeo…" : "Gerando os cortes…"}</h2>
          <p className="hint">
            {downloading
              ? `${Math.round(dl)}% baixado`
              : `${done} de ${total} corte(s) prontos` +
                (failed > 0 ? ` · ${failed} com erro` : "")}
            {" — pode abrir outro projeto, o progresso continua em segundo plano."}
          </p>
        </div>
        <div className="progress__summary-actions">
          <button type="button" className="btn btn--secondary" onClick={() => goTo("editor")}>
            Editar cortes
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--danger"
            onClick={() => setAskCancel(true)}
          >
            Cancelar
          </button>
        </div>
      </header>

      {downloading ? (
        <div className="progress__download">
          <span className="progress__download-label">1. Baixando o vídeo</span>
          <Bar percent={dl} />
        </div>
      ) : (
        <p className="hint hint--ok">Vídeo baixado — cortando</p>
      )}

      <ul className="progress__grid">
        {job.cuts.map((c) => {
          const src = job.project.cuts.find((x) => x.id === c.id);
          const label = src?.name?.trim() || `Corte ${c.position}`;
          const pct = c.status === "done" ? 100 : clamp(c.percent);
          return (
            <li key={c.id} className={`progress-card is-${c.status}`}>
              {c.status === "done" ? (
                <ClipVideo
                  className="progress-card__stage progress-card__video"
                  src={previewUrl(job.id, c.position)}
                  controls
                />
              ) : (
                <div className="progress-card__stage">
                  <div className="progress-card__stage-fill" style={{ width: `${pct}%` }} />
                  <div className="progress-card__stage-content">
                    {c.status === "processing" ? (
                      <span className="progress-card__pct">{Math.round(pct)}%</span>
                    ) : (
                      <span className={`progress-card__mark is-${c.status}`}>
                        {c.status === "error" ? "✕" : "⏳"}
                      </span>
                    )}
                    <span className="progress-card__stage-status">{STATUS_LABEL[c.status]}</span>
                  </div>
                </div>
              )}

              <div className="progress-card__body">
                <div className="progress-card__head">
                  <span className="progress-card__title">
                    <span className="progress-card__pos">#{c.position}</span>
                    {label}
                  </span>
                  <span className={`badge badge--${c.status}`}>{STATUS_LABEL[c.status]}</span>
                </div>
                {src && (
                  <span className="progress-card__range">
                    {src.start} → {src.end}
                    {cutDuration(src.start, src.end) && (
                      <span className="dur-badge">{cutDuration(src.start, src.end)}</span>
                    )}
                  </span>
                )}
                {c.error && <p className="hint hint--error">{c.error}</p>}
                {c.status !== "done" && <Bar percent={pct} muted={c.status === "pending"} sm />}
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={askCancel}
        title="Cancelar geração dos cortes"
        message="O processamento em andamento vai parar. Os cortes já gerados são mantidos; os demais não serão criados. O vídeo baixado fica no cache."
        confirmLabel="Cancelar processamento"
        cancelLabel="Continuar"
        danger
        busy={cancelling}
        onConfirm={doCancel}
        onCancel={() => !cancelling && setAskCancel(false)}
      />
    </div>
  );
}

function Bar({ percent, muted, sm }: { percent: number; muted?: boolean; sm?: boolean }) {
  return (
    <div className={`bar${sm ? " bar--sm" : ""}${muted ? " bar--muted" : ""}`}>
      <div className="bar__fill" style={{ width: `${clamp(percent)}%` }} />
      {!sm && <span className="bar__text">{Math.round(percent)}%</span>}
    </div>
  );
}
