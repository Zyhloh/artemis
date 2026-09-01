import { useCallback, useEffect, useRef, useState } from "react";
import { AuthClients } from "fnapi-js";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { epic } from "@lib/epic";
import { launcherSession, toLauncherToken } from "@lib/launcher";
import {
  addAccount,
  currentAccount,
  listAccounts,
  removeAccount,
  setLauncherToken,
  switchAccount
} from "@lib/accounts";
import type { Account, AccountStage, AccountStore } from "@/types";

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Sign-in failed.";

export function useAccount() {
  const [account, setAccount] = useState<Account | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [stage, setStage] = useState<AccountStage>("idle");
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const known = useRef<Account[]>([]);

  const adopt = useCallback((store: AccountStore) => {
    known.current = store.accounts;
    setAccounts(store.accounts);
    setAccount(currentAccount(store));
  }, []);

  useEffect(() => {
    listAccounts()
      .then(adopt)
      .catch(() => undefined);
  }, [adopt]);

  useEffect(() => {
    const pending = listen<AccountStore>("accounts:changed", (event) =>
      adopt(event.payload)
    );

    return () => {
      void pending.then((off) => off());
    };
  }, [adopt]);

  const cancelLogin = useCallback(() => {
    pending.current?.abort();
    pending.current = null;
    setStage("idle");
    setAuthUrl(null);
    setError(null);
  }, []);

  const login = useCallback(async () => {
    const controller = new AbortController();
    pending.current = controller;

    setError(null);
    setAuthUrl(null);
    setStage("starting");

    try {
      const flow = await epic.startDeviceCode();
      if (controller.signal.aborted) return;

      setStage("waiting");
      openUrl(flow.verificationUriComplete).catch(() =>
        setAuthUrl(flow.verificationUriComplete)
      );

      const session = await flow.poll({ signal: controller.signal });

      if (controller.signal.aborted) {
        await session.logout().catch(() => undefined);
        return;
      }

      setStage("finishing");

      const android = await session.switchClient(AuthClients.fortniteAndroid);
      const device = await android.createDeviceAuth();

      const stored = {
        accountId: device.accountId,
        displayName: session.displayName ?? device.accountId,
        deviceId: device.deviceId,
        secret: device.secret ?? ""
      };

      let store = await addAccount(stored);

      try {
        const launcher = await launcherSession(stored);
        store = await setLauncherToken(stored.accountId, toLauncherToken(launcher));
      } catch {
        setError(null);
      }

      await session.logout().catch(() => undefined);

      pending.current = null;
      adopt(store);
      setAuthUrl(null);
      setStage("idle");
    } catch (cause) {
      if (controller.signal.aborted) return;

      pending.current = null;
      setError(message(cause));
      setStage("error");
    }
  }, [adopt]);

  const forget = useCallback(
    async (accountId: string) => {
      const target = known.current.find(
        (entry) => entry.accountId === accountId
      );

      if (!target) return;

      setStage("logout");

      try {
        const session = await epic.loginWithDeviceAuth({
          accountId: target.accountId,
          deviceId: target.deviceId,
          secret: target.secret
        });

        await session.deleteDeviceAuth(target.deviceId);
        await session.logout();
      } catch {
        setError(null);
      }

      try {
        adopt(await removeAccount(accountId));
      } finally {
        setStage("idle");
      }
    },
    [adopt]
  );

  const logout = useCallback(() => {
    if (account) void forget(account.accountId);
  }, [account, forget]);

  const select = useCallback(
    async (accountId: string) => {
      adopt(await switchAccount(accountId));
    },
    [adopt]
  );

  return {
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
  };
}
