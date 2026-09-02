import { useMemo } from "react";
import { useStore } from "../store";
import type { Project } from "../store";

type TabInfo = {
  id: string;
  label: string;
  status: string;
  tone: "idle" | "running" | "done" | "error";
  active: boolean;
  running: boolean;
};

function describe(p: Project, activeId: string | null): TabInfo {
  const label = p.title?.trim() || (p.youtubeUrl.trim() ? "Sem título" : "Novo projeto");
  let status = "Rascunho";
  let tone: TabInfo["tone"] = "idle";
  let running = false;

  if (p.job) {
    const j = p.job;
    if (j.phase === "downloading") {
      status = `Baixando ${Math.round(j.downloadPercent)}%`;
      tone = "running";
      running = true;
    } else if (j.phase === "cutting") {
      const done = j.cuts.filter((c) => c.status === "done").length;
      status = `Cortando ${done}/${j.cuts.length}`;
      tone = "running";
      running = true;
    } else if (j.phase === "done") {
      status = "Pronto";
      tone = "done";
    } else {
      status = "Erro";
      tone = "error";
    }
  } else if (p.phase === "editor") {
    status = "Editando";
  }

  return { id: p.id, label, status, tone, active: p.id === activeId, running };
}

export function ProjectTabs() {
  const projects = useStore((s) => s.projects);
  const activeId = useStore((s) => s.activeId);
  const selectProject = useStore((s) => s.selectProject);
  const removeProject = useStore((s) => s.removeProject);
  const createProject = useStore((s) => s.createProject);

  const tabs = useMemo(
    () => projects.map((p) => describe(p, activeId)),
    [projects, activeId],
  );

  const remove = (tab: TabInfo) => {
    if (tab.running && !confirm("Este projeto ainda está processando. Remover mesmo assim?")) {
      return;
    }
    removeProject(tab.id);
  };

  return (
    <nav className="project-tabs">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`project-tab ${tab.active ? "is-active" : ""}`}
          onClick={() => selectProject(tab.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && selectProject(tab.id)}
        >
          <span className={`project-tab__dot project-tab__dot--${tab.tone}`} />
          <span className="project-tab__text">
            <span className="project-tab__label">{tab.label}</span>
            <span className="project-tab__status">{tab.status}</span>
          </span>
          <button
            type="button"
            className="project-tab__close"
            title="Remover projeto"
            onClick={(e) => {
              e.stopPropagation();
              remove(tab);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn btn--ghost project-tabs__add" onClick={createProject}>
        + Novo projeto
      </button>
    </nav>
  );
}
