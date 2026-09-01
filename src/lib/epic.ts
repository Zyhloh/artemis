import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { EpicGamesClient, type FetchLike } from "fnapi-js";

const bareFetch: typeof tauriFetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("Origin", "");

  return tauriFetch(input, { ...init, headers });
};

export const epic = new EpicGamesClient({ fetch: bareFetch as FetchLike });
