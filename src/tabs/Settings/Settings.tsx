import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ContextMenu, type MenuEntry } from "@components/ContextMenu/ContextMenu";
import { Icon } from "@components/Icon/Icon";
import {
  getSettings,
  setInstallRoot,
  updateSettings,
  type CloseBehaviour,
  type SettingsOverview,
  type SettingsPatch
} from "@lib/settings";
import "./Settings.css";

const CLOSE_OPTIONS: { value: CloseBehaviour; label: string; hint: string }[] = [
  { value: "tray", label: "Minimize to tray", hint: "Keep running in the system tray" },
  { value: "taskbar", label: "Minimize to taskbar", hint: "Keep the window minimized" },
  { value: "quit", label: "Close Artemis", hint: "Fully quit the launcher" }
];

function Switch({
  on,
  disabled,
  onChange,
  label
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      className={`settings__switch${on ? " settings__switch--on" : ""}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className="settings__knob" />
    </button>
  );
}

function Row({
  title,
  hint,
  children,
  stacked = false
}: {
  title: string;
  hint: string;
  children: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className={`settings__row${stacked ? " settings__row--stacked" : ""}`}>
      <div className="settings__copy">
        <span className="settings__name">{title}</span>
        <span className="settings__hint">{hint}</span>
      </div>
      <div className="settings__control">{children}</div>
    </div>
  );
}

export function Settings() {
  const [overview, setOverview] = useState<SettingsOverview | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [closeAnchor, setCloseAnchor] = useState<DOMRect | null>(null);

  useEffect(() => {
    let live = true;

    getSettings()
      .then((found) => {
        if (live) setOverview(found);
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, []);

  const run = useCallback(async (task: () => Promise<SettingsOverview>) => {
    setSaving(true);
    setIssue(null);

    try {
      setOverview(await task());
    } catch (cause) {
      setIssue(
        cause instanceof Error ? cause.message : "That setting could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }, []);

  const change = useCallback(
    (patch: SettingsPatch) => void run(() => updateSettings(patch)),
    [run]
  );

  const browse = useCallback(async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose the default install location",
      defaultPath: overview?.installRoot
    }).catch(() => null);

    if (typeof picked === "string") void run(() => setInstallRoot(picked));
  }, [overview, run]);

  const closeEntries = useMemo(
    (): MenuEntry[] =>
      CLOSE_OPTIONS.map((option) => ({
        id: option.value,
        label: option.label,
        hint: option.hint,
        active: overview?.closeBehaviour === option.value,
        run: () => change({ closeBehaviour: option.value })
      })),
    [overview, change]
  );

  const closeLabel =
    CLOSE_OPTIONS.find((option) => option.value === overview?.closeBehaviour)?.label ??
    "Minimize to tray";

  const busy = saving || !overview;

  return (
    <div className="settings">
      <header className="settings__bar">
        <h1 className="settings__page">Settings</h1>
        <p className="settings__lead">
          Launcher preferences. These apply to Artemis itself, not to any one account.
        </p>
      </header>

      <section className="settings__section">
        <h2 className="settings__label">General</h2>

        <div className="settings__group">
          <Row
            title="Start Artemis with your PC"
            hint="Adds Artemis to your Windows startup apps and starts it quietly in the tray."
          >
            <Switch
              on={overview?.startWithWindows ?? false}
              disabled={busy}
              label="Start Artemis with your PC"
              onChange={(next) => change({ startWithWindows: next })}
            />
          </Row>

          <Row
            title="When closing Artemis"
            hint="What happens when you close the launcher window."
          >
            <button
              className={`settings__select${closeAnchor ? " settings__select--on" : ""}`}
              disabled={busy}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setCloseAnchor((current) => (current ? null : rect));
              }}
            >
              {closeLabel}
              <Icon name="chevronDown" size={13} />
            </button>
          </Row>
        </div>
      </section>

      <section className="settings__section">
        <h2 className="settings__label">Downloads</h2>

        <div className="settings__group">
          <Row
            title="Default install location"
            hint="New games get their own folder inside this location. You can still choose a different folder per install."
            stacked
          >
            <div className="settings__path">
              <span className="settings__glyph">
                <Icon name="folder" size={15} />
              </span>
              <span className="settings__value">
                {overview ? (
                  <bdi className="settings__pathtext">{overview.installRoot}</bdi>
                ) : (
                  "Loading…"
                )}
              </span>
              {overview?.custom && (
                <button
                  className="settings__button settings__button--quiet"
                  onClick={() => void run(() => setInstallRoot(null))}
                  disabled={busy}
                  title={`Reset to ${overview.defaultInstallRoot}`}
                >
                  Reset
                </button>
              )}
              <button
                className="settings__button"
                onClick={() => void browse()}
                disabled={busy}
              >
                Browse
              </button>
            </div>
          </Row>

          <Row
            title="Create desktop shortcuts automatically"
            hint="Adds a desktop shortcut whenever a new game finishes installing."
          >
            <Switch
              on={overview?.autoShortcuts ?? true}
              disabled={busy}
              label="Create desktop shortcuts automatically"
              onChange={(next) => change({ autoShortcuts: next })}
            />
          </Row>
        </div>
      </section>

      {issue && <p className="settings__issue">{issue}</p>}

      <ContextMenu
        anchor={closeAnchor}
        items={closeEntries}
        onClose={() => setCloseAnchor(null)}
      />
    </div>
  );
}
