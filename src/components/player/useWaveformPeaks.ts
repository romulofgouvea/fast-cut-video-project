import { useEffect, useState } from "react";

/**
 * Fetch the audio-waveform peaks for a source URL from `/api/source/peaks`.
 * Returns `null` until they're ready — the endpoint 404s while the source is
 * still downloading, so we retry for a while.
 */
export function useWaveformPeaks(sourceUrl: string | undefined, buckets = 1400): number[] | null {
  const [result, setResult] = useState<{ url: string; peaks: number[] } | null>(null);

  useEffect(() => {
    if (!sourceUrl) return;

    let alive = true;
    let tries = 0;
    let timer = 0;

    const load = async () => {
      tries += 1;
      try {
        const res = await fetch(
          `/api/source/peaks?url=${encodeURIComponent(sourceUrl)}&n=${buckets}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { peaks: number[] };
          if (alive) setResult({ url: sourceUrl, peaks: data.peaks });
          return;
        }
      } catch {
        /* retry below */
      }
      if (alive && tries < 40) timer = window.setTimeout(load, 3000);
    };

    void load();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [sourceUrl, buckets]);

  // Ignore a stale result from a previous source.
  return result && result.url === sourceUrl ? result.peaks : null;
}
