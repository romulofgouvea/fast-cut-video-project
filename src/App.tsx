import { useEffect } from "react";
import { PanelLeftIcon } from "lucide-react";
import { useStore, useActiveProject, useActiveMontage } from "./store";
import { formatTimecode } from "../shared/time";
import { loadYouTubeApi } from "./lib/youtubeApi";
import { PHASE_LABEL } from "./lib/phase";
import { Sidebar } from "./components/Sidebar";
import { AppBreadcrumb } from "./components/AppBreadcrumb";
import { UrlStep } from "./components/UrlStep";
import { Editor } from "./components/Editor";
import { ProgressView } from "./components/ProgressView";
import { ResultsView } from "./components/ResultsView";
import { CompilationView } from "./components/CompilationView";
import { HomeView } from "./components/HomeView";
import { ProjectsGallery } from "./components/ProjectsGallery";
import { MontageGallery } from "./components/MontageGallery";
import { JobWatchers } from "./components/JobWatchers";
import { MontageWatchers } from "./components/MontageWatchers";
import { ThemeToggle } from "./components/ThemeToggle";
import { useGlobalShortcuts } from "./lib/useGlobalShortcuts";

type Action = { label: string; onClick: () => void; kind?: "primary" };

/** The per-project flow: URL step → editor → progress → results. */
function ProjectFlow() {
  const project = useActiveProject();
  if (!project) return null;
  return (
    <>
      {project.phase === "url" && <UrlStep />}
      {project.phase === "editor" && <Editor />}
      {project.phase === "progress" && <ProgressView />}
      {project.phase === "results" && <ResultsView />}
    </>
  );
}

const montageStatus = (m: NonNullable<ReturnType<typeof useActiveMontage>>): string => {
  const c = m.compilation;
  if (c.phase === "processing") return `Gerando ${Math.round(c.percent)}%`;
  if (c.phase === "done") return "Vídeo pronto";
  if (c.phase === "failed") return "A geração falhou";
  return `${m.items.length} clipe(s)`;
};

export function App() {
  const route = useStore((s) => s.route);
  const projectCount = useStore((s) => s.projects.length);
  const montageCount = useStore((s) => s.montageProjects.length);
  const createProject = useStore((s) => s.createProject);
  const createMontageProject = useStore((s) => s.createMontageProject);
  const closeProject = useStore((s) => s.closeProject);
  const closeMontage = useStore((s) => s.closeMontage);
  const setProjectName = useStore((s) => s.setProjectName);
  const renameMontageProject = useStore((s) => s.renameMontageProject);
  const goTo = useStore((s) => s.goTo);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const active = useActiveProject();
  const activeMontage = useActiveMontage();

  // Preload the YouTube IFrame API so the player is instant.
  useEffect(() => {
    void loadYouTubeApi();
  }, []);

  useGlobalShortcuts();

  // --- Topbar content, per route -------------------------------------------
  let title = "Início";
  let subtitle = "Visão geral do seu estúdio";
  const actions: Action[] = [];
  // A name field replaces the static <h1> when the open item is renameable.
  let nameField: { value: string; placeholder: string; onChange: (v: string) => void } | null =
    null;

  if (route === "home") {
    actions.push({ label: "Novo projeto", onClick: createProject, kind: "primary" });
    actions.push({ label: "Nova montagem", onClick: () => createMontageProject() });
  } else if (route === "projects" && !active) {
    title = "Projetos";
    subtitle = `${projectCount} ${projectCount === 1 ? "projeto" : "projetos"}`;
    actions.push({ label: "Novo projeto", onClick: createProject, kind: "primary" });
  } else if (route === "projects" && active) {
    title = active.name?.trim() || active.title?.trim() || "Projeto";
    subtitle = [PHASE_LABEL[active.phase], active.duration ? formatTimecode(active.duration) : null]
      .filter(Boolean)
      .join(" · ");

    const editingWithJob = active.phase === "editor" && !!active.job;
    const jobFinished = active.job?.phase === "done" || active.job?.phase === "failed";
    if (active.phase === "editor") {
      actions.push(
        editingWithJob
          ? {
              label: jobFinished ? "Ver resultados" : "Ver progresso",
              onClick: () => goTo(jobFinished ? "results" : "progress"),
            }
          : { label: "Trocar vídeo", onClick: () => goTo("url") },
      );
    } else if (active.phase === "results") {
      actions.push({ label: "Voltar ao editor", onClick: () => goTo("editor") });
    } else if (active.phase === "progress") {
      actions.push({ label: "Editar cortes", onClick: () => goTo("editor") });
    }
    actions.push({ label: "Voltar aos projetos", onClick: closeProject });

    if (active.phase === "url" || active.phase === "editor") {
      nameField = {
        value: active.name ?? "",
        placeholder: active.title || "Nome do projeto",
        onChange: setProjectName,
      };
    }
  } else if (route === "montage" && !activeMontage) {
    title = "Editor";
    subtitle = `${montageCount} ${montageCount === 1 ? "montagem" : "montagens"}`;
    actions.push({
      label: "Nova montagem",
      onClick: () => createMontageProject(),
      kind: "primary",
    });
  } else if (route === "montage" && activeMontage) {
    title = activeMontage.name?.trim() || "Montagem sem nome";
    subtitle = montageStatus(activeMontage);
    actions.push({ label: "Voltar ao Editor", onClick: closeMontage });
    nameField = {
      value: activeMontage.name ?? "",
      placeholder: "Montagem sem nome",
      onChange: (v) => renameMontageProject(activeMontage.id, v),
    };
  }

  return (
    <div className={`app ${sidebarCollapsed ? "is-collapsed" : ""}`}>
      <Sidebar />

      <div className="content">
        <header className="topbar">
          <div className="topbar__inner">
            <div className="topbar__lead">
              <button
                type="button"
                className="topbar__collapse"
                onClick={toggleSidebar}
                aria-label={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
                aria-pressed={sidebarCollapsed}
                title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
              >
                <PanelLeftIcon className="size-4" />
              </button>
              <AppBreadcrumb />
            </div>

            <div className="topbar__actions">
              <ThemeToggle />
            </div>
          </div>

          <div className="topbar__meta">
            <div className="topbar__meta-text">
              {nameField ? (
                <input
                  className="topbar__title-input"
                  value={nameField.value}
                  placeholder={nameField.placeholder}
                  onChange={(e) => nameField!.onChange(e.target.value)}
                />
              ) : (
                <h1 className="topbar__title">{title}</h1>
              )}
              <p className="topbar__subtitle">{subtitle}</p>
            </div>

            {actions.length > 0 && (
              <div className="topbar__meta-actions">
                {actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    className={`btn btn--sm ${a.kind === "primary" ? "btn--primary" : "btn--secondary"}`}
                    onClick={a.onClick}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <main className="content__main">
          {route === "home" && <HomeView />}
          {route === "projects" && (active ? <ProjectFlow /> : <ProjectsGallery />)}
          {route === "montage" && (activeMontage ? <CompilationView /> : <MontageGallery />)}
        </main>
      </div>

      <JobWatchers />
      <MontageWatchers />
    </div>
  );
}
