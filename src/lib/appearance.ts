import { listen } from "@tauri-apps/api/event";
import { getAppearance } from "./ipc";
import type { Appearance } from "@/types";

const CHANGED = "appearance:changed";

const fallback = (): Appearance => ({
  backdrop: "none",
  mode: window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark"
});

function paint({ backdrop, mode }: Appearance): void {
  const { dataset } = document.documentElement;

  dataset.backdrop = backdrop;
  dataset.theme = mode;
}

export async function syncAppearance(): Promise<void> {
  paint(await getAppearance().catch(fallback));
}

export const watchAppearance = () =>
  listen<Appearance>(CHANGED, ({ payload }) => paint(payload));
