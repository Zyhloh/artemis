import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AccountModal,
  BusyModal,
  ConfirmModal,
  FriendsPanel,
  GameMenu,
  InstallModal,
  NavRail,
  SwitchAccountModal,
  TitleBar,
  type NavRailGroup
} from "@components/index";
import { OptionsModal } from "@components/OptionsModal/OptionsModal";
import { ALL_TABS, FOOTER_GROUP, TAB_GROUPS, type TabGroup } from "@tabs/registry";
import { useAccount } from "@hooks/useAccount";
import { useDownloads } from "@hooks/useDownloads";
import { useEpicSession } from "@hooks/useEpicSession";
import { useFriends } from "@hooks/useFriends";
import { useGames } from "@hooks/useGames";
import { useLibrary } from "@hooks/useLibrary";
import { useLockers } from "@hooks/useLockers";
import { useUpdate } from "@hooks/useUpdate";
import { installOptions } from "@lib/install";
import { createShortcut, refreshLibrary, uninstallGame } from "@lib/library";
import { watchTray } from "@lib/tray";
import type { DownloadJob, LibraryGame } from "@/types";
import "./MainWindow.css";

const toRailGroup = (
  group: TabGroup,
  badges: Record<string, number>,
  alerts: Record<string, boolean>
): NavRailGroup => ({
  id: group.id,
  label: group.label,
  items: group.items.map(({ id, label, icon }) => ({
    id,
    label,
    icon,
    badge: badges[id],
    alert: alerts[id]
  }))
});

