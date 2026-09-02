/**
 * A video uploaded from the user's computer is referenced as `local:<uploadId>`
 * so it flows through the same `sourceUrl` plumbing as a web link — the pipeline,
 * the cache key and the preview all just special-case this scheme.
 */
const RE = /^local:([A-Za-z0-9_-]+)$/;

export function localSourceUrl(uploadId: string): string {
  return `local:${uploadId}`;
}

/** The upload id when `url` is a `local:` reference, else null. */
export function parseLocalSource(url: string): string | null {
  return RE.exec((url ?? "").trim())?.[1] ?? null;
}
