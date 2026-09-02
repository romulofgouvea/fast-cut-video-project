import { useState } from "react";
import { useStore } from "../store";
import type { Project } from "../store";
import { describeProject } from "../lib/projectStatus";
import { ConfirmDialog } from "./ConfirmDialog";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
};

export function ProjectsGallery() {
  const projects = useStore((s) => s.projects);
  const createProject = useStore((s) => s.createProject);
  const selectProject = useStore((s) => s.selectProject);
  const removeProject = useStore((s) => s.removeProject);
  const [confirm, setConfirm] = useState<Project | null>(null);

  const confirmInfo = confirm ? describeProject(confirm) : null;

  return (
    <div className="gallery">
      {projects.length === 0 ? (
        <div className="gallery__empty">
          <p>Você ainda não criou nenhum projeto.</p>
          <button type="button" className="btn btn--primary" onClick={createProject}>
            Criar o primeiro projeto
          </button>
        </div>
      ) : (
        <div className="gallery__grid">
          {projects.map((p) => {
            const info = describeProject(p);
            return (
              <div
                key={p.id}
                className="gallery-card"
                role="button"
                tabIndex={0}
                onClick={() => selectProject(p.id)}
                onKeyDown={(e) => e.key === "Enter" && selectProject(p.id)}
              >
                <div className="gallery-card__thumb">
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt="" />
                  ) : (
                    <span className="gallery-card__thumb-fallback">🎬</span>
                  )}
                </div>
                <div className="gallery-card__body">
                  <span className="gallery-card__title">{info.label}</span>
                  <span className="gallery-card__meta">
                    <span className={`nav-item__dot nav-item__dot--${info.tone}`} />
                    {info.status} · {p.cuts.length} corte(s)
                    {fmtDate(p.createdAt) && ` · ${fmtDate(p.createdAt)}`}
                  </span>
                </div>
                <button
                  type="button"
                  className="gallery-card__del"
                  title="Remover projeto"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirm(p);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button type="button" className="gallery-card gallery-card--new" onClick={createProject}>
            + Novo projeto
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title="Remover projeto"
        message={
          confirmInfo?.running
            ? `“${confirmInfo.label}” ainda está processando. Remover mesmo assim descarta o projeto e o progresso.`
            : `Remover “${confirmInfo?.label ?? ""}”? Os cortes já baixados no disco não são apagados, mas o projeto some da lista.`
        }
        confirmLabel="Remover"
        danger
        onConfirm={() => {
          if (confirm) removeProject(confirm.id);
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
