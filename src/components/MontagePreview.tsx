import { useEffect, useMemo, useRef, useState } from "react";
import type { MontageItem } from "../store";
import { previewUrl, uploadPreviewUrl } from "../lib/api";
import { formatTimecode } from "../../shared/time";

const srcFor = (m: MontageItem) =>
  m.ref.kind === "cut" ? previewUrl(m.ref.jobId, m.ref.position) : uploadPreviewUrl(m.ref.uploadId);

/**
 * Stitched preview of the whole montage timeline. Reuses the editor player's
 * shell (`.preview` / `.preview__frame` / `.preview__transport`) so the montage
 * screen feels like the rest of the app: one black stage, one scrub bar that
 * spans every clip, and the same -10s / -5s / Play / +5s / +10s transport.
 *
 * Under the hood it swaps the `<video>` source as playback crosses a clip
 * boundary; the scrub works in "global" seconds once every clip's duration has
 * been probed (a hidden metadata-only load per clip).
 */
export function MontagePreview({ items }: { items: MontageItem[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingOffsetRef = useRef(0);
  // Latest "should be playing" intent, read inside listeners without re-running effects.
  const playingRef = useRef(false);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(0);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  // Clip durations keyed by MontageItem.key — stale keys just linger harmlessly.
  const [durByKey, setDurByKey] = useState<Record<string, number>>({});

  const count = items.length;
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const itemsKey = items.map((m) => m.key).join("|");
  const durations = items.map((m) => durByKey[m.key]);

  // Probe each new clip's duration (metadata only) so the scrub can be global.
  useEffect(() => {
    const els = items.map((m) => {
      if (durByKey[m.key] != null) return null;
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.src = srcFor(m);
      const fill = (value: number) =>
        setDurByKey((prev) => (prev[m.key] != null ? prev : { ...prev, [m.key]: value }));
      v.addEventListener("loadedmetadata", () => fill(v.duration || 0));
      v.addEventListener("error", () => fill(0));
      return v;
    });
    return () => {
      for (const v of els) {
        if (!v) continue;
        v.removeAttribute("src");
        v.load();
      }
    };
  }, [itemsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const { starts, total, ready } = useMemo(() => {
    const acc: number[] = [];
    let sum = 0;
    for (const d of durations) {
      acc.push(sum);
      sum += d ?? 0;
    }
    return {
      starts: acc,
      total: sum,
      ready: durations.length === count && durations.every((d) => d != null),
    };
  }, [durations, count]);

  const globalTime = () => (starts[safeIndex] ?? 0) + (videoRef.current?.currentTime ?? 0);

  // Load whenever the current clip changes; apply a pending cross-clip seek and
  // keep rolling if we were mid-playback (e.g. a clip just ended).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.load();
    const onMeta = () => {
      if (pendingOffsetRef.current > 0) {
        v.currentTime = pendingOffsetRef.current;
        pendingOffsetRef.current = 0;
      }
      if (playingRef.current) v.play().catch(() => setPlaying(false));
    };
    v.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [safeIndex, itemsKey]);

  // Poll the position for the readout / scrub.
  useEffect(() => {
    const id = setInterval(() => {
      if (videoRef.current) setNow((starts[safeIndex] ?? 0) + videoRef.current.currentTime);
    }, 200);
    return () => clearInterval(id);
  }, [safeIndex, starts]);

  if (count === 0) return null;

  const seekGlobal = (g: number) => {
    const clamped = Math.max(0, total > 0 ? Math.min(g, total) : g);
    let target = starts.length - 1;
    for (let i = 0; i < starts.length; i++) {
      const end = starts[i] + (durations[i] ?? Number.POSITIVE_INFINITY);
      if (clamped < end) {
        target = i;
        break;
      }
    }
    const offset = Math.max(0, clamped - (starts[target] ?? 0));
    if (target === safeIndex) {
      if (videoRef.current) videoRef.current.currentTime = offset;
    } else {
      pendingOffsetRef.current = offset;
      setIndex(target);
    }
    setNow(clamped);
  };

  const seekBy = (delta: number) => seekGlobal(globalTime() + delta);

  const jumpToClip = (i: number) => {
    pendingOffsetRef.current = 0;
    if (i === safeIndex && videoRef.current) videoRef.current.currentTime = 0;
    else setIndex(i);
    setNow(starts[i] ?? 0);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setPlaying(true);
      v.play().catch(() => setPlaying(false));
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 1;
  };

  const onEnded = () => {
    if (safeIndex < count - 1) {
      pendingOffsetRef.current = 0;
      setIndex(safeIndex + 1);
    } else {
      setPlaying(false);
    }
  };

  const position = scrubbing ?? now;
  const current = items[safeIndex];

  return (
    <section className="preview montage-preview">
      <div className="preview__frame">
        <video
          ref={videoRef}
          className="preview__video"
          src={srcFor(current)}
          playsInline
          preload="metadata"
          onClick={togglePlay}
          onEnded={onEnded}
          onPlay={() => setPlaying(true)}
          onPause={(e) => {
            // Ignore the pause the browser fires when a clip reaches its end —
            // onEnded handles the hop to the next clip and playback continues.
            if (!e.currentTarget.ended) setPlaying(false);
          }}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted || e.currentTarget.volume === 0)}
        />
      </div>

      <div className="montage-preview__map" role="presentation">
        {items.map((m, i) => (
          <button
            key={m.key}
            type="button"
            className={
              "montage-preview__seg" +
              (i === safeIndex ? " is-active" : "") +
              (i < safeIndex ? " is-done" : "")
            }
            style={{ flexGrow: Math.max(0.15, durations[i] ?? 1) }}
            title={`Clipe ${i + 1}: ${m.label}`}
            aria-label={`Ir para o clipe ${i + 1}: ${m.label}`}
            onClick={() => jumpToClip(i)}
          />
        ))}
      </div>

      <input
        className="preview__scrub"
        type="range"
        min={0}
        max={Math.max(total, 1)}
        step={0.1}
        value={Math.min(position, total || 1)}
        disabled={!ready || total === 0}
        onChange={(e) => setScrubbing(Number(e.target.value))}
        onPointerUp={() => {
          if (scrubbing !== null) seekGlobal(scrubbing);
          setScrubbing(null);
        }}
        onKeyUp={() => {
          if (scrubbing !== null) seekGlobal(scrubbing);
          setScrubbing(null);
        }}
      />

      <div className="preview__transport">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => seekBy(-10)}
          title="Voltar 10 segundos"
        >
          -10s
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => seekBy(-5)}
          title="Voltar 5 segundos"
        >
          -5s
        </button>
        <button type="button" className="btn btn--ghost" onClick={togglePlay}>
          {playing ? "Pausar" : "Play"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => seekBy(5)}
          title="Avançar 5 segundos"
        >
          +5s
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => seekBy(10)}
          title="Avançar 10 segundos"
        >
          +10s
        </button>

        <span className="preview__divider" aria-hidden="true" />

        <button
          type="button"
          className="btn btn--ghost preview__mute"
          onClick={toggleMute}
          title={muted ? "Ativar som" : "Silenciar"}
          aria-label={muted ? "Ativar som" : "Silenciar"}
          aria-pressed={muted}
        >
          <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
        </button>

        <span className="preview__divider" aria-hidden="true" />

        <span className="preview__clock">
          {formatTimecode(position)} / {ready ? formatTimecode(total) : "--:--"}
        </span>

        <span className="preview__divider" aria-hidden="true" />

        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => jumpToClip(Math.max(0, safeIndex - 1))}
          disabled={safeIndex === 0}
          title="Clipe anterior"
        >
          ‹ Anterior
        </button>
        <span className="preview__clock">
          Clipe {safeIndex + 1} / {count}
        </span>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => jumpToClip(Math.min(count - 1, safeIndex + 1))}
          disabled={safeIndex >= count - 1}
          title="Próximo clipe"
        >
          Próximo ›
        </button>
      </div>
    </section>
  );
}
