import { Modal } from "@components/Modal/Modal";
import "./ConfirmModal.css";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Keep Downloading",
  onConfirm,
  onClose
}: ConfirmModalProps) {
  return (
    <Modal open={open} label={title} variant="confirm" onDismiss={onClose}>
      <h2 className="modal__title">{title}</h2>

      <div className="modal__body">
        <p className="modal__text">{body}</p>
      </div>

      <div className="modal__actions">
        <button className="modal__button" onClick={onClose}>
          {cancelLabel}
        </button>
        <button
          className="modal__button modal__button--danger"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
