import { invoke } from "@tauri-apps/api/core";
import type { Account, AccountStore, LauncherToken } from "@/types";

export const listAccounts = () => invoke<AccountStore>("accounts_list");

export const addAccount = (account: Account) =>
  invoke<AccountStore>("accounts_add", { account });

export const switchAccount = (accountId: string) =>
  invoke<AccountStore>("accounts_switch", { accountId });

export const removeAccount = (accountId: string) =>
  invoke<AccountStore>("accounts_remove", { accountId });

export const setLauncherToken = (accountId: string, launcher: LauncherToken) =>
  invoke<AccountStore>("accounts_set_launcher", { accountId, launcher });

export const currentAccount = (store: AccountStore): Account | null =>
  store.accounts.find((entry) => entry.accountId === store.current) ?? null;
