import { useMemo, useRef, useState } from "react";
import { PlayerControls, type PlayerAdapter } from "./PlayerControls";

/**
 * Plays the already-downloaded source `<video>` for any non-YouTube provider, so
 * the "mark start / mark end" flow works everywhere once the background download
 * has finished. Range requests to `/api/source` make seeking cheap.
 *
 * The frame takes the video's real aspect ratio once metadata loads, so portrait
 * clips (Reels, TikTok) are shown upright and centered with black side bars
 * instead of being letterboxed into a 16:9 box.
 *
 * Autoplay only works muted (browser policy), so we start muted; the sound toggle
 * in the transport bar (and pressing Play) turns it back on.
 */
export function LocalFilePlayer({
  src,
  poster,
  sourceUrl,
  vertical = false,
}: {
  src: string;
  poster?: string;
  sourceUrl?: string;
  vertical?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const [muted, setMuted] = useState(true);

  const adapter = useMemo<PlayerAdapter>(
    () => ({
      ready,
      duration,
      playing,
      muted,
      getTime: () => videoRef.current?.currentTime ?? 0,
      seekTo: (sec) => {
        if (videoRef.current) videoRef.current.currentTime = Math.max(0, sec);
      },
      togglePlay: () => {
        const v = videoRef.current;
        if (!v) return;
        // A deliberate play press brings the sound with it.
        v.muted = false;
        if (v.paused) void v.play();
        else v.pause();
      },
      toggleMute: () => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = !v.muted;
        if (!v.muted && v.volume === 0) v.volume = 1;
      },
    }),
    [ready, duration, playing, muted],
  );

  const isPortrait = ratio !== null ? ratio < 1 : vertical;

  return (
    <section className={`preview ${isPortrait ? "preview--vertical" : ""}`}>
      <div
        className={`preview__frame ${isPortrait ? "preview__frame--vertical" : ""}`}
        style={ratio ? { aspectRatio: String(ratio) } : undefined}
      >
        <video
          ref={videoRef}
          className="preview__video"
          src={src}
          poster={poster}
          controls
          autoPlay
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setDuration(v.duration || 0);
            if (v.videoWidth && v.videoHeight) setRatio(v.videoWidth / v.videoHeight);
            setReady(true);
          }}
          onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
          onVolumeChange={(e) => setMuted(e.currentTarget.muted || e.currentTarget.volume === 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
      </div>
      <PlayerControls adapter={adapter} sourceUrl={sourceUrl} />
    </section>
  );
}
