import { useStore, useActiveProject } from "../store";
import { formatTimecode, parseTimecode, validateCut } from "../../shared/time";
import type { VideoCut } from "../../shared/types";

type Props = { cut: VideoCut; index: number };

export function CutRow({ cut, index }: Props) {
  const { updateCut, removeCut, duplicateCut } = useStore();
  const seekTo = useStore((s) => s.seekTo);
  const duration = useActiveProject()?.duration;
  const result = validateCut(cut.start, cut.end, duration);

  const jump = (value: string) => {
    const secs = parseTimecode(value);
    if (secs !== null) seekTo?.(secs);
  };

  return (
    <li className="cut-row">
      <div className="cut-row__head">
        <span className="cut-row__num">{index + 1}</span>
        <input
          className="cut-row__name"
          value={cut.name ?? ""}
          placeholder={`Corte ${index + 1}`}
          onChange={(e) => updateCut(cut.id, { name: e.target.value })}
        />
      </div>

      <div className="cut-row__times">
        <label className="field field--inline">
          <span className="field__label">Início</span>
          <div className="cut-row__time">
            <input
              className="time-input"
              value={cut.start}
              placeholder="00:00:00"
              onChange={(e) => updateCut(cut.id, { start: e.target.value })}
            />
            {seekTo && (
              <button
                type="button"
                className="btn btn--ghost cut-row__seek"
                title="Ir para este ponto no player"
                onClick={() => jump(cut.start)}
              >
                Ir
              </button>
            )}
          </div>
        </label>
        <label className="field field--inline">
          <span className="field__label">Fim</span>
          <div className="cut-row__time">
            <input
              className="time-input"
              value={cut.end}
              placeholder="00:01:00"
              onChange={(e) => updateCut(cut.id, { end: e.target.value })}
            />
            {seekTo && (
              <button
                type="button"
                className="btn btn--ghost cut-row__seek"
                title="Ir para este ponto no player"
                onClick={() => jump(cut.end)}
              >
                Ir
              </button>
            )}
          </div>
        </label>
      </div>

      {!result.ok && <p className="hint hint--error">{result.reason}</p>}

      <div className="cut-row__actions">
        <span className="cut-row__dur" title="Duração do corte">
          {result.ok ? formatTimecode(result.endSec - result.startSec) : "--:--:--"}
        </span>
        <button
          type="button"
          className="btn btn--ghost cut-row__action"
          onClick={() => duplicateCut(cut.id)}
        >
          Duplicar
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--danger cut-row__action"
          onClick={() => removeCut(cut.id)}
        >
          Remover
        </button>
      </div>
    </li>
  );
}
