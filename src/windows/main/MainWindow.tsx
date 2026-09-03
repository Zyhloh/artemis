import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccountModal,
  BusyModal,
  ConfirmModal,
  DownloadsDock,
  FriendsPanel,
  NavRail,
  SwitchAccountModal,
  TitleBar,
  type NavRailGroup
} from "@components/index";
import { ALL_TABS, FOOTER_GROUP, TAB_GROUPS, type TabGroup } from "@tabs/registry";
import { useAccount } from "@hooks/useAccount";
import { useDownloads } from "@hooks/useDownloads";
import { useEpicSession } from "@hooks/useEpicSession";
import { useFriends } from "@hooks/useFriends";
import { useGames } from "@hooks/useGames";
import { useLockers } from "@hooks/useLockers";
import { uninstallGame } from "@lib/library";
import type { DownloadJob, LibraryGame } from "@/types";
import "./MainWindow.css";

const toRailGroup = (group: TabGroup): NavRailGroup => ({
  id: group.id,
  label: group.label,
  items: group.items.map(({ id, label, icon }) => ({ id, label, icon }))
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
  const [refresh, setRefresh] = useState(0);
  const [erasing, setErasing] = useState<LibraryGame | null>(null);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const settled = useRef(new Set<string>());

  useEffect(() => {
    let changed = false;

    for (const job of downloads.jobs) {
      const key = `${job.appName}:${job.kind}:${job.stage}`;

      if (job.stage !== "done" || settled.current.has(key)) continue;
      if (job.kind === "verify") continue;

      settled.current.add(key);
      changed = true;
    }

    if (changed) setRefresh((value) => value + 1);
  }, [downloads.jobs]);

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

  return (
    <div className="window">
      <TitleBar
        friendsOpen={friendsOpen}
        friendsState={friendsState}
        onToggleFriends={toggleFriends}
      />

      <div className="window__body">
        <NavRail
          groups={TAB_GROUPS.map(toRailGroup)}
          footer={toRailGroup(FOOTER_GROUP)}
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
              onLaunch={games.launch}
              onRequestStop={setStopping}
              onUpdate={(game) =>
                void downloads.start(
                  game.appName,
                  game.title,
                  game.installPath ?? "",
                  []
                )
              }
              onVerify={(game) => void downloads.verify(game.appName, game.title)}
              onUninstall={setRemoving}
              key={refresh}
            />
          </div>

          {active === "library" && (
            <DownloadsDock
              jobs={downloads.jobs}
              pending={downloads.pending}
              veiled={friendsOpen}
              onPause={downloads.pause}
              onResume={downloads.resume}
              onRequestCancel={setCancelling}
              onClear={downloads.clear}
            />
          )}
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
            .finally(() => setRefresh((value) => value + 1));
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
