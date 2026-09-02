import { useSyncExternalStore } from "react";

/**
 * "Baixar o vídeo automaticamente ao abrir o editor" — a per-browser preference
 * (localStorage, same style as the theme / sidebar toggles). Default: on.
 * When off, the source download only starts once there's a cut (or on Processar).
 */
const KEY = "fcv-autodownload";
const listeners = new Set<() => void>();

export function getAutoDownload(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAutoDownload(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode / disabled */
  }
  listeners.forEach((l) => l());
}

export function useAutoDownload(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getAutoDownload,
    () => true,
  );
}
