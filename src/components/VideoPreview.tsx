import { useActiveProject } from "../store";
import { detectSource, type VideoSource } from "../../shared/videoSource";
import { sourceStreamUrl } from "../lib/api";
import { YouTubePlayer } from "./player/YouTubePlayer";
import { LocalFilePlayer } from "./player/LocalFilePlayer";

/**
 * In-page preview. Priority:
 *  1. YouTube  → `<YouTubePlayer>` (IFrame API scrub/mark, no download needed).
 *  2. otherwise, once the source is downloaded → `<LocalFilePlayer>` (real
 *     `<video>`, same scrub/mark flow).
 *  3. meanwhile → `<EmbedPreview>` (provider `<iframe>` or the thumbnail), with a
 *     note that the timed preview shows up when the download finishes.
 *
 * Vertical sources (Reels / Shorts / TikTok / portrait posts) are pillarboxed —
 * the frame goes portrait and the video/embed is centered with black side bars,
 * so the whole clip is visible and nothing is cropped.
 */
export function VideoPreview({ localReady = false }: { localReady?: boolean }) {
  const project = useActiveProject();
  if (!project) return null;
  const sourceUrl = project.sourceUrl.trim();
  const source = detectSource(project.sourceUrl);
  const vertical = Boolean(source.isVertical);

  // A Rumble *watch* URL carries no embeddable id, but yt-dlp resolves one into
  // `project.videoId` — use it so there's a scrubbable frame before the download.
  if (source.provider === "rumble" && !source.embedUrl && project.videoId) {
    source.embedUrl = `https://rumble.com/embed/${project.videoId}/`;
  }

  if (source.provider === "youtube" && source.id) {
    return <YouTubePlayer videoId={source.id} sourceUrl={sourceUrl} vertical={vertical} />;
  }

  if (localReady || source.provider === "local") {
    return (
      <LocalFilePlayer
        src={sourceStreamUrl(sourceUrl)}
        poster={project.thumbnail}
        sourceUrl={sourceUrl}
        vertical={vertical}
      />
    );
  }

  return (
    <EmbedPreview
      source={source}
      thumbnail={project.thumbnail}
      title={project.title}
      vertical={vertical}
    />
  );
}

function EmbedPreview({
  source,
  thumbnail,
  title,
  vertical,
}: {
  source: VideoSource;
  thumbnail?: string;
  title?: string;
  vertical: boolean;
}) {
  // Twitch (player.twitch.tv for VODs/channels, clips.twitch.tv for clips) only
  // plays when `parent` matches the page actually hosting the iframe, which we
  // only know at runtime — the embed URL from detectSource leaves it off.
  const src =
    source.embedUrl && source.provider === "twitch"
      ? `${source.embedUrl}&parent=${window.location.hostname}`
      : source.embedUrl;

  return (
    <section className={`preview ${vertical ? "preview--vertical" : ""}`}>
      <div className={`preview__frame ${vertical ? "preview__frame--vertical" : ""}`}>
        {src ? (
          <iframe
            src={src}
            title={title || "Prévia do vídeo"}
            allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; accelerometer; gyroscope; web-share"
            allowFullScreen
          />
        ) : thumbnail ? (
          <img className="preview__thumb" src={thumbnail} alt={title || "Prévia do vídeo"} />
        ) : (
          <div className="preview__thumb preview__thumb--empty">
            <span className="preview__spinner" aria-hidden="true" />
            <span>Aguardando prévia…</span>
          </div>
        )}
      </div>
      <p className="hint">
        Prévia com marcação de tempo (scrub, teclas I/O) aparece assim que o download termina. Até
        lá, veja os minutos no vídeo e digite os tempos na lista ao lado.
      </p>
    </section>
  );
}
