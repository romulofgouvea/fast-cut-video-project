import { useStore, useActiveProject } from "../store";
import { formatTimecode } from "../../shared/time";

export function VideoInfoCard() {
  const project = useActiveProject();
  const loadVideoInfo = useStore((s) => s.loadVideoInfo);
  if (!project) return null;
  const { title, duration, thumbnail, infoStatus, infoError, id } = project;

  return (
    <div className="video-card">
      {thumbnail && <img className="video-card__thumb" src={thumbnail} alt="" />}
      <div className="video-card__meta">
        <h2 className="video-card__title">
          {title || (infoStatus === "loading" ? "Carregando dados do vídeo…" : "Vídeo")}
        </h2>
        {duration !== undefined ? (
          <p className="video-card__duration">Duração: {formatTimecode(duration)}</p>
        ) : infoStatus === "error" ? (
          <p className="hint hint--warn">
            Não consegui obter título/duração ({infoError}).{" "}
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => void loadVideoInfo(id)}
            >
              Tentar de novo
            </button>
          </p>
        ) : (
          <p className="hint">Você já pode assistir e marcar os cortes.</p>
        )}
      </div>
    </div>
  );
}
