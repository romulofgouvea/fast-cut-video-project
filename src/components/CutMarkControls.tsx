import { useEffect, useState } from "react";
import { useStore } from "../store";
import { formatTimecode } from "../../shared/time";

/** "Mark start / mark end" controls, shown at the top of the cuts panel. */
export function CutMarkControls() {
  const ready = useStore((s) => s.playerReady);
  const pendingStart = useStore((s) => s.pendingStart);
  const markStart = useStore((s) => s.markStart);
  const markEndAndCreate = useStore((s) => s.markEndAndCreate);
  const clearPendingStart = useStore((s) => s.clearPendingStart);
  const [flash, setFlash] = useState<string>();

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(undefined), 3500);
    return () => clearTimeout(id);
  }, [flash]);

  const end = () => {
    const err = markEndAndCreate();
    setFlash(err ?? "Corte adicionado.");
  };

  return (
    <div className="mark">
      <div className="mark__row">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={markStart}
          disabled={!ready}
        >
          ⏱ Marcar início (I)
        </button>
        <span className="mark__pending">
          {pendingStart === null ? "sem início" : `início ${formatTimecode(pendingStart)}`}
        </span>
        <button
          type="button"
          className="btn btn--primary"
          onClick={end}
          disabled={!ready || pendingStart === null}
        >
          ✂ Marcar fim (O)
        </button>
        {pendingStart !== null && (
          <button
            type="button"
            className="btn btn--ghost btn--danger"
            onClick={clearPendingStart}
          >
            limpar
          </button>
        )}
      </div>
      {flash && <p className="hint hint--ok">{flash}</p>}
      {!ready && <p className="hint">Carregando o player…</p>}
    </div>
  );
}
