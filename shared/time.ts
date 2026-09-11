/** Utilities for "HH:MM:SS" timecodes used by cut intervals. */

const TIMECODE_RE = /^(\d{1,2}):([0-5]?\d):([0-5]?\d)$/;

/** Parse "HH:MM:SS" (or "H:MM:SS") into seconds. Returns null when malformed. */
export function parseTimecode(value: string): number | null {
  const m = TIMECODE_RE.exec(value.trim());
  if (!m) return null;
  const [, h, min, s] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(s);
}

/** Format seconds into "HH:MM:SS" (zero-padded, hours can exceed 2 digits). */
export function formatTimecode(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Formatted length of a cut from its "HH:MM:SS" bounds; null when unparseable or empty. */
export function cutDuration(start: string, end: string): string | null {
  const s = parseTimecode(start);
  const e = parseTimecode(end);
  return s !== null && e !== null && e > s ? formatTimecode(e - s) : null;
}

export type CutValidation =
  { ok: true; startSec: number; endSec: number } | { ok: false; reason: string };

/**
 * Validate a start/end pair. `durationSec` (when provided *and* a positive,
 * finite number) bounds `end`. A `0` / negative / NaN duration means "unknown"
 * — some sources (X/Twitter, live, a few embeds) come back from yt-dlp with no
 * duration, and we must not reject every cut in that case.
 * Overlap between different cuts is allowed by design, so it is not checked here.
 */
export function validateCut(start: string, end: string, durationSec?: number): CutValidation {
  const startSec = parseTimecode(start);
  const endSec = parseTimecode(end);
  if (startSec === null) return { ok: false, reason: "Início inválido (use HH:MM:SS)" };
  if (endSec === null) return { ok: false, reason: "Fim inválido (use HH:MM:SS)" };
  if (endSec <= startSec) return { ok: false, reason: "O fim deve ser maior que o início" };
  const hasBound = durationSec !== undefined && Number.isFinite(durationSec) && durationSec > 0;
  if (hasBound && endSec > Math.ceil(durationSec as number)) {
    return { ok: false, reason: "O fim ultrapassa a duração do vídeo" };
  }
  return { ok: true, startSec, endSec };
}
