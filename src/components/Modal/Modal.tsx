import { useCallback, useEffect, type ReactNode } from "react";
import "./Modal.css";

interface ModalProps {
  open: boolean;
  label: string;
  variant: string;
  dismissible?: boolean;
  onDismiss: () => void;
  children: ReactNode;
}

export function Modal({
  open,
  label,
  variant,
  dismissible = true,
  onDismiss,
  children
}: ModalProps) {
  const dismiss = useCallback(() => {
    if (dismissible) onDismiss();
  }, [dismissible, onDismiss]);

  useEffect(() => {
    if (!open) return;

    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, dismiss]);

  return (
    <div
      className={`modal${open ? " modal--open" : ""}`}
      onClick={dismiss}
      aria-hidden={!open}
    >
      <div
        className={`modal__panel modal__panel--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