export function MainWindow() {
  const [active, setActive] = useState(ALL_TABS[0].id);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const {
    account,
    accounts,
    stage,
    authUrl,
    error,
    login,
    logout,
    forget,
    select,
    cancelLogin
  } = useAccount();

  const downloads = useDownloads();
  const games = useGames(account);
  const { games: library } = useLibrary(account);
  const { status: release } = useUpdate();
  const lockers = useLockers(accounts);
  const { session, status: sessionStatus } = useEpicSession(account);
  const friends = useFriends(session);

  const friendsState =
    sessionStatus === "signed-out" || sessionStatus === "error"
      ? "off"
      : sessionStatus === "opening" ||
          friends.status === "idle" ||
          friends.status === "loading"
        ? "busy"
        : "on";

  const [cancelling, setCancelling] = useState<DownloadJob | null>(null);
  const [stopping, setStopping] = useState<LibraryGame | null>(null);
  const [removing, setRemoving] = useState<LibraryGame | null>(null);
  const [erasing, setErasing] = useState<LibraryGame | null>(null);
  const [editing, setEditing] = useState<LibraryGame | null>(null);
  const [installing, setInstalling] = useState<LibraryGame | null>(null);
  const [managing, setManaging] = useState<LibraryGame | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const settled = useRef(new Set<string>());

  const update = useCallback(
    (game: LibraryGame) =>
      void downloads.start(
        game.appName,
        game.title,
        game.installPath ?? "",
        []
      ),
    [downloads]
  );

  const locate = useCallback(
    async (game: LibraryGame) => {
      const picked = await open({
        directory: true,
        multiple: false,
        title: `Locate the existing ${game.title} folder`
      }).catch(() => null);

      if (typeof picked === "string") {
        void downloads.adopt(game.appName, game.title, picked);
      }
    },
    [downloads]
  );

  const shortcut = useCallback((game: LibraryGame) => {
    setToast(`Creating shortcut for ${game.title}…`);

    createShortcut(game.appName)
      .then(() => setToast(`${game.title} shortcut added to your desktop`))
      .catch((cause) =>
        setToast(
          cause instanceof Error
            ? cause.message
            : "That shortcut could not be created"
        )
      );
  }, []);

  const verify = useCallback(
    (game: LibraryGame) => {
      void downloads.verify(game.appName, game.title);
      setToast(`Verifying ${game.title}`);
    },
    [downloads]
  );

  useEffect(() => {
    for (const game of library) {
      if (game.installed && !game.thirdParty) {
        void installOptions(game.appName).catch(() => undefined);
      }
    }
  }, [library]);

  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let changed = false;

    for (const job of downloads.jobs) {
      if (job.stage !== "done" || settled.current.has(job.id)) continue;

      settled.current.add(job.id);
      if (job.kind !== "verify") changed = true;
    }

    if (changed) void refreshLibrary();
  }, [downloads.jobs]);

  useEffect(() => {
    const pending = watchTray((target) => {
      if (target === "switch-account") {
        setSwitchOpen(true);
        return;
      }

      if (ALL_TABS.some((tab) => tab.id === target)) setActive(target);
    });

    return () => {
      void pending.then((off) => off());
    };
  }, []);

  const openSwitch = useCallback(() => setSwitchOpen(true), []);
  const closeSwitch = useCallback(() => setSwitchOpen(false), []);

  const addAnother = useCallback(() => {
    setSwitchOpen(false);
    void login();
  }, [login]);

  const pickAccount = useCallback(
    (accountId: string) => {
      setSwitchOpen(false);
      void select(accountId);
    },
    [select]
  );

  const faces = useMemo(
    () =>
      new Map(
        [...lockers.looks].map(([accountId, look]) => [accountId, look.avatar])
      ),
    [lockers.looks]
  );

  const closeFriends = useCallback(() => setFriendsOpen(false), []);
  const toggleFriends = useCallback(() => setFriendsOpen((open) => !open), []);

  const current = ALL_TABS.find((tab) => tab.id === active) ?? ALL_TABS[0];
  const View = current.view;
  const badges = { downloads: downloads.pending };
  const alerts = { settings: Boolean(release?.latest) };

  return (
    <div className="window">
      <TitleBar
        friendsOpen={friendsOpen}
        friendsState={friendsState}
        onToggleFriends={toggleFriends}
      />

      <div className={`window__body${friendsOpen ? " window__body--veiled" : ""}`}>
        <NavRail
          groups={TAB_GROUPS.map((group) => toRailGroup(group, badges, alerts))}
          footer={toRailGroup(FOOTER_GROUP, badges, alerts)}
          account={
            account
              ? {
                  name: account.displayName,
                  avatar: lockers.looks.get(account.accountId)?.avatar ?? null
                }
              : null
          }
          active={active}
          onSelect={setActive}
          onLogin={login}
          onLogout={logout}
          onSwitch={openSwitch}
        />

        <main className="window__content">
          <div className="window__scroll" data-tab={current.id} key={current.id}>
            <View
              account={account}
              session={session}
              jobs={downloads.jobs}
              sessions={games.sessions}
              onInstall={downloads.start}
              onImport={downloads.adopt}
              onRequestCancel={setCancelling}
              onPause={downloads.pause}
              onResume={downloads.resume}
              onClear={downloads.clear}
              onClearHistory={downloads.clearHistory}
              onNavigate={setActive}
              onLaunch={games.launch}
              onRequestStop={setStopping}
              onUpdate={update}
              onVerify={verify}
              onUninstall={setRemoving}
              onComponents={setEditing}
              onInstallRequest={setInstalling}
              onManage={setManaging}
              onLocate={(game) => void locate(game)}
              onShortcut={shortcut}
            />
          </div>
        </main>
      </div>

      <FriendsPanel
        open={friendsOpen}
        session={session}
        friends={friends.friends}
        blocked={friends.blocked}
        requests={friends.requests}
        status={friends.status}
        onAccept={friends.accept}
        onDecline={friends.decline}
        onAdd={friends.add}
        onRefresh={friends.refresh}
        onRemove={friends.remove}
        onBlock={friends.block}
        onUnblock={friends.unblock}
        onNickname={friends.nickname}
        onClose={closeFriends}
      />

      <SwitchAccountModal
        open={switchOpen}
        accounts={accounts}
        avatars={faces}
        current={account?.accountId ?? null}
        onClose={closeSwitch}
        onSelect={pickAccount}
        onRemove={forget}
        onAdd={addAnother}
      />

      <ConfirmModal
        open={games.failure !== null}
        title={games.failure?.outdated ? "Update required" : "Launch failed"}
        body={
          games.failure?.outdated
            ? `${games.failure.appName} has an update that must be installed before it can launch.`
            : (games.failure?.reason ?? "")
        }
        confirmLabel={games.failure?.outdated ? "Update Now" : "OK"}
        cancelLabel="Not Now"
        onConfirm={() => {
          const target = games.failure;
          games.dismiss();

          if (target?.outdated) {
            void downloads.start(target.appName, target.appName, "", []);
          }
        }}
        onClose={games.dismiss}
      />

      <ConfirmModal
        open={cancelling !== null}
        title="Cancel download"
        body={
          cancelling?.fresh
            ? `This stops the ${cancelling?.title ?? "game"} download and removes the files already written.`
            : `This stops updating ${cancelling?.title ?? "the game"}. Files already installed are kept.`
        }
        confirmLabel="Cancel Download"
        onConfirm={() => {
          if (cancelling) downloads.cancel(cancelling.appName);
          setCancelling(null);
        }}
        onClose={() => setCancelling(null)}
      />

      <ConfirmModal
        open={removing !== null}
        title="Uninstall game"
        body={`This removes ${removing?.title ?? "the game"} and its files from this computer.`}
        confirmLabel="Uninstall"
        cancelLabel="Keep Game"
        onConfirm={() => {
          const target = removing;
          setRemoving(null);

          if (!target) return;

          setEraseError(null);
          setErasing(target);

          void uninstallGame(target.appName)
            .then(() => setErasing(null))
            .catch((cause) =>
              setEraseError(
                cause instanceof Error
                  ? cause.message
                  : "The game could not be removed."
              )
            )
            .finally(() => void refreshLibrary());
        }}
        onClose={() => setRemoving(null)}
      />

      <ConfirmModal
        open={stopping !== null}
        title="Close game"
        body={`This force closes ${stopping?.title ?? "the game"}. Any unsaved progress may be lost.`}
        confirmLabel="Close Game"
        cancelLabel="Keep Playing"
        onConfirm={() => {
          if (stopping) games.stop(stopping.appName);
          setStopping(null);
        }}
        onClose={() => setStopping(null)}
      />

      <BusyModal
        open={erasing !== null}
        message={`Uninstalling ${erasing?.title ?? "game"}`}
        detail="Removing installed files. This can take a moment."
        error={eraseError}
        onClose={() => {
          setErasing(null);
          setEraseError(null);
        }}
      />

      <InstallModal
        game={installing}
        base={
          library.find((entry) => entry.appName === installing?.baseAppName) ??
          null
        }
        onInstall={downloads.start}
        onImport={downloads.adopt}
        onClose={() => setInstalling(null)}
      />

      <GameMenu
        game={managing}
        onClose={() => setManaging(null)}
        onUpdate={update}
        onComponents={setEditing}
      />

      {toast && <p className="window__toast">{toast}</p>}

      <OptionsModal
        game={editing}
        onApply={downloads.start}
        onClose={() => setEditing(null)}
      />

      <AccountModal
        stage={stage}
        authUrl={authUrl}
        error={error}
        onCancel={cancelLogin}
        onRetry={login}
      />
    </div>
  );
}
