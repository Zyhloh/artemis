import { Icon } from "@components/Icon/Icon";
import { Modal } from "@components/Modal/Modal";
import { displayName, initial } from "@lib/display";
import type { Account } from "@/types";
import "./SwitchAccountModal.css";

interface SwitchAccountModalProps {
  open: boolean;
  accounts: Account[];
  avatars?: ReadonlyMap<string, string | null>;
  current: string | null;
  onClose: () => void;
  onSelect: (accountId: string) => void;
  onRemove: (accountId: string) => void;
  onAdd: () => void;
}

export function SwitchAccountModal({
  open,
  accounts,
  avatars,
  current,
  onClose,
  onSelect,
  onRemove,
  onAdd
}: SwitchAccountModalProps) {
  return (
    <Modal
      open={open}
      label="Switch Account"
      variant="switch"
      onDismiss={onClose}
    >
      <h2 className="modal__title">Switch Account</h2>

      <div className="switch__list">
        {accounts.map((entry) => {
          const active = entry.accountId === current;
          const label = displayName(entry.displayName);

          return (
            <div
              key={entry.accountId}
              className={`switch__row${active ? " switch__row--active" : ""}`}
            >
              <button
                className="switch__pick"
                onClick={() => onSelect(entry.accountId)}
                disabled={active}
              >
                <span className="switch__avatar">
                  {avatars?.get(entry.accountId) ? (
                    <img
                      className="switch__face"
                      src={avatars.get(entry.accountId) ?? undefined}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    initial(entry.displayName)
                  )}
                </span>
                <span className="switch__name" dir="auto">
                  {label}
                </span>
              </button>

              {active && (
                <span className="switch__check">
                  <Icon name="check" size={14} />
                </span>
              )}

              <button
                className="switch__delete"
                onClick={() => onRemove(entry.accountId)}
                aria-label={`Remove ${label}`}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="modal__actions">
        <button className="modal__button modal__button--primary" onClick={onAdd}>
          Add Account
        </button>
      </div>
    </Modal>
  );
}
