import { HomeIcon } from "lucide-react";
import { Fragment } from "react";
import { useStore, useActiveProject, useActiveMontage } from "../store";
import { PHASE_LABEL } from "../lib/phase";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";

type Crumb = {
  label: string;
  /** Render the home icon instead of text (label becomes the sr-only text). */
  home?: boolean;
  /** When set, the crumb is a link; the last crumb is always the current page. */
  onClick?: () => void;
};

export function AppBreadcrumb() {
  const route = useStore((s) => s.route);
  const setRoute = useStore((s) => s.setRoute);
  const goTo = useStore((s) => s.goTo);
  const closeProject = useStore((s) => s.closeProject);
  const closeMontage = useStore((s) => s.closeMontage);
  const project = useActiveProject();
  const montage = useActiveMontage();

  const crumbs: Crumb[] = [{ label: "Início", home: true, onClick: () => setRoute("home") }];

  if (route === "home") {
    crumbs[0] = { label: "Início", home: true };
  } else if (route === "projects" && !project) {
    crumbs.push({ label: "Projetos" });
  } else if (route === "projects" && project) {
    const phase = project.phase;
    const name = project.name?.trim() || project.title?.trim() || "Projeto";
    crumbs.push({ label: "Projetos", onClick: closeProject });
    if (phase === "url") {
      crumbs.push({ label: PHASE_LABEL.url });
    } else {
      crumbs.push({
        label: name,
        onClick: phase === "editor" ? undefined : () => goTo("editor"),
      });
      if (phase !== "editor") crumbs.push({ label: PHASE_LABEL[phase] });
    }
  } else if (route === "montage" && !montage) {
    crumbs.push({ label: "Editor" });
  } else if (route === "montage" && montage) {
    crumbs.push({ label: "Editor", onClick: closeMontage });
    crumbs.push({ label: montage.name?.trim() || "Montagem sem nome" });
  }

  return (
    <Breadcrumb>
      <BreadcrumbList className="border-border h-8 gap-2 rounded-full border border-solid bg-card px-3">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          const content = crumb.home ? (
            <>
              <HomeIcon className="size-4" />
              <span className="sr-only">{crumb.label}</span>
            </>
          ) : (
            crumb.label
          );

          return (
            <Fragment key={i}>
              <BreadcrumbItem>
                {last ? (
                  <BreadcrumbPage>{content}</BreadcrumbPage>
                ) : crumb.onClick ? (
                  <BreadcrumbLink
                    role="button"
                    tabIndex={0}
                    onClick={crumb.onClick}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        crumb.onClick?.();
                      }
                    }}
                  >
                    {content}
                  </BreadcrumbLink>
                ) : (
                  <span>{content}</span>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
