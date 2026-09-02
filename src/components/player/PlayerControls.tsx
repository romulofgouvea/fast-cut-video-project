import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore, useActiveProject } from "../../store";
import { formatTimecode, parseTimecode } from "../../../shared/time";
import { Waveform } from "./Waveform";
import { useWaveformPeaks } from "./useWaveformPeaks";

/**
 * Everything a preview player must expose for the shared transport / scrub /
 * "mark in-out" UI. YouTube (IFrame API) and the local `<video>` element each
 * provide one of these.
 */
export type PlayerAdapter = {
  ready: boolean;
  duration: number;
  playing: boolean;
  /** Current mute state. `undefined` → the player exposes no mute control. */
  muted?: boolean;
  getTime: () => number;
  seekTo: (sec: number) => void;
  togglePlay: () => void;
  toggleMute?: () => void;
};

/**
 * Scrub bar + transport buttons + the single "Marcar início / fim" toggle, plus
 * the keyboard shortcuts. Provider-agnostic: it drives whatever `adapter` it's
 * given and publishes the time bridge (`seekTo` / `getPlayerTime`) to the store.
 */
export function PlayerControls({
  adapter,
  sourceUrl,
}: {
  adapter: PlayerAdapter;
  sourceUrl?: string;
}) {
  const { ready, duration, playing, muted, toggleMute } = adapter;

  const setSeekTo = useStore((s) => s.setSeekTo);
  const setPlayerBridge = useStore((s) => s.setPlayerBridge);
  const markStart = useStore((s) => s.markStart);
  const markEndAndCreate = useStore((s) => s.markEndAndCreate);
  const clearPendingStart = useStore((s) => s.clearPendingStart);
  const addCutFromSeconds = useStore((s) => s.addCutFromSeconds);
  const pendingStart = useStore((s) => s.pendingStart);

  const project = useActiveProject();
  const peaks = useWaveformPeaks(sourceUrl);
  const cutRegions = useMemo(
    () =>
      (project?.cuts ?? [])
        .map((c) => ({
          startSec: parseTimecode(c.start) ?? 0,
          endSec: parseTimecode(c.end) ?? 0,
        }))
        .filter((r) => r.endSec > r.startSec),
    [project?.cuts],
  );

  const [flash, setFlash] = useState<string>();
  const [now, setNow] = useState(0);
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  // Latest adapter without making it an effect dependency.
  const adapterRef = useRef(adapter);
  useEffect(() => {
    adapterRef.current = adapter;
  });

  // Publish the time bridge to the store while a player is mounted + ready.
  useEffect(() => {
    setSeekTo((sec) => adapterRef.current.seekTo(Math.max(0, sec)));
    setPlayerBridge(() => adapterRef.current.getTime(), ready);
    return () => {
      setSeekTo(undefined);
      setPlayerBridge(undefined, false);
    };
  }, [ready, setSeekTo, setPlayerBridge]);

  // Poll the position for the readout / scrub bar.
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => setNow(adapterRef.current.getTime()), 200);
    return () => clearInterval(id);
  }, [ready]);

  const seekTo = useCallback((sec: number) => {
    const s = Math.max(0, sec);
    adapterRef.current.seekTo(s);
    setNow(s);
  }, []);

  const seekBy = useCallback(
    (delta: number) => seekTo(adapterRef.current.getTime() + delta),
    [seekTo],
  );

  const doMarkEnd = useCallback(() => {
    setFlash(markEndAndCreate() ?? "Corte adicionado.");
  }, [markEndAndCreate]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(undefined), 3000);
    return () => clearTimeout(id);
  }, [flash]);

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable))
        return;
      const k = e.key.toLowerCase();
      if (k === "i") markStart();
      else if (k === "o") doMarkEnd();
      else if (k === "k" || e.key === " ") adapterRef.current.togglePlay();
      else if (k === "j") seekBy(-5);
      else if (k === "l") seekBy(5);
      else if (k === "arrowleft") seekBy(e.shiftKey ? -10 : -1);
      else if (k === "arrowright") seekBy(e.shiftKey ? 10 : 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, markStart, doMarkEnd, seekBy]);

  const dur = duration;
  const position = scrubbing ?? now;

  const hasWave = Boolean(peaks && peaks.length > 0 && dur > 0);

  return (
    <>
      {hasWave ? (
        <Waveform
          peaks={peaks!}
          duration={dur}
          currentTime={position}
          cuts={cutRegions}
          pendingStartSec={pendingStart}
          onSeek={seekTo}
          onCreateCut={ready ? addCutFromSeconds : undefined}
        />
      ) : (
        <input
          className="preview__scrub"
          type="range"
          min={0}
          max={Math.max(dur, 1)}
          step={0.1}
          value={Math.min(position, dur || 1)}
          disabled={!ready || !dur}
          onChange={(e) => setScrubbing(Number(e.target.value))}
          onPointerUp={() => {
            if (scrubbing !== null) seekTo(scrubbing);
            setScrubbing(null);
          }}
          onKeyUp={() => {
            if (scrubbing !== null) seekTo(scrubbing);
            setScrubbing(null);
          }}
        />
      )}
      {hasWave && (
        <p className="hint waveform__hint">
          Clique/arraste para navegar · <kbd>Shift</kbd>+arraste para criar um corte
        </p>
      )}

      <div className="preview__transport">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => seekBy(-10)}
          disabled={!ready}
          title="Voltar 10 segundos (Shift+←)"
        >
          -10s
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => seekBy(-5)}
          disabled={!ready}
          title="Voltar 5 segundos (tecla J)"
        >
          -5s
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => adapterRef.current.togglePlay()}
          disabled={!ready}
          title="Reproduzir / pausar (tecla K ou espaço)"
        >
          {playing ? "Pausar" : "Play"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => seekBy(5)}
          disabled={!ready}
          title="Avançar 5 segundos (tecla L)"
        >
          +5s
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => seekBy(10)}
          disabled={!ready}
          title="Avançar 10 segundos (Shift+→)"
        >
          +10s
        </button>

        <span className="preview__divider" aria-hidden="true" />

        {toggleMute && (
          <>
            <button
              type="button"
              className="btn btn--ghost preview__mute"
              onClick={toggleMute}
              disabled={!ready}
              title={muted ? "Ativar som" : "Silenciar"}
              aria-label={muted ? "Ativar som" : "Silenciar"}
              aria-pressed={muted}
            >
              <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
            </button>
            <span className="preview__divider" aria-hidden="true" />
          </>
        )}

        <span className="preview__clock">
          {formatTimecode(position)} / {formatTimecode(dur)}
        </span>

        <span className="preview__divider" aria-hidden="true" />

        <button
          type="button"
          className={`mark-btn mark-btn--toggle ${
            pendingStart === null ? "mark-btn--start" : "mark-btn--end"
          }`}
          onClick={pendingStart === null ? markStart : doMarkEnd}
          disabled={!ready}
          title={
            pendingStart === null
              ? "Marca o início do corte na posição atual (tecla I)"
              : "Marca o fim na posição atual e cria o corte (tecla O)"
          }
        >
          <kbd className="mark-btn__key">{pendingStart === null ? "I" : "O"}</kbd>
          <span className="mark-btn__text">
            {pendingStart === null ? "Marcar início" : "Marcar fim & criar corte"}
          </span>
          {pendingStart !== null && (
            <span className="mark-btn__val">{formatTimecode(pendingStart)}</span>
          )}
        </button>

        <button
          type="button"
          className="mark-btn mark-btn--clear"
          onClick={clearPendingStart}
          disabled={pendingStart === null}
          title="Descartar início marcado"
        >
          Limpar
        </button>
      </div>

      {flash && <p className="hint hint--ok">{flash}</p>}
    </>
  );
}
