import { useCallback, useMemo, useState } from "react";
import { ComponentList } from "@components/ComponentList/ComponentList";
import { Modal } from "@components/Modal/Modal";
import { useInstallOptions } from "@hooks/useInstallOptions";
import { installTags, selectedOptions } from "@lib/install";
import type { LibraryGame } from "@/types";
import "./OptionsModal.css";

interface OptionsModalProps {
  game: LibraryGame | null;
  onApply: (
    appName: string,
    title: string,
    path: string,
    tags: string[]
  ) => Promise<void>;
  onClose: () => void;
}

const gigabytes = (bytes: number) => {
  const value = bytes / 1024 ** 3;

  return value >= 10 ? `${Math.round(value)} GB` : `${value.toFixed(1)} GB`;
};

export function OptionsModal({ game, onApply, onClose }: OptionsModalProps) {
  const { options, selected, tags, manifest, status, toggle } =
    useInstallOptions(game);
  const [working, setWorking] = useState(false);

  const present = useMemo(
    () => new Set(game?.installTags ?? []),
    [game]
  );

  const initial = useMemo(() => {
    if (!game || !options.length) return [];

    const owned = game.installTags ?? [];

    return game.installed && owned.length
      ? selectedOptions(game.appName, owned)
      : options.filter((option) => option.required).map((option) => option.id);
  }, [game, options]);

  const touched = useMemo(
    () =>
      selected.length !== initial.length ||
      selected.some((id) => !initial.includes(id)),
    [selected, initial]
  );

  const notes = useMemo(() => {
    if (!game) return {};

    return options.reduce<Record<string, string>>((map, option) => {
      const owned = installTags(game.appName, [option.id]);

      if (!owned.length) return map;

      const held = owned.filter((tag) => present.has(tag)).length;

      map[option.id] =
        held === 0
          ? "Not installed"
          : held === owned.length
            ? "Installed"
            : "Partly installed";

      return map;
    }, {});
  }, [game, options, present]);

  const { added, freed } = useMemo(() => {
    if (!manifest) return { added: 0, freed: 0 };

    const wanted = new Set(tags);

    return manifest.tags.reduce(
      (totals, entry) => {
        const held = present.has(entry.tag);
        const keep = wanted.has(entry.tag);

        if (keep && !held) totals.added += entry.download;
        if (!keep && held) totals.freed += entry.disk;

        return totals;
      },
      { added: 0, freed: 0 }
    );
  }, [manifest, tags, present]);

  const changed = added > 0 || freed > 0;

  const confirm = useCallback(async () => {
    if (!game) return;

    setWorking(true);

    try {
      await onApply(game.appName, game.title, game.installPath ?? "", tags);
      onClose();
    } finally {
      setWorking(false);
    }
  }, [game, tags, onApply, onClose]);

  return (
    <Modal
      open={game !== null}
      label="Change components"
      variant="install"
      dismissible={!working}
      onDismiss={onClose}
    >
      <h2 className="modal__title">{game?.title ?? "Components"}</h2>

      {status === "loading" ? (
        <div className="options__state">
          <span className="modal__spinner" />
          <p className="modal__text">Loading components…</p>
        </div>
      ) : options.length === 0 ? (
        <div className="options__state">
          <p className="modal__text">
            {game?.title ?? "This game"} installs as a single package, so there
            is nothing to add or remove.
          </p>
        </div>
      ) : (
        <>
          <p className="options__intro">
            Pick what stays installed. Removing a component deletes its files,
            and anything only partly installed is completed on apply.
          </p>

          <ComponentList
            options={options}
            selected={selected}
            notes={notes}
            onToggle={toggle}
          />

          <p className="options__summary">
            {!changed
              ? "Everything selected is already installed"
              : touched
                ? [
                    added > 0 ? `Downloads ${gigabytes(added)}` : null,
                    freed > 0 ? `Frees ${gigabytes(freed)}` : null
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : `${gigabytes(added)} of this selection was never installed`}
          </p>
        </>
      )}

      <div className="modal__actions">
        {changed && (
          <button className="modal__button" onClick={onClose} disabled={working}>
            Cancel
          </button>
        )}

        <button
          className="modal__button modal__button--primary"
          onClick={() => (changed ? void confirm() : onClose())}
          disabled={working}
        >
          {working
            ? "Applying…"
            : !changed
              ? "Done"
              : touched
                ? "Apply Changes"
                : "Download Missing"}
        </button>
      </div>
    </Modal>
  );
}
