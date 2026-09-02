import type { VideoHTMLAttributes } from "react";

/**
 * Preview <video> for a generated clip. Audio always plays at 100%: we force
 * volume/unmute on load (browsers persist the last-used volume per origin) and
 * CSS hides the volume + mute controls. The big centre play-button overlay is
 * hidden via CSS too so it doesn't sit on top of the frame.
 */
export function ClipVideo(props: VideoHTMLAttributes<HTMLVideoElement>) {
  return (
    <video
      preload="metadata"
      {...props}
      onLoadedMetadata={(e) => {
        e.currentTarget.volume = 1;
        e.currentTarget.muted = false;
        props.onLoadedMetadata?.(e);
      }}
    />
  );
}
