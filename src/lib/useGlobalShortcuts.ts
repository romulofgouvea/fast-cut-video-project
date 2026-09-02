import { useEffect } from "react";
import { useStore } from "../store";

const isTyping = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  return !!n && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.isContentEditable);
};

/**
 * App-wide keyboard shortcuts (the player's own I/O/J/K/L live in
 * `<PlayerControls>`):
 *   Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z  undo / redo the cut list (editor only)
 *   Ctrl/Cmd+Alt+↑ / ↓             previous / next project
 *   Ctrl/Cmd+Alt+N                 new project
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const s = useStore.getState();
      const active = s.projects.find((p) => p.id === s.activeId);
      const k = e.key.toLowerCase();

      // Undo / redo — but leave text fields to the browser's own undo.
      if ((k === "z" || k === "y") && !isTyping(e.target)) {
        if (s.route !== "projects" || active?.phase !== "editor") return;
        e.preventDefault();
        if (k === "y" || e.shiftKey) s.redo();
        else s.undo();
        return;
      }

      if (e.altKey && (k === "arrowup" || k === "arrowdown")) {
        e.preventDefault();
        const ids = s.projects.map((p) => p.id);
        if (ids.length === 0) return;
        const i = ids.indexOf(s.activeId ?? "");
        const to = k === "arrowdown" ? i + 1 : i - 1;
        if (to >= 0 && to < ids.length) s.selectProject(ids[to]); // also routes to "projects"
        return;
      }

      if (e.altKey && k === "n") {
        e.preventDefault();
        s.createProject();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
