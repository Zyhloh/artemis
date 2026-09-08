import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@components/Icon/Icon";
import { Modal } from "@components/Modal/Modal";
import { getLaunchArgs, setLaunchArgs } from "@lib/games";
import { installOptions } from "@lib/install";
import { checkUpdates, revealFolder } from "@lib/library";
import type { LaunchArgs, LibraryGame } from "@/types";
import "./GameMenu.css";

interface GameMenuProps {
  game: LibraryGame | null;
  onClose: () => void;
  onUpdate: (game: LibraryGame) => void;
  onComponents: (game: LibraryGame) => void;
}

interface Row {
  id: string;
  icon: IconName;
  label: string;
  hint: string;
  disabled?: boolean;
  busy?: boolean;
  settled?: boolean;
  run: () => void;
}

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
  onComponents
}: GameMenuProps) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [args, setArgs] = useState<LaunchArgs>({ enabled: false, value: "" });
  const [components, setComponents] = useState(false);

  useEffect(() => {
    if (!game) {
      setNote(null);
      setChecking(false);
      return;
    }

    setOutcome(null);

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

  useEffect(() => {
    if (!game?.installed) {
      setComponents(false);
      return;
    }

    let live = true;

    installOptions(game.appName)
      .then((found) => {
        if (live) setComponents(found.length > 0);
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

    setChecking(true);
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
      setChecking(false);
    }
  }, [game, onUpdate]);

  useEffect(() => {
    if (!outcome) return;

    const timer = setTimeout(() => setOutcome(null), 4200);
    return () => clearTimeout(timer);
  }, [outcome]);

  const reveal = useCallback(() => {
    if (!game?.installPath) return;

    void revealFolder(game.installPath).catch((cause) =>
      setNote(cause instanceof Error ? cause.message : "That folder is missing.")
    );
  }, [game]);

  const rows: Row[] = game?.installed
    ? [
        {
          id: "updates",
          icon: "refresh",
          label: outcome ?? (checking ? "Checking For Updates…" : "Check For Updates"),
          hint: outcome ? "" : "Compare the installed build against Epic",
          disabled: checking || outcome !== null,
          busy: checking,
          settled: outcome !== null,
          run: () => void inspect()
        },
        {
          id: "folder",
          icon: "folder",
          label: "Open Game Folder",
          hint: game.installPath ?? "",
          disabled: !game.installPath,
          run: reveal
        },
        ...(components
          ? [
              {
                id: "components",
                icon: "disk" as IconName,
                label: "Modify Install",
                hint: "Add or remove parts of this installation",
                run: () => onComponents(game)
              }
            ]
          : [])
      ]
    : [];

  const facts = game
    ? [
        ["Developer", game.developer],
        ["Installed Version", game.installedVersion],
        ["Latest Build", game.buildVersion],
        ["Size On Disk", size(game.installSize)],
        ["Platforms", game.platforms.join(", ") || null],
        ["App Name", game.appName]
      ].filter((entry): entry is [string, string] => Boolean(entry[1]))
    : [];

  return (
    <Modal
      open={game !== null}
      label="More options"
      variant="manage"
      dismissible={!checking}
      onDismiss={onClose}
    >
      <h2 className="modal__title">{game?.title ?? "More Options"}</h2>

      <dl className="manage__facts">
        {facts.map(([label, value]) => (
          <div className="manage__fact" key={label}>
            <dt className="manage__fact-label">{label}</dt>
            <dd className="manage__fact-value">{value}</dd>
          </div>
        ))}
      </dl>

      {rows.length > 0 && (
        <div className="manage__list">
          {rows.map((row) => (
            <button
              className={`manage__row${row.settled ? " manage__row--settled" : ""}`}
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
      )}

      {game?.installed && (
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
      )}

      {note && <p className="manage__note">{note}</p>}

      <div className="modal__actions">
        <button
          className="modal__button modal__button--primary"
          onClick={onClose}
          disabled={checking}
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
