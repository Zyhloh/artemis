import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@components/Icon/Icon";
import { Modal } from "@components/Modal/Modal";
import { getLaunchArgs, setLaunchArgs } from "@lib/games";
import { checkUpdates, createShortcut, revealFolder } from "@lib/library";
import type { LaunchArgs, LibraryGame } from "@/types";
import "./GameMenu.css";

interface GameMenuProps {
  game: LibraryGame | null;
  onClose: () => void;
  onUpdate: (game: LibraryGame) => void;
  onVerify: (game: LibraryGame) => void;
  onUninstall: (game: LibraryGame) => void;
}

interface Row {
  id: string;
  icon: IconName;
  label: string;
  hint: string;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  settled?: boolean;
  run: () => void;
}

type Task = "updates" | "verify" | null;

const BLOCKED = new RegExp(
  "[\u0000-\u001f\u007f&|;<>`$^*?%!\r\n]",
  "g"
);

const clean = (value: string) => value.replace(BLOCKED, "").slice(0, 512);

const size = (bytes: number | null) =>
  bytes ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : null;

export function GameMenu({
  game,
  onClose,
  onUpdate,
  onVerify,
  onUninstall
}: GameMenuProps) {
  const [task, setTask] = useState<Task>(null);
  const [note, setNote] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [args, setArgs] = useState<LaunchArgs>({ enabled: false, value: "" });

  useEffect(() => {
    if (!game) {
      setNote(null);
      setTask(null);
      return;
    }

    setOutcome(null);
    setChecked(null);
    setPinned(null);

    let live = true;

    getLaunchArgs(game.appName)
      .then((stored) => {
        if (live) setArgs(stored);
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, [game]);

  const persist = useCallback(
    (next: LaunchArgs) => {
      setArgs(next);
      if (game) void setLaunchArgs(game.appName, next).catch(() => undefined);
    },
    [game]
  );

  const inspect = useCallback(async () => {
    if (!game) return;

    setTask("updates");
    setNote(null);
    setOutcome(null);

    try {
      const all = await checkUpdates();
      const found = all.find((entry) => entry.appName === game.appName);

      if (found?.updateAvailable) {
        onUpdate(game);
        setOutcome("An Update Was Available And Is Being Downloaded");
      } else {
        setOutcome("No Update Available");
      }
    } catch {
      setOutcome("Update Check Failed");
    } finally {
      setTask(null);
    }
  }, [game, onUpdate]);

  useEffect(() => {
    if (!outcome) return;

    const timer = setTimeout(() => setOutcome(null), 4200);
    return () => clearTimeout(timer);
  }, [outcome]);

  useEffect(() => {
    if (!pinned) return;

    if (pinned === "Creating Shortcut…") return;

    const timer = setTimeout(() => setPinned(null), 4200);
    return () => clearTimeout(timer);
  }, [pinned]);

  useEffect(() => {
    if (!checked) return;

    const timer = setTimeout(() => setChecked(null), 4200);
    return () => clearTimeout(timer);
  }, [checked]);

  const verify = useCallback(() => {
    if (!game) return;

    onVerify(game);
    setChecked("Game Verification Added To Queue");
  }, [game, onVerify]);

  const reveal = useCallback(() => {
    if (!game?.installPath) return;

    void revealFolder(game.installPath).catch((cause) =>
      setNote(cause instanceof Error ? cause.message : "That folder is missing.")
    );
  }, [game]);

  const pin = useCallback(() => {
    if (!game) return;

    setPinned("Creating Shortcut…");

    createShortcut(game.appName)
      .then(() => setPinned("Shortcut Created On Desktop"))
      .catch((cause) =>
        setPinned(
          cause instanceof Error ? cause.message : "That shortcut could not be created"
        )
      );
  }, [game]);

  const remove = useCallback(() => {
    if (!game) return;

    onClose();
    onUninstall(game);
  }, [game, onClose, onUninstall]);

  const rows: Row[] = [
    {
      id: "updates",
      icon: "refresh",
      label: outcome ?? (task === "updates" ? "Checking For Updates…" : "Check For Updates"),
      hint: outcome ? "" : "Compare the installed build against Epic",
      disabled: task !== null || outcome !== null,
      busy: task === "updates",
      settled: outcome !== null,
      run: () => void inspect()
    },
    {
      id: "verify",
      icon: "check",
      label: checked ?? "Verify Game Files",
      hint: checked ? "" : "Hash every file and report damage",
      disabled: task !== null || checked !== null,
      settled: checked !== null,
      run: verify
    },
    {
      id: "shortcut",
      icon: "link",
      label: pinned ?? "Create Desktop Shortcut",
      hint: pinned ? "" : "Add a launcher shortcut to your desktop",
      disabled: task !== null || pinned !== null,
      busy: pinned === "Creating Shortcut…",
      settled: pinned !== null && pinned !== "Creating Shortcut…",
      run: pin
    },
    {
      id: "folder",
      icon: "folder",
      label: "Open Game Folder",
      hint: game?.installPath ?? "",
      disabled: !game?.installPath,
      run: reveal
    },
    {
      id: "uninstall",
      icon: "trash",
      label: "Uninstall",
      hint: "Remove the game and its files",
      danger: true,
      disabled: task !== null,
      run: remove
    }
  ];

  return (
    <Modal
      open={game !== null}
      label="Manage game"
      variant="manage"
      dismissible={task === null}
      onDismiss={onClose}
    >
      <h2 className="modal__title">{game?.title ?? "Manage"}</h2>

      {game?.installedVersion && (
        <p className="manage__build">
          {game.installedVersion}
          {size(game.installSize) ? ` · ${size(game.installSize)}` : ""}
        </p>
      )}

      <div className="manage__list">
        {rows.map((row) => (
          <button
            className={`manage__row${row.danger ? " manage__row--danger" : ""}${
              row.settled ? " manage__row--settled" : ""
            }`}
            key={row.id}
            onClick={row.run}
            disabled={row.disabled}
          >
            <span className="manage__icon">
              {row.busy ? (
                <span className="manage__spinner" />
              ) : (
                <Icon name={row.icon} size={15} />
              )}
            </span>

            <span className="manage__copy">
              <span className="manage__label">{row.label}</span>
              {row.hint && <span className="manage__hint">{row.hint}</span>}
            </span>
          </button>
        ))}
      </div>

      <div className="manage__args">
        <label className="manage__toggle">
          <input
            className="manage__checkbox"
            type="checkbox"
            checked={args.enabled}
            onChange={(event) =>
              persist({ ...args, enabled: event.target.checked })
            }
          />
          <span className="manage__box" aria-hidden="true">
            <Icon name="check" size={11} strokeWidth={2.6} />
          </span>
          <span className="manage__label">Additional Launch Args</span>
        </label>

        {args.enabled && (
          <input
            className="manage__input"
            type="text"
            value={args.value}
            spellCheck={false}
            placeholder="-fullscreen -nosplash"
            onChange={(event) =>
              persist({ ...args, value: clean(event.target.value) })
            }
          />
        )}
      </div>

      {note && <p className="manage__note">{note}</p>}

      <div className="modal__actions">
        <button
          className="modal__button modal__button--primary"
          onClick={onClose}
          disabled={task !== null}
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
