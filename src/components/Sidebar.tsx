import { FilmIcon, FolderIcon, HomeIcon, type LucideIcon } from "lucide-react";
import { useStore } from "../store";
import type { AppRoute } from "../store";
import { Logo } from "./Logo";

const NAV: { route: AppRoute; label: string; icon: LucideIcon }[] = [
  { route: "home", label: "Início", icon: HomeIcon },
  { route: "projects", label: "Projetos", icon: FolderIcon },
  { route: "montage", label: "Editor", icon: FilmIcon },
];

export function Sidebar() {
  const route = useStore((s) => s.route);
  const setRoute = useStore((s) => s.setRoute);
  const closeProject = useStore((s) => s.closeProject);
  const closeMontage = useStore((s) => s.closeMontage);

  // Clicking a section in the sidebar always lands on its gallery — never resumes
  // a half-open project/montage, so "Projetos" reliably means "show all projects".
  const go = (r: AppRoute) => {
    if (r === "projects") closeProject();
    if (r === "montage") closeMontage();
    setRoute(r);
  };

  return (
    <aside className="sidebar">
      <button type="button" className="sidebar__brand" onClick={() => go("home")}>
        <span className="sidebar__logo">
          <Logo className="sidebar__logo-mark" />
        </span>
        <span>Fast Cut Video</span>
      </button>

      <nav className="sidebar__nav">
        {NAV.map(({ route: r, label, icon: Icon }) => {
          const active = route === r;
          return (
            <button
              key={r}
              type="button"
              className={`nav-item nav-item--static ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => go(r)}
            >
              <span className="nav-item__icon">
                <Icon className="size-4" />
              </span>
              <span className="nav-item__text">
                <span className="nav-item__label">{label}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
