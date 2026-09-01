import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  SHOP_EVENT,
  composeShop,
  shopSnapshot,
  type ShopSnapshot,
  type ShopView
} from "@lib/shop";

type Status = "loading" | "ready" | "error";

let cached: ShopView | null = null;

export function useItemShop() {
  const [view, setView] = useState<ShopView | null>(cached);
  const [status, setStatus] = useState<Status>(cached ? "ready" : "loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let running = true;

    const adopt = (snapshot: ShopSnapshot | null) => {
      if (!running || !snapshot) return false;
      if (cached?.key === snapshot.key) return true;

      cached = composeShop(snapshot);
      setView(cached);
      setStatus("ready");
      setError(null);

      return true;
    };

    shopSnapshot()
      .then((snapshot) => {
        if (!running) return;

        if (!adopt(snapshot) && !cached) {
          setStatus("loading");
        }
      })
      .catch((cause: unknown) => {
        if (!running || cached) return;

        setError(
          cause instanceof Error ? cause.message : "The item shop is unavailable."
        );
        setStatus("error");
      });

    const pending = listen<ShopSnapshot>(SHOP_EVENT, (event) =>
      adopt(event.payload)
    );

    return () => {
      running = false;
      void pending.then((off) => off());
    };
  }, []);

  return { view, status, error };
}
