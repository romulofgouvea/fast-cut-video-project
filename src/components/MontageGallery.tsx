import { useState } from "react";
import { useStore, montageBaseName } from "../store";
import type { MontageProject } from "../store";
import { compilationDownloadUrl } from "../lib/api";
import { bundleName, dateStamp } from "../../shared/filename";
import { ConfirmDialog } from "./ConfirmDialog";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
};

type Badge = { text: string; tone: "idle" | "running" | "done" | "error" };

const statusBadge = (m: MontageProject): Badge => {
  const c = m.compilation;
  if (c.phase === "processing")
    return { text: `Gerando ${Math.round(c.percent)}%`, tone: "running" };
  if (c.phase === "done") return { text: "Pronta", tone: "done" };
  if (c.phase === "failed") {
    return { text: c.error === "expirada" ? "Expirada" : "Falhou", tone: "error" };
  }
  return { text: "Rascunho", tone: "idle" };
};

export function MontageGallery() {
  const montageProjects = useStore((s) => s.montageProjects);
  const createMontageProject = useStore((s) => s.createMontageProject);
  const selectMontageProject = useStore((s) => s.selectMontageProject);
  const removeMontageProject = useStore((s) => s.removeMontageProject);
  const [confirm, setConfirm] = useState<MontageProject | null>(null);

  return (
    <div className="gallery">
      {montageProjects.length === 0 ? (
        <div className="gallery__empty">
          <p>Nenhuma montagem salva. Crie uma para juntar cortes num vídeo só.</p>
          <button type="button" className="btn btn--primary" onClick={() => createMontageProject()}>
            Nova montagem
          </button>
        </div>
      ) : (
        <div className="gallery__grid">
          {montageProjects.map((m) => {
            const badge = statusBadge(m);
            const name = m.name?.trim() || "Montagem sem nome";
            const downloadName = bundleName(
              montageBaseName(m) || "montagem",
              dateStamp(new Date(m.createdAt)),
              "mp4",
            );
            return (
              <div
                key={m.id}
                className="gallery-card"
                role="button"
                tabIndex={0}
                onClick={() => selectMontageProject(m.id)}
                onKeyDown={(e) => e.key === "Enter" && selectMontageProject(m.id)}
              >
                <div className="gallery-card__thumb gallery-card__thumb--montage">
                  <span className="gallery-card__thumb-fallback">🎞</span>
                </div>
                <div className="gallery-card__body">
                  <span className="gallery-card__title">{name}</span>
                  <span className="gallery-card__meta">
                    <span className={`nav-item__dot nav-item__dot--${badge.tone}`} />
                    {badge.text} · {m.items.length} clipe(s)
                    {fmtDate(m.createdAt) && ` · ${fmtDate(m.createdAt)}`}
                  </span>
                  {m.compilation.phase === "done" && m.compilation.id && (
                    <a
                      className="gallery-card__link"
                      href={compilationDownloadUrl(m.compilation.id, downloadName)}
                      download={downloadName}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Baixar vídeo
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  className="gallery-card__del"
                  title="Remover montagem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirm(m);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="gallery-card gallery-card--new"
            onClick={() => createMontageProject()}
          >
            + Nova montagem
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title="Remover montagem"
        message={`Remover “${confirm?.name?.trim() || "Montagem sem nome"}”? O vídeo já gerado no servidor continua disponível até a limpeza automática, mas esta montagem some da lista.`}
        confirmLabel="Remover"
        danger
        onConfirm={() => {
          if (confirm) removeMontageProject(confirm.id);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
