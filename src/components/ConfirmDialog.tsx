import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** App-styled confirmation modal — replaces window.confirm. Esc / click-outside cancel. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  // Keep the latest callback without making it an effect dependency — otherwise
  // a parent re-render (new closure identity) re-runs the body-lock effect and
  // can leave `overflow: hidden` stuck on <body>.
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    cancelRef.current = onCancel;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelRef.current();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // The YouTube <iframe> in the editor renders on its own compositing layer and
    // can punch through the overlay — hide it while the dialog is up.
    document.body.classList.add("has-modal");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      document.body.classList.remove("has-modal");
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="modal modal--sm"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <h3>{title}</h3>
          <button type="button" className="modal__close" aria-label="Fechar" onClick={onCancel}>
            ×
          </button>
        </header>

        <div className="modal__body">
          <p className="hint">{message}</p>
        </div>

        <footer className="modal__foot modal__foot--end">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? "btn--destructive" : "btn--primary"}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
