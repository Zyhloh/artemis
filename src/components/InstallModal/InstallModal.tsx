import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Icon } from "@components/Icon/Icon";
import { Modal } from "@components/Modal/Modal";
import { useInstallOptions } from "@hooks/useInstallOptions";
import { grantInstallPath, prepareInstallPath } from "@lib/library";
import type { LibraryGame } from "@/types";
import "./InstallModal.css";

interface InstallModalProps {
  game: LibraryGame | null;
  onInstall: (
    appName: string,
    title: string,
    path: string,
    tags: string[]
  ) => Promise<void>;
  onImport: (appName: string, title: string, path: string) => Promise<void>;
  onClose: () => void;
}

const gigabytes = (bytes: number) => {
  const value = bytes / 1024 ** 3;

  return value >= 10 || value === 0
    ? `${Math.round(value)} GB`
    : `${value.toFixed(1)} GB`;
};

export function InstallModal({
  game,
  onInstall,
  onImport,
  onClose
}: InstallModalProps) {
  const {
    options,
    selected,
    tags,
    download,
    needed,
    space,
    path,
    access,
    status,
    setPath,
    toggle,
    inspect
  } = useInstallOptions(game);
  const [issue, setIssue] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const browse = useCallback(async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose install location",
      defaultPath: path || undefined
    }).catch(() => null);

    if (typeof picked === "string") {
      const root = /^[A-Za-z]:[\\/]?$/.test(picked);
      setPath(root && game ? `${picked.replace(/[\\/]$/, "")}\\${game.title}` : picked);
      setIssue(null);
    }
  }, [path, game, setPath]);

  const adopt = useCallback(async () => {
    if (!game) return;

    const picked = await open({
      directory: true,
      multiple: false,
      title: `Locate the existing ${game.title} folder`
    }).catch(() => null);

    if (typeof picked !== "string") return;

    void onImport(game.appName, game.title, picked);
    onClose();
  }, [game, onImport, onClose]);

  const confirm = useCallback(async () => {
    setWorking(true);
    setIssue(null);

    try {
      const target = await prepareInstallPath(path);

      if (game) {
        await onInstall(game.appName, game.title, target, tags);
      }

      onClose();
    } catch (cause) {
      setIssue(
        cause instanceof Error
          ? cause.message
          : "That folder could not be created."
      );
    } finally {
      setWorking(false);
    }
  }, [game, path, tags, onInstall, onClose]);

  const blocked = access !== null && !access.writable;
  const canElevate = blocked && !access.elevated;
  const cramped = space !== null && needed > 0 && needed > space;

  const authorise = useCallback(async () => {
    setWorking(true);
    setIssue(null);

    try {
      await grantInstallPath(path);
      await inspect();
    } catch (cause) {
      setIssue(
        cause instanceof Error ? cause.message : "Access could not be granted."
      );
    } finally {
      setWorking(false);
    }
  }, [path, inspect]);

  return (
    <Modal
      open={game !== null}
      label="Install game"
      variant="install"
      dismissible={!working}
      onDismiss={onClose}
    >
      <h2 className="modal__title">Install {game?.title ?? "Game"}</h2>

      {status === "loading" ? (
        <div className="install__loading">
          <span className="modal__spinner" />
          <p className="modal__text">Loading install options…</p>
        </div>
      ) : (
        <>
          <div className="install__field">
            <span className="install__label">Location</span>
            <div className="install__path">
              <span className="install__value">
                <bdi className="install__pathtext">{path}</bdi>
              </span>
              <button className="install__browse" onClick={() => void browse()}>
                Browse
              </button>
            </div>

            <span
              className={`install__space${
                cramped ? " install__space--short" : ""
              }`}
            >
              {space === null
                ? "Checking available space…"
                : `Space Available On Disk: ${gigabytes(space)}`}
              {needed > 0 && ` · Needs ${gigabytes(needed)}`}
            </span>
          </div>

          <div className="install__field">
            <span className="install__label">Components</span>
            <div className="install__list">
              {options.map((option) => {
                const checked = selected.includes(option.id);

                return (
                  <label
                    className={`install__option${
                      option.required ? " install__option--locked" : ""
                    }`}
                    key={option.id}
                  >
                    <input
                      className="install__checkbox"
                      type="checkbox"
                      checked={checked || option.required}
                      disabled={option.required}
                      onChange={() => toggle(option.id)}
                    />
                    <span className="install__box" aria-hidden="true">
                      <Icon name="check" size={11} strokeWidth={2.6} />
                    </span>
                    <span className="install__copy">
                      <span className="install__name">{option.name}</span>
                      {option.description && (
                        <span className="install__description">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {cramped && (
            <p className="install__issue">
              There is not enough free space on that drive for this install.
            </p>
          )}

          {blocked && (
            <p className="install__issue">
              {canElevate
                ? "This folder needs administrator access once before Artemis can install here."
                : "This folder cannot be written to. Choose another location."}
            </p>
          )}

          {issue && <p className="install__issue">{issue}</p>}

          <button
            className="install__import"
            onClick={() => void adopt()}
            disabled={working}
          >
            Already installed? Import an existing folder
          </button>

          <div className="modal__actions">
            <button className="modal__button" onClick={onClose} disabled={working}>
              Cancel
            </button>

            {canElevate ? (
              <button
                className="modal__button modal__button--primary"
                onClick={() => void authorise()}
                disabled={working}
              >
                {working ? "Waiting…" : "Grant Access"}
              </button>
            ) : (
              <button
                className="modal__button modal__button--primary"
                onClick={() => void confirm()}
                disabled={working || !path || blocked || cramped}
              >
                {working
                  ? "Starting…"
                  : download > 0
                    ? `Install (${gigabytes(download)})`
                    : "Install"}
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
