import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "../store";
import { getCompilation, subscribeCompilation } from "../lib/api";

/**
 * Keeps a live subscription for every montage whose compilation is still running
 * — no matter which screen is on — so generation continues in the background and
 * the gallery shows real status after a reload.
 */
export function MontageWatchers() {
  const watched = useStore(
    useShallow((s) =>
      s.montageProjects
        .filter((m) => {
          const c = m.compilation;
          return c.id && c.phase !== "done" && c.phase !== "failed";
        })
        .map((m) => `${m.id}:${m.compilation.id}`),
    ),
  );

  return (
    <>
      {watched.map((key) => {
        const sep = key.indexOf(":");
        return (
          <MontageWatcher
            key={key}
            montageId={key.slice(0, sep)}
            compilationId={key.slice(sep + 1)}
          />
        );
      })}
    </>
  );
}

function MontageWatcher({
  montageId,
  compilationId,
}: {
  montageId: string;
  compilationId: string;
}) {
  const patch = useStore((s) => s.patchMontageCompilation);

  useEffect(() => {
    let alive = true;
    let unsub = () => {};

    getCompilation(compilationId)
      .then((c) => {
        if (!alive) return;
        patch(montageId, { phase: c.phase, percent: c.percent, error: c.error });
        if (c.phase === "done" || c.phase === "failed") return;

        unsub = subscribeCompilation(compilationId, (ev) => {
          if (ev.type === "progress") {
            patch(montageId, { percent: ev.percent, phase: "processing" });
          } else if (ev.type === "snapshot") {
            patch(montageId, {
              percent: ev.compilation.percent,
              phase: ev.compilation.phase,
              error: ev.compilation.error,
            });
          } else if (ev.type === "done") {
            patch(montageId, { percent: 100, phase: "done" });
          } else if (ev.type === "failed") {
            patch(montageId, { phase: "failed", error: ev.compilation.error });
          }
        });
      })
      .catch(() => {
        // 404 — the compilation was pruned by the disk GC.
        if (alive) patch(montageId, { phase: "failed", error: "expirada" });
      });

    return () => {
      alive = false;
      unsub();
    };
  }, [montageId, compilationId, patch]);

  return null;
}
