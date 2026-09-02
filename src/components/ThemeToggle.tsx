import { useState } from "react";
import { getStoredTheme, setTheme, type Theme } from "../lib/theme";

const NEXT: Record<Theme, Theme> = { dark: "light", light: "system", system: "dark" };
const LABEL: Record<Theme, string> = { dark: "Escuro", light: "Claro", system: "Sistema" };
const ICON: Record<Theme, string> = { dark: "🌙", light: "☀️", system: "🖥️" };

export function ThemeToggle() {
  const [theme, setLocal] = useState<Theme>(getStoredTheme);

  return (
    <button
      type="button"
      className="btn btn--ghost theme-toggle"
      title={`Tema: ${LABEL[theme]} — clique para alternar`}
      aria-label={`Tema: ${LABEL[theme]}`}
      onClick={() => {
        const next = NEXT[theme];
        setTheme(next);
        setLocal(next);
      }}
    >
      <span aria-hidden="true">{ICON[theme]}</span>
      <span className="theme-toggle__label">{LABEL[theme]}</span>
    </button>
  );
}
