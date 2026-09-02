import { useEffect, useMemo, useRef, useState } from "react";
import { loadYouTubeApi } from "../../lib/youtubeApi";
import { PlayerControls, type PlayerAdapter } from "./PlayerControls";

/**
 * Embedded YouTube player, stripped to the minimum, with our own scrub bar +
 * transport (via `<PlayerControls>`). Uses the IFrame API for the time bridge.
 */
export function YouTubePlayer({
  videoId,
  sourceUrl,
  vertical = false,
}: {
  videoId: string;
  sourceUrl?: string;
  vertical?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!videoId || !host) return;
    let cancelled = false;
    setReady(false);
    setDuration(0);
    setPlaying(false);

    // YT.Player replaces the element it mounts on, so give it a throwaway child.
    const mount = document.createElement("div");
    host.appendChild(mount);

    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(mount, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          controls: 1,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          cc_load_policy: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            setReady(true);
            setDuration(playerRef.current?.getDuration?.() ?? 0);
            playerRef.current?.unMute?.();
            playerRef.current?.setVolume?.(100);
            setMuted(playerRef.current?.isMuted?.() ?? false);
          },
          onStateChange: (e) => {
            setPlaying(e.data === YT.PlayerState.PLAYING);
            const d = playerRef.current?.getDuration?.() ?? 0;
            if (d) setDuration(d);
            setMuted(playerRef.current?.isMuted?.() ?? false);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      host.replaceChildren();
    };
  }, [videoId]);

  const adapter = useMemo<PlayerAdapter>(
    () => ({
      ready,
      duration,
      playing,
      muted,
      getTime: () => playerRef.current?.getCurrentTime() ?? 0,
      seekTo: (sec) => playerRef.current?.seekTo(Math.max(0, sec), true),
      togglePlay: () => {
        const p = playerRef.current;
        if (!p) return;
        if (p.getPlayerState() === 1) {
          p.pauseVideo();
        } else {
          p.unMute();
          p.setVolume(100);
          p.playVideo();
        }
      },
      toggleMute: () => {
        const p = playerRef.current;
        if (!p) return;
        if (p.isMuted()) {
          p.unMute();
          if (p.getVolume() === 0) p.setVolume(100);
          setMuted(false);
        } else {
          p.mute();
          setMuted(true);
        }
      },
    }),
    [ready, duration, playing, muted],
  );

  return (
    <section className={`preview ${vertical ? "preview--vertical" : ""}`}>
      <div className={`preview__frame ${vertical ? "preview__frame--vertical" : ""}`}>
        <div ref={hostRef} />
      </div>
      <PlayerControls adapter={adapter} sourceUrl={sourceUrl} />
    </section>
  );
}
