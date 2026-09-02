/** True when running inside the Tauri desktop shell (vs. the browser / Docker). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
