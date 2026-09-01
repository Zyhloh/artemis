import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const EVENT = "profile:changed";
const PATIENCE = 9000;
const DWELL = 750;

export type WalletStatus = "none" | "loading" | "ready";

export interface Wallet {
  accountId: string;
  displayName: string;
  revision: number;
  vbucks: number;
  platform: string;
  updated: string;
}

let known: Wallet | null = null;

export function useVbucks(accountId: string | null) {
  const settled = known?.accountId === accountId ? known : null;

  const [wallet, setWallet] = useState<Wallet | null>(settled);
  const [status, setStatus] = useState<WalletStatus>(
    accountId ? (settled ? "ready" : "loading") : "none"
  );

  useEffect(() => {
    if (!accountId) {
      setWallet(null);
      setStatus("none");
      return;
    }

    let running = true;
    let hold: number | undefined;

    const carried = known?.accountId === accountId ? known : null;

    setWallet(carried);
    setStatus(carried ? "ready" : "loading");

    const opened = Date.now();

    const settle = (next: Wallet) => {
      known = next;
      setWallet(next);

      const waited = Date.now() - opened;

      if (carried || waited >= DWELL) {
        setStatus("ready");
        return;
      }

      hold = window.setTimeout(() => {
        if (running) setStatus("ready");
      }, DWELL - waited);
    };

    const adopt = (next: Wallet | null) => {
      if (!running || next?.accountId !== accountId) return;
      settle(next);
    };

    invoke<Wallet | null>("profile_wallet")
      .then(adopt)
      .catch(() => undefined);

    const pending = listen<Wallet | null>(EVENT, (event) => adopt(event.payload));

    const patience = window.setTimeout(() => {
      if (running) setStatus("ready");
    }, PATIENCE);

    return () => {
      running = false;
      window.clearTimeout(patience);
      if (hold !== undefined) window.clearTimeout(hold);
      void pending.then((off) => off());
    };
  }, [accountId]);

  return { wallet, status };
}
