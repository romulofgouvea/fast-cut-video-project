import { useEffect, useRef, useState } from "react";
import { formatTimecode } from "../../../shared/time";

export type CutРegionInput = { startSec: number; endSec: number };

type Props = {
  peaks: number[];
  duration: number;
  /** Live playhead position, seconds. */
  currentTime: number;
  cuts: CutРegionInput[];
  pendingStartSec: number | null;
  onSeek: (sec: number) => void;
  /** Shift-drag a span to create a cut. */
  onCreateCut?: (startSec: number, endSec: number) => void;
};

const HEIGHT = 72;

/**
 * Canvas waveform that doubles as the scrub timeline: click / drag to seek,
 * Shift-drag to carve out a new cut. Existing cuts show as shaded bands and the
 * pending "mark start" as a green line.
 */
export function Waveform({
  peaks,
  duration,
  currentTime,
  cuts,
  pendingStartSec,
  onSeek,
  onCreateCut,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<{ fromSec: number; toSec: number; cut: boolean } | null>(null);
  const [hoverSec, setHoverSec] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, HEIGHT);

    const css = getComputedStyle(canvas);
    const wave = css.getPropertyValue("--wave").trim() || "#6b7280";
    const waveDim = css.getPropertyValue("--wave-dim").trim() || "#3f3f46";
    const accent = css.getPropertyValue("--primary").trim() || "#ef4444";
    const ok = css.getPropertyValue("--ok").trim() || "#008080";

    const mid = HEIGHT / 2;
    const n = peaks.length;
    const bw = width / n;

    // Waveform bars.
    for (let i = 0; i < n; i += 1) {
      const x = i * bw;
      const secAt = (i / n) * duration;
      const inCut = cuts.some((c) => secAt >= c.startSec && secAt <= c.endSec);
      ctx.fillStyle = inCut ? wave : waveDim;
      const h = Math.max(1, peaks[i] * (HEIGHT - 6));
      ctx.fillRect(x, mid - h / 2, Math.max(1, bw - 0.5), h);
    }

    const xOf = (sec: number) => (duration > 0 ? (sec / duration) * width : 0);

    // Existing cut bands.
    ctx.fillStyle = hexToRgba(accent, 0.16);
    for (const c of cuts) {
      const x1 = xOf(c.startSec);
      ctx.fillRect(x1, 0, Math.max(1, xOf(c.endSec) - x1), HEIGHT);
    }

    // Drag selection.
    if (drag) {
      const a = xOf(Math.min(drag.fromSec, drag.toSec));
      const b = xOf(Math.max(drag.fromSec, drag.toSec));
      ctx.fillStyle = hexToRgba(drag.cut ? ok : accent, 0.22);
      ctx.fillRect(a, 0, Math.max(1, b - a), HEIGHT);
    }

    // Hover guide (only when not dragging).
    if (hoverSec != null && !drag) {
      ctx.strokeStyle = hexToRgba(wave.startsWith("#") ? wave : "#9ca3af", 0.9);
      ctx.lineWidth = 1;
      line(ctx, xOf(hoverSec), HEIGHT);
    }

    // Pending "mark start".
    if (pendingStartSec != null) {
      ctx.strokeStyle = ok;
      ctx.lineWidth = 2;
      line(ctx, xOf(pendingStartSec), HEIGHT);
    }

    // Playhead.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    line(ctx, xOf(currentTime), HEIGHT);
  }, [peaks, duration, currentTime, cuts, pendingStartSec, drag, hoverSec, width]);

  const secAtClientX = (clientX: number): number => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  return (
    <div
      ref={wrapRef}
      className="waveform"
      style={{ height: HEIGHT }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        const sec = secAtClientX(e.clientX);
        setDrag({ fromSec: sec, toSec: sec, cut: e.shiftKey });
        if (!e.shiftKey) onSeek(sec);
      }}
      onPointerMove={(e) => {
        const sec = secAtClientX(e.clientX);
        setHoverSec(sec);
        if (!drag) return;
        setDrag({ ...drag, toSec: sec });
        if (!drag.cut) onSeek(sec);
      }}
      onPointerLeave={() => setHoverSec(null)}
      onPointerUp={() => {
        if (drag?.cut && onCreateCut) {
          const a = Math.min(drag.fromSec, drag.toSec);
          const b = Math.max(drag.fromSec, drag.toSec);
          if (b - a >= 0.5) onCreateCut(a, b);
        }
        setDrag(null);
      }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: HEIGHT }} />
      {hoverSec != null && duration > 0 && width > 0 && (
        <span
          className="waveform__tip"
          style={{
            left: `${Math.min(width - 30, Math.max(30, (hoverSec / duration) * width))}px`,
          }}
        >
          {formatTimecode(drag ? drag.toSec : hoverSec)}
        </span>
      )}
    </div>
  );
}

function line(ctx: CanvasRenderingContext2D, x: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, h);
  ctx.stroke();
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(79,140,255,${alpha})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`;
}
