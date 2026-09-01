import { Modal } from "@components/Modal/Modal";
import type { AccountStage } from "@/types";
import "./AccountModal.css";

interface AccountModalProps {
  stage: AccountStage;
  authUrl: string | null;
  error: string | null;
  onCancel: () => void;
  onRetry: () => void;
}

const CANCELLABLE: AccountStage[] = ["starting", "waiting", "error"];

export function AccountModal({
  stage,
  authUrl,
  error,
  onCancel,
  onRetry
}: AccountModalProps) {
  return (
    <Modal
      open={stage !== "idle"}
      label="Account"
      variant="account"
      dismissible={CANCELLABLE.includes(stage)}
      onDismiss={onCancel}
    >
      {stage === "starting" && (
        <div className="modal__status">
          <span className="modal__spinner" />
          <p className="modal__text">Preparing sign-in…</p>
        </div>
      )}

      {stage === "waiting" && (
        <>
          <h2 className="modal__title">Sign in to Epic Games</h2>

          <div className="modal__body">
            <p className="modal__text">
              {authUrl
                ? "Your browser could not be opened. Open this link manually to approve the request."
                : "Your browser has been opened. Approve the request there to link your account."}
            </p>

            {authUrl && <span className="modal__link">{authUrl}</span>}
          </div>

          <div className="modal__status modal__status--inline">
            <span className="modal__spinner modal__spinner--small" />
            <span className="modal__hint">Waiting for authorization…</span>
          </div>
        </>
      )}

      {stage === "finishing" && (
        <div className="modal__status">
          <span className="modal__spinner" />
          <p className="modal__text">Completing sign-in…</p>
        </div>
      )}

      {stage === "logout" && (
        <div className="modal__status">
          <span className="modal__spinner" />
          <p className="modal__text">Logging out…</p>
        </div>
      )}

      {stage === "error" && (
        <>
          <h2 className="modal__title">Sign-in failed</h2>

          <div className="modal__body">
            <p className="modal__text">{error}</p>

            <div className="modal__actions">
              <button className="modal__button" onClick={onCancel}>
                Close
              </button>
              <button
                className="modal__button modal__button--primary"
                onClick={onRetry}
              >
                Try Again
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
