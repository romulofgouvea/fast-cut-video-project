import { useRef, useState } from "react";
import { useStore, useActiveProject } from "../store";
import { isSupportedSourceUrl, detectSource } from "../../shared/videoSource";
import { localSourceUrl } from "../../shared/localSource";
import { loadYouTubeApi } from "../lib/youtubeApi";
import { uploadClip } from "../lib/api";

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");

export function UrlStep() {
  const project = useActiveProject();
  const { setUrl, setProjectName, openEditor } = useStore();

  const sourceUrl = project?.sourceUrl ?? "";
  const trimmed = sourceUrl.trim();
  const valid = isSupportedSourceUrl(trimmed);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string>();
  const [dragOver, setDragOver] = useState(false);

  if (!project) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    // Straight to the preview. The slow yt-dlp metadata fetch is fired by the
    // editor and fills in title/duration while you already set the cuts.
    openEditor();
  }

  async function onFile(file: File | undefined) {
    if (!file || uploading) return;
    setUploading(true);
    setUploadErr(undefined);
    try {
      const { uploadId, originalName } = await uploadClip(file);
      setUrl(localSourceUrl(uploadId));
      setProjectName(stripExt(originalName));
      openEditor();
    } catch (err) {
      setUploadErr((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <label className="field">
        <span className="field__label">URL do vídeo</span>
        <input
          type="text"
          inputMode="url"
          placeholder="Cole o link do vídeo (YouTube, Vimeo, Instagram, TikTok, Facebook, X…) ou o código de incorporação"
          value={sourceUrl}
          onChange={(e) => setUrl(e.target.value)}
          onFocus={() => {
            if (detectSource(trimmed).provider === "youtube") void loadYouTubeApi();
          }}
          autoFocus
        />
      </label>

      {trimmed && !valid && (
        <p className="hint hint--warn">
          Cole o link (http/https) da página do vídeo — ou o código de incorporação (
          <code>&lt;iframe&gt;</code>, <code>&lt;blockquote&gt;</code>…).
        </p>
      )}

      <p className="hint">
        YouTube, Vimeo, Dailymotion, Rumble, Instagram, TikTok, Facebook, X, Reddit, Twitch e mais —
        qualquer site suportado pelo yt-dlp. Pode colar só o link ou o código de incorporação que a
        gente extrai e já mostra a prévia.
      </p>

      <button type="submit" className="btn btn--success" disabled={!valid || uploading}>
        Abrir no player
      </button>

      <div className="urlstep__or" aria-hidden="true">
        <span>ou</span>
      </div>

      <div
        className={`dropzone ${dragOver ? "dropzone--over" : ""}`}
        onDragEnter={(e) => e.preventDefault()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void onFile(e.dataTransfer.files[0]);
        }}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="video/*,.mkv,.mov,.avi"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {uploading ? (
          <span>Enviando…</span>
        ) : (
          <span>
            <strong>Arraste um vídeo do computador</strong> ou clique para escolher
          </span>
        )}
      </div>

      {uploadErr && <p className="hint hint--error">{uploadErr}</p>}
    </form>
  );
}
