import { useStore, useActiveProject } from "../store";
import { CutRow } from "./CutRow";

export function CutsManager() {
  const addCut = useStore((s) => s.addCut);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const project = useActiveProject();
  const cuts = project?.cuts ?? [];
  const hist = useStore((s) => (project ? s.history[project.id] : undefined));

  return (
    <section className="cuts">
      <div className="cuts__head">
        <h3>Cortes {cuts.length > 0 && <span className="cuts__count">{cuts.length}</span>}</h3>
        <div className="cuts__head-actions">
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={undo}
            disabled={!hist?.past.length}
            title="Desfazer (Ctrl+Z)"
            aria-label="Desfazer"
          >
            ↶
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={redo}
            disabled={!hist?.future.length}
            title="Refazer (Ctrl+Shift+Z)"
            aria-label="Refazer"
          >
            ↷
          </button>
          <button type="button" className="cuts__add" onClick={addCut}>
            + Adicionar corte
          </button>
        </div>
      </div>

      {cuts.length === 0 ? (
        <p className="hint">Nenhum corte ainda. Marque no player ou adicione manualmente.</p>
      ) : (
        <ol className="cuts__list">
          {cuts
            .map((cut, i) => ({ cut, i }))
            .reverse()
            .map(({ cut, i }) => (
              <CutRow key={cut.id} cut={cut} index={i} />
            ))}
        </ol>
      )}
    </section>
  );
}
