import { useCallback, useEffect, useState } from "react";
import type { Stats } from "../../shared/types";
import { getStats } from "./api";
import { currentKeptRefs } from "./keptRefs";

type UseStats = {
  stats: Stats | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
};

type Internal = { stats?: Stats; loading: boolean; error?: string };

/** Fetches `/api/stats` on mount; `reload()` re-fetches. StrictMode double-invoke safe. */
export function useStats(): UseStats {
  const [state, setState] = useState<Internal>({ loading: true });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    getStats(currentKeptRefs())
      .then((s) => alive && setState({ stats: s, loading: false }))
      .catch(
        (err) =>
          alive && setState((p) => ({ ...p, loading: false, error: (err as Error).message })),
      );
    return () => {
      alive = false;
    };
  }, [nonce]);

  const reload = useCallback(() => {
    setState((p) => ({ ...p, loading: true, error: undefined }));
    setNonce((n) => n + 1);
  }, []);

  return { stats: state.stats, loading: state.loading, error: state.error, reload };
}
