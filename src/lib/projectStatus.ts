import type { Project } from "../store";

export type ProjectStatus = {
  label: string;
  status: string;
  tone: "idle" | "running" | "done" | "error";
  running: boolean;
};

/** Human label + status pill for a project, shared by the sidebar-era list and the gallery. */
export function describeProject(p: Project): ProjectStatus {
  const label =
    p.name?.trim() || p.title?.trim() || (p.sourceUrl.trim() ? "Sem título" : "Novo projeto");
  let status = "Rascunho";
  let tone: ProjectStatus["tone"] = "idle";
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

  return { label, status, tone, running };
}
