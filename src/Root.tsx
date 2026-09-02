import { useEffect, useState } from "react";
import { App } from "./App";
import { useStore } from "./store";

/**
 * Gate the app on store hydration. With localStorage (web/Docker) this is
 * synchronous and renders immediately; with the desktop SQLite backend it is
 * async, so we hold a brief loader instead of flashing an empty dashboard.
 */
export function Root() {
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());

  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);

  if (!hydrated) return <div className="app-loading" aria-busy="true" />;
  return <App />;
}
