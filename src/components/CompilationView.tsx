import { useEffect, useMemo, useState } from "react";
import { useStore, useActiveMontage, montageBaseName } from "../store";
import { ClipVideo } from "./ClipVideo";
import { MontagePreview } from "./MontagePreview";
import {
  compilationDownloadUrl,
  createCompilation,
  listClips,
  previewUrl,
  uploadClip,
  uploadPreviewUrl,
} from "../lib/api";
import type { MontageItem } from "../store";
import type { PoolClip } from "../../shared/types";
import { bundleName, dateStamp } from "../../shared/filename";

const itemPreview = (m: MontageItem) =>
  m.ref.kind === "cut" ? previewUrl(m.ref.jobId, m.ref.position) : uploadPreviewUrl(m.ref.uploadId);

export function CompilationView() {
  const mp = useActiveMontage();
  const addMontageItem = useStore((s) => s.addMontageItem);
  const removeMontageItem = useStore((s) => s.removeMontageItem);
  const reorderMontage = useStore((s) => s.reorderMontage);
  const clearMontage = useStore((s) => s.clearMontage);
  const setCompilation = useStore((s) => s.setCompilation);
  const projects = useStore((s) => s.projects);

  const [clips, setClips] = useState<PoolClip[]>([]);
  const [loadingClips, setLoadingClips] = useState(true);
  const [clipsError, setClipsError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const [pickerOpen, setPickerOpen] = useState(false);

  const [dragKey, setDragKey] = useState<string>();
  const [overKey, setOverKey] = useState<string>();

  const montage = useMemo(() => mp?.items ?? [], [mp]);

  // The pool should only show clips from each project's latest run. Stale
  // generations (a project that was re-processed) still exist server-side for a
  // moment, but showing them next to the fresh ones just confuses the choice.
  const currentJobIds = useMemo(
    () => new Set(projects.map((p) => p.jobId).filter(Boolean) as string[]),
    [projects],
  );
  const visibleClips = useMemo(
    () =>
      clips.filter(
        (c) =>
          currentJobIds.has(c.jobId) ||
          montage.some((m) => m.key === `cut:${c.jobId}:${c.position}`),
      ),
    [clips, currentJobIds, montage],
  );

  async function refreshClips() {
    setLoadingClips(true);
    setClipsError(undefined);
    try {
      setClips(await listClips());
    } catch (err) {
      setClipsError((err as Error).message);
    } finally {
      setLoadingClips(false);
    }
  }

  useEffect(() => {
    let live = true;
    listClips()
      .then((c) => live && setClips(c))
      .catch((err) => live && setClipsError((err as Error).message))
      .finally(() => live && setLoadingClips(false));
    return () => {
      live = false;
    };
  }, []);

  // Close the picker on Escape and lock body scroll while it's open.
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPickerOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [pickerOpen]);

  if (!mp) return null;
  const compilation = mp.compilation;
  const downloadName = bundleName(
    montageBaseName(mp) || "montagem",
    dateStamp(new Date(mp.createdAt)),
    "mp4",
  );

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(undefined);
    try {
      const { uploadId, originalName } = await uploadClip(file);
      addMontageItem({
        key: `upload:${uploadId}`,
        label: originalName,
        sub: "Arquivo enviado",
        ref: { kind: "upload", uploadId },
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    if (!mp || montage.length < 2 || starting) return;
    setStarting(true);
    setError(undefined);
    setCompilation({ id: undefined, phase: undefined, percent: 0, error: undefined });
    try {
      const { id } = await createCompilation({
        name: montageBaseName(mp) || undefined,
        items: montage.map((m) => m.ref),
      });
      setCompilation({ id, phase: "processing", percent: 0 });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  function onDrop(targetKey: string) {
    if (dragKey) reorderMontage(dragKey, targetKey);
    setDragKey(undefined);
    setOverKey(undefined);
  }

  const running = compilation.phase === "processing";
  const done = compilation.phase === "done";

  return (
    <div className="montage">
      <div className="editor__grid montage__grid">
        <div className="editor__col editor__col--left">
          <div className="editor__panel editor__panel--video">
            {montage.length === 0 ? (
              <div className="preview__frame preview__frame--empty">
                <span>Adicione clipes para ver a prévia do vídeo final.</span>
              </div>
            ) : (
              <MontagePreview items={montage} />
            )}
          </div>

          <section className="editor__panel process-block">
            {error && <p className="hint hint--error">{error}</p>}
            {compilation.phase === "failed" && (
              <p className="hint hint--error">
                A montagem falhou: {compilation.error || "erro desconhecido"}
              </p>
            )}
            {running && (
              <div className="bar">
                <div
                  className="bar__fill"
                  style={{ width: `${Math.min(100, Math.max(0, compilation.percent))}%` }}
                />
                <span className="bar__text">{Math.round(compilation.percent)}%</span>
              </div>
            )}

            <div className="montage__go-row">
              {done && compilation.id && (
                <a
                  className="btn btn--secondary"
                  href={compilationDownloadUrl(compilation.id, downloadName)}
                  download={downloadName}
                >
                  Baixar vídeo
                </a>
              )}
              <button
                type="button"
                className="btn btn--success process-block__go"
                disabled={montage.length < 2 || starting || running}
                onClick={generate}
              >
                {starting || running ? "Gerando..." : "Gerar vídeo"}
              </button>
            </div>
            {montage.length < 2 && (
              <p className="hint">Adicione pelo menos 2 clipes para gerar o vídeo.</p>
            )}
          </section>
        </div>

        <div className="editor__col editor__col--cuts editor__panel">
          <section className="cuts">
            <div className="cuts__head">
              <h3>
                Clipes {montage.length > 0 && <span className="cuts__count">{montage.length}</span>}
              </h3>
              <div className="cuts__head-actions">
                {montage.length > 0 && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={clearMontage}>
                    Limpar
                  </button>
                )}
                <button type="button" className="cuts__add" onClick={() => setPickerOpen(true)}>
                  + Adicionar clipes
                </button>
              </div>
            </div>

            {montage.length === 0 ? (
              <p className="hint">
                Nenhum clipe na timeline. Clique em “Adicionar clipes” para montar o vídeo.
              </p>
            ) : (
              <>
                <ol className="montage__timeline">
                  {montage.map((m, i) => {
                    const src = itemPreview(m);
                    return (
                      <li
                        key={m.key}
                        className={
                          "montage-card" +
                          (dragKey === m.key ? " is-dragging" : "") +
                          (overKey === m.key && dragKey !== m.key ? " is-over" : "")
                        }
                        draggable
                        onDragStart={() => setDragKey(m.key)}
                        onDragEnd={() => {
                          setDragKey(undefined);
                          setOverKey(undefined);
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (overKey !== m.key) setOverKey(m.key);
                        }}
                        onDrop={() => onDrop(m.key)}
                      >
                        <div className="montage-card__stage">
                          <span className="montage-card__index">{i + 1}</span>
                          {src ? (
                            <video className="montage-card__video" src={src} preload="metadata" />
                          ) : (
                            <div className="montage-card__video montage-card__video--file">🎞</div>
                          )}
                          <button
                            type="button"
                            className="montage-card__remove"
                            title="Remover da timeline"
                            onClick={() => removeMontageItem(m.key)}
                          >
                            ×
                          </button>
                        </div>
                        <div className="montage-card__body">
                          <span className="montage-card__label">{m.label}</span>
                          {m.sub && <span className="montage-card__sub">{m.sub}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {montage.length > 1 && (
                  <p className="hint">Arraste os cards para mudar a ordem do vídeo.</p>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {pickerOpen && (
        <div className="modal-overlay" role="presentation" onClick={() => setPickerOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Clipes disponíveis"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal__head">
              <h3>Clipes disponíveis</h3>
              <div className="modal__head-actions">
                <label className="btn btn--secondary montage__upload">
                  {uploading ? "Enviando…" : "Enviar arquivo"}
                  <input
                    type="file"
                    accept="video/*"
                    hidden
                    disabled={uploading}
                    onChange={(e) => {
                      void onUpload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void refreshClips()}
                >
                  Atualizar
                </button>
                <button
                  type="button"
                  className="modal__close"
                  aria-label="Fechar"
                  onClick={() => setPickerOpen(false)}
                >
                  ×
                </button>
              </div>
            </header>

            <div className="modal__body">
              {loadingClips ? (
                <p className="hint">Carregando cortes…</p>
              ) : clipsError ? (
                <p className="hint hint--error">{clipsError}</p>
              ) : visibleClips.length === 0 ? (
                <p className="hint">
                  Nenhum corte gerado ainda. Processe um projeto ou envie um arquivo acima.
                </p>
              ) : (
                <ul className="results__grid montage__pool">
                  {visibleClips.map((c) => {
                    const key = `cut:${c.jobId}:${c.position}`;
                    const added = montage.some((m) => m.key === key);
                    return (
                      <li key={key} className="result-card">
                        <ClipVideo
                          className="result-card__video"
                          src={previewUrl(c.jobId, c.position)}
                          controls
                        />
                        <div className="result-card__body">
                          <div className="result-card__head">
                            <span className="result-card__title">{c.name}</span>
                          </div>
                          <span className="result-card__range">{c.projectName}</span>
                          <button
                            type="button"
                            className="btn btn--secondary result-card__dl"
                            disabled={added}
                            onClick={() =>
                              addMontageItem({
                                key,
                                label: c.name,
                                sub: c.projectName,
                                ref: { kind: "cut", jobId: c.jobId, position: c.position },
                              })
                            }
                          >
                            {added ? "Adicionado" : "Adicionar"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="modal__foot">
              <span className="hint">{montage.length} clipe(s) na timeline</span>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setPickerOpen(false)}
              >
                Concluído
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
