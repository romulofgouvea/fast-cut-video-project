import type { ProjectPhase } from "../store";

/** Human label for each project phase, shown in the topbar + breadcrumb. */
export const PHASE_LABEL: Record<ProjectPhase, string> = {
  url: "Novo projeto",
  editor: "Editando cortes",
  progress: "Processando",
  results: "Resultados",
};
