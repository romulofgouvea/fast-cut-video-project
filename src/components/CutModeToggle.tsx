import { useStore, useActiveProject } from "../store";
import type { CutMode } from "../../shared/types";

const OPTIONS: { value: CutMode; label: string; hint: string }[] = [
  {
    value: "precise",
    label: "Preciso",
    hint: "Recodifica o vídeo: cortes exatos no segundo pedido. Mais lento.",
  },
  {
    value: "fast",
    label: "Rápido",
    hint: "Sem recodificar: quase instantâneo, mas o início pula para o keyframe mais próximo.",
  },
];

export function CutModeToggle() {
  const setCutMode = useStore((s) => s.setCutMode);
  const cutMode = useActiveProject()?.cutMode ?? "precise";

  return (
    <section className="mode">
      <div className="mode__row">
        <h3>Modo de corte</h3>
        <div className="mode__options">
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`mode__option ${cutMode === o.value ? "is-active" : ""}`}
              title={o.hint}
            >
              <input
                type="radio"
                name="cutMode"
                value={o.value}
                checked={cutMode === o.value}
                onChange={() => setCutMode(o.value)}
                title={o.hint}
              />
              <span className="mode__title" title={o.hint}>
                {o.label}
              </span>
              <span className="mode__info" aria-hidden="true" title={o.hint}>
                ?
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
