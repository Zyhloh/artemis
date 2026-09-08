import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ComponentList } from "@components/ComponentList/ComponentList";
import { Modal } from "@components/Modal/Modal";
import { useInstallOptions } from "@hooks/useInstallOptions";
import { grantInstallPath, prepareInstallPath } from "@lib/library";
import type { LibraryGame } from "@/types";
import "./InstallModal.css";

interface InstallModalProps {
  game: LibraryGame | null;
  base: LibraryGame | null;
  onInstall: (
    appName: string,
    title: string,
    path: string,
    tags: string[],
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
  base,
  onInstall,
  onImport,
  onClose,
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
    inspect,
  } = useInstallOptions(game);
  const [issue, setIssue] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const browse = useCallback(async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose install location",
      defaultPath: path || undefined,
    }).catch(() => null);

    if (typeof picked === "string") {
      const root = /^[A-Za-z]:[\\/]?$/.test(picked);
      setPath(
        root && game
          ? `${picked.replace(/[\\/]$/, "")}\\${game.title}`
          : picked,
      );
      setIssue(null);
    }
  }, [path, game, setPath]);

  const adopt = useCallback(async () => {
    if (!game) return;

    const picked = await open({
      directory: true,
      multiple: false,
      title: `Locate the existing ${game.title} folder`,
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
          : "That folder could not be created.",
      );
    } finally {
      setWorking(false);
    }
  }, [game, path, tags, onInstall, onClose]);

  const addon = game?.baseAppName != null;
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
        cause instanceof Error ? cause.message : "Access could not be granted.",
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
              {!addon && (
                <button
                  className="install__browse"
                  onClick={() => void browse()}
                >
                  Browse
                </button>
              )}
            </div>

            {addon && (
              <span className="install__space">
                Installs into the {base?.title ?? "base game"} folder
              </span>
            )}

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

          {options.length > 0 && (
            <div className="install__field">
              <span className="install__label">Components</span>
              <ComponentList
                options={options}
                selected={selected}
                onToggle={toggle}
              />
            </div>
          )}

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

          {!addon && (
            <button
              className="install__import"
              onClick={() => void adopt()}
              disabled={working}
            >
              Already installed? Import an existing folder
            </button>
          )}

          <div className="modal__actions">
            <button
              className="modal__button"
              onClick={onClose}
              disabled={working}
            >
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
