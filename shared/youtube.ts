/** Extract the 11-char YouTube video id from any common YouTube URL shape. */
export function extractYouTubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\.|^m\./, "").toLowerCase();
  const id =
    host === "youtu.be"
      ? parsed.pathname.slice(1)
      : parsed.searchParams.get("v") ||
        parsed.pathname.match(/\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] ||
        "";
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
