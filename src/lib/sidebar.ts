const KEY = "fcv-sidebar";

/** Whether the sidebar starts collapsed (remembered across reloads). */
export function getStoredSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === "collapsed";
  } catch {
    /* private mode / disabled */
    return false;
  }
}

export function storeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    /* ignore */
  }
}
