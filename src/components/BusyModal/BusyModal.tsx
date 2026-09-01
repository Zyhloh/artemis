import { Modal } from "@components/Modal/Modal";
import "./BusyModal.css";

interface BusyModalProps {
  open: boolean;
  message: string;
  detail?: string;
  error?: string | null;
  onClose: () => void;
}

export function BusyModal({
  open,
  message,
  detail,
  error,
  onClose
}: BusyModalProps) {
  const failed = Boolean(error);

  return (
    <Modal
      open={open}
      label={message}
      variant="busy"
      dismissible={failed}
      onDismiss={onClose}
    >
      {failed ? (
        <>
          <h2 className="modal__title">That did not finish</h2>

          <div className="modal__body">
            <p className="modal__text">{error}</p>
          </div>

          <div className="modal__actions">
            <button
              className="modal__button modal__button--primary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </>
      ) : (
        <div className="modal__status">
          <span className="modal__spinner" />
          <p className="busy__message">{message}</p>
          {detail && <p className="busy__detail">{detail}</p>}
        </div>
      )}
    </Modal>
  );
}
