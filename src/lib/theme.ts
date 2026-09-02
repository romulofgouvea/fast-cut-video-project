export type Theme = "dark" | "light" | "system";

const KEY = "fcv-theme";

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {
    /* private mode / disabled */
  }
  return "dark"; // the app's original look
}

/** dark unless the choice (or the OS, for "system") says light. */
function resolve(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return theme;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", resolve(theme));
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

/** Call once on boot; also re-applies when the OS theme flips under "system". */
export function initTheme(): void {
  applyTheme(getStoredTheme());
  if (typeof matchMedia === "function") {
    matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
      if (getStoredTheme() === "system") applyTheme("system");
    });
  }
}
