/** Automatic output file naming: "<name>_<YYYY-MM-DD>.mp4". */

const INVALID_CHARS_RE = /[\\/:*?"<>|]/g;

/** Strip ASCII control characters (0x00-0x1F and 0x7F). */
function stripControlChars(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) continue;
    out += ch;
  }
  return out;
}

/** Sanitize a video title into a filesystem-safe slug. Empty input -> "". */
export function sanitizeTitle(title: string | undefined | null, maxLen = 80): string {
  if (!title) return "";
  const cleaned = stripControlChars(title)
    .replace(INVALID_CHARS_RE, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .trim();
  return cleaned.slice(0, maxLen).replace(/-+$/g, "");
}

/** Base prefix used for every generated file of a project. */
export function fileBase(title: string | undefined | null): string {
  return sanitizeTitle(title) || "video";
}

/** Local date as "YYYY-MM-DD". */
export function dateStamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Output file name for a cut: "<name>_<YYYY-MM-DD>.<ext>" (defaults to mp4). */
export function cutOutputName(
  base: string | undefined | null,
  dateStr: string,
  ext = "mp4",
): string {
  return `${fileBase(base)}_${dateStr}.${ext}`;
}

/** Name for a bundled download: "<name>_<YYYY-MM-DD>.<ext>" (ext without dot). */
export function bundleName(
  base: string | undefined | null,
  dateStr: string,
  ext: string,
): string {
  return `${fileBase(base)}_${dateStr}.${ext}`;
}

/**
 * Resolve a collision-free name given the names already taken in the target dir.
 * Adds "_(2)", "_(3)"... before the extension.
 */
export function resolveCollision(name: string, taken: Set<string> | string[]): string {
  const takenSet = taken instanceof Set ? taken : new Set(taken);
  if (!takenSet.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  let n = 2;
  let candidate = `${stem}_(${n})${ext}`;
  while (takenSet.has(candidate)) {
    n += 1;
    candidate = `${stem}_(${n})${ext}`;
  }
  return candidate;
}
