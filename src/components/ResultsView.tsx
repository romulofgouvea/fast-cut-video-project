import { useState } from "react";
import { useStore, useActiveProject } from "../store";
import { ClipVideo } from "./ClipVideo";
import { ConfirmDialog } from "./ConfirmDialog";
import { createJob, deleteCut, deleteJob, downloadAllUrl, fileUrl, previewUrl } from "../lib/api";
import { formatTimecode, parseTimecode } from "../../shared/time";
import { uuid } from "../lib/uuid";
import type { CutResult, VideoProject } from "../../shared/types";

const STATUS_LABEL: Record<CutResult["status"], string> = {
  pending: "Na fila",
  processing: "Processando",
  done: "Concluído",
  error: "Erro",
};

export function ResultsView() {
  const project = useActiveProject();
  const goTo = useStore((s) => s.goTo);
  const updateJob = useStore((s) => s.updateJob);
  const attachJob = useStore((s) => s.attachJob);
  const pruneMontageJob = useStore((s) => s.pruneMontageJob);
  const [confirmPos, setConfirmPos] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const job = project?.job;
  if (!project || !job) return null;

  // Re-run the exact same job (same cuts + mode) without going through the editor.
  async function reprocess() {
    if (!project || !job || reprocessing) return;
    setReprocessing(true);
    try {
      const jobId = uuid();
      const prevJobId = job.id;
      const payload: VideoProject = { ...job.project, id: jobId };
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
      // Regenerating: drop the previous generation's clips from the montage pool.
      if (prevJobId && prevJobId !== jobId) {
        pruneMontageJob(prevJobId);
        void deleteJob(prevJobId);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setReprocessing(false);
    }
  }

  const done = job.cuts.filter((c) => c.status === "done");
  const failed = job.cuts.filter((c) => c.status === "error");
  const jobFailed = job.phase === "failed";
  const format = job.project.format ?? "mp4";

  async function confirmRemove() {
    if (!project || !job || confirmPos === null || removing) return;
    setRemoving(true);
    try {
      updateJob(project.id, await deleteCut(job.id, confirmPos));
      setConfirmPos(null);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="results">
      <section className="results__main">
        <ul className="results__grid">
          {job.cuts.map((c) => {
            const src = job.project.cuts.find((x) => x.id === c.id);
            const label = src?.name?.trim() || `Corte ${c.position}`;
            const startSec = src ? parseTimecode(src.start) : null;
            const endSec = src ? parseTimecode(src.end) : null;
            const cutLength =
              startSec !== null && endSec !== null && endSec > startSec
                ? formatTimecode(endSec - startSec)
                : null;
            return (
              <li key={c.id} className={`result-card is-${c.status}`}>
                {c.status === "done" ? (
                  format === "gif" ? (
                    <img
                      className="result-card__video"
                      src={previewUrl(job.id, c.position)}
                      alt={label}
                    />
                  ) : format === "mp3" ? (
                    <audio
                      className="result-card__video result-card__video--audio"
                      src={previewUrl(job.id, c.position)}
                      controls
                    />
                  ) : (
                    <ClipVideo
                      className="result-card__video"
                      src={previewUrl(job.id, c.position)}
                      controls
                    />
                  )
                ) : (
                  <div className="result-card__video result-card__video--empty">
                    {c.status === "error" ? "✕" : "…"}
                  </div>
                )}

                <div className="result-card__body">
                  <div className="result-card__head">
                    <span className="result-card__title">
                      <span className="result-card__pos">#{c.position}</span>
                      {label}
                    </span>
                    <span className={`badge badge--${c.status}`}>{STATUS_LABEL[c.status]}</span>
                  </div>

                  {src && (
                    <span className="result-card__range">
                      {src.start} → {src.end}
                      {cutLength && <span className="result-card__dur">{cutLength}</span>}
                    </span>
                  )}
                  <span className="result-card__file">{c.fileName || "—"}</span>
                  {c.error && <p className="hint hint--error">{c.error}</p>}

                  <div className="result-card__actions">
                    {c.status === "done" && (
                      <a className="btn btn--secondary" href={fileUrl(job.id, c.position)}>
                        Baixar
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost btn--danger"
                      onClick={() => setConfirmPos(c.position)}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <footer className={`results__summary results__footer ${jobFailed ? "is-failed" : "is-ok"}`}>
          <span className="results__summary-icon">{jobFailed ? "✕" : "✓"}</span>
          <div className="results__summary-text">
            <h2>
              {jobFailed
                ? "O processamento falhou"
                : `${done.length} de ${job.cuts.length} corte(s) prontos`}
            </h2>
            <p className="hint">
              {jobFailed
                ? job.error || "Erro desconhecido."
                : failed.length > 0
                  ? `${failed.length} corte(s) falharam e não entram no .zip.`
                  : "Todos os cortes foram gerados."}
            </p>
          </div>
          <div className="results__summary-actions">
            <button type="button" className="btn btn--ghost" onClick={() => goTo("editor")}>
              Editar
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={reprocessing}
              onClick={reprocess}
            >
              {reprocessing ? "Iniciando…" : "Processar novamente"}
            </button>
            {done.length > 0 && (
              <a className="btn btn--success" href={downloadAllUrl(job.id)}>
                Baixar tudo (.zip)
              </a>
            )}
          </div>
        </footer>
      </section>

      <div className="results__paths">
        <p className="results__paths-title">Arquivos no disco</p>
        <PathRow label="Cortes salvos em" value={job.outputDir || `./data/output/${job.id}/`} />
        {job.sourcePath && <PathRow label="Vídeo baixado em" value={job.sourcePath} />}
      </div>

      <ConfirmDialog
        open={confirmPos !== null}
        title="Remover corte"
        message="O arquivo deste corte será apagado do disco. Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        danger
        busy={removing}
        onConfirm={confirmRemove}
        onCancel={() => !removing && setConfirmPos(null)}
      />
    </div>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the text is still selectable */
    }
  };

  return (
    <div className="path-row">
      <span className="path-row__label">{label}</span>
      <div className="path-row__box">
        <code className="path-row__value">{value}</code>
        <button type="button" className="path-row__copy" onClick={copy} title="Copiar caminho">
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
