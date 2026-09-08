import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ContextMenu, type MenuEntry } from "@components/ContextMenu/ContextMenu";
import { Icon } from "@components/Icon/Icon";
import { ReleaseNotes } from "@components/ReleaseNotes/ReleaseNotes";
import { useUpdate } from "@hooks/useUpdate";
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

const ago = (seconds: number | null) => {
  if (!seconds) return "";

  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - seconds);

  if (elapsed < 60) return "just now";
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)} min ago`;

  return `${Math.floor(elapsed / 3600)} h ago`;
};

const published = (stamp: string) => {
  const at = new Date(stamp);

  return Number.isNaN(at.getTime())
    ? ""
    : at.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
};

const megabytes = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

function Version() {
  const { status, phase, install, progress, failure, check, apply } = useUpdate();
  const latest = status?.latest ?? null;
  const busy = install === "downloading" || install === "installing";

  let line = "Checking for updates…";

  if (status && !status.checking) {
    if (latest) line = `Version ${latest.version} is available`;
    else if (status.error) line = status.error;
    else line = `Up to date · Checked ${ago(status.checkedAt)}`;
  }

  if (phase === "checking") line = "Checking for updates…";

  if (install === "downloading" && progress?.total) {
    line = `Downloading update · ${megabytes(progress.received)} of ${megabytes(progress.total)}`;
  }

  if (install === "installing") line = "Starting the installer…";
  if (install === "failed" && failure) line = failure;

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.received / progress.total) * 100))
      : 0;

  let button: ReactNode;

  if (latest) {
    button = (
      <button
        className="settings__update settings__update--primary"
        onClick={apply}
        disabled={busy}
      >
        {busy && <span className="settings__spinner settings__spinner--dark" />}
        {install === "downloading"
          ? `Downloading ${percent}%`
          : install === "installing"
            ? "Installing…"
            : install === "failed"
              ? "Retry Update"
              : `Update to ${latest.version}`}
      </button>
    );
  } else if (phase === "checking") {
    button = (
      <button className="settings__update" disabled>
        <span className="settings__spinner" />
        Checking…
      </button>
    );
  } else if (phase === "settled") {
    button = (
      <button className="settings__update" disabled>
        <Icon name="check" size={14} strokeWidth={2.2} />
        No Update Available
      </button>
    );
  } else {
    button = (
      <button className="settings__update" onClick={check} disabled={!status}>
        <Icon name="refresh" size={14} />
        Check For Updates
      </button>
    );
  }

  return (
    <div
      className={`settings__group settings__version${
        latest ? " settings__version--ready" : ""
      }`}
    >
      <div className="settings__row">
        <div className="settings__copy">
          <span className="settings__name">
            Artemis {status?.current ?? ""}
            {latest && <span className="settings__tag">Update available</span>}
          </span>
          <span className="settings__hint">{line}</span>
        </div>
        <div className="settings__control">{button}</div>
      </div>

      {latest && (
        <div className="settings__row settings__row--stacked settings__notes">
          <div className="settings__copy">
            <span className="settings__name">{latest.title}</span>
            <span className="settings__hint">
              {[published(latest.publishedAt), megabytes(latest.size)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <ReleaseNotes
            title={latest.title}
            version={latest.version}
            notes={latest.notes}
            url={latest.url}
          />
        </div>
      )}
    </div>
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
        <h2 className="settings__label">Version</h2>
        <Version />
      </section>

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
