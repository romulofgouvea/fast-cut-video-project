import { useRef, useState } from "react";
import { useStore, useActiveProject } from "../store";
import { uploadWatermarkImage } from "../lib/api";
import type { OutputFormat, WatermarkPosition } from "../../shared/types";

const FORMATS: { value: OutputFormat; label: string; hint: string }[] = [
  { value: "mp4", label: "MP4", hint: "vídeo (H.264)" },
  { value: "webm", label: "WebM", hint: "vídeo (VP9)" },
  { value: "gif", label: "GIF", hint: "animação, sem som" },
  { value: "mp3", label: "MP3", hint: "só o áudio" },
];

const POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "top-left", label: "↖" },
  { value: "top-right", label: "↗" },
  { value: "bottom-left", label: "↙" },
  { value: "bottom-right", label: "↘" },
];

export function OutputOptions() {
  const project = useActiveProject();
  const setFormat = useStore((s) => s.setFormat);
  const setWatermark = useStore((s) => s.setWatermark);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgErr, setImgErr] = useState<string>();
  const [imgName, setImgName] = useState<string>();

  if (!project) return null;
  const format = project.format ?? "mp4";
  const wm = project.watermark;
  const wmEnabled = Boolean(wm);
  const audioOnly = format === "mp3";

  const patch = (p: Partial<NonNullable<typeof wm>>) =>
    setWatermark({
      position: "bottom-right",
      opacity: 0.85,
      ...wm,
      ...p,
    });

  async function onImage(file: File | undefined) {
    if (!file) return;
    setImgErr(undefined);
    try {
      const { uploadId, originalName } = await uploadWatermarkImage(file);
      setImgName(originalName);
      patch({ imageId: uploadId });
    } catch (err) {
      setImgErr((err as Error).message);
    }
  }

  return (
    <div className="outopts">
      <div className="outopts__row">
        <span className="outopts__label">Formato</span>
        <div className="outopts__formats">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`chip ${format === f.value ? "chip--on" : ""}`}
              onClick={() => setFormat(f.value)}
              title={f.hint}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="outopts__row">
        <label className="outopts__label outopts__check">
          <input
            type="checkbox"
            checked={wmEnabled}
            disabled={audioOnly}
            onChange={(e) =>
              setWatermark(
                e.target.checked ? { position: "bottom-right", opacity: 0.85 } : undefined,
              )
            }
          />
          Marca d’água {audioOnly && <span className="hint">(não se aplica a MP3)</span>}
        </label>

        {wmEnabled && !audioOnly && (
          <div className="outopts__wm">
            <input
              type="text"
              placeholder="Texto (ex.: @meucanal)"
              maxLength={80}
              value={wm?.text ?? ""}
              onChange={(e) => patch({ text: e.target.value })}
            />

            <div className="outopts__wm-line">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => fileRef.current?.click()}
              >
                {wm?.imageId ? `Logo: ${imgName ?? "enviada"}` : "+ Logo (PNG)"}
              </button>
              {wm?.imageId && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => patch({ imageId: undefined })}
                >
                  remover logo
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => void onImage(e.target.files?.[0])}
              />
            </div>

            <div className="outopts__wm-line">
              <span className="hint">Posição</span>
              {POSITIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`chip chip--sq ${wm?.position === p.value ? "chip--on" : ""}`}
                  onClick={() => patch({ position: p.value })}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label className="outopts__wm-line">
              <span className="hint">Opacidade {Math.round((wm?.opacity ?? 0.85) * 100)}%</span>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={wm?.opacity ?? 0.85}
                onChange={(e) => patch({ opacity: Number(e.target.value) })}
              />
            </label>

            {imgErr && <p className="hint hint--error">{imgErr}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
