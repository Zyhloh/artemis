import { fetch } from "@tauri-apps/plugin-http";
import type { InstallOption } from "@/types";

const CATALOG = "https://api.legendary.gl/v1/sdl";
const REQUIRED = "__required";

interface Entry {
  name?: string;
  description?: string;
  tags?: string[];
}

const catalogue = new Map<string, Record<string, Entry>>();

export async function installOptions(appName: string): Promise<InstallOption[]> {
  const response = await fetch(`${CATALOG}/${encodeURIComponent(appName)}.json`);

  if (!response.ok) return [];

  const payload = (await response.json()) as Record<string, Entry>;
  catalogue.set(appName, payload);

  return Object.entries(payload).map(([id, entry]) => ({
    id,
    name: entry.name ?? id,
    description: entry.description ?? "",
    required: id === REQUIRED
  }));
}

export function installTags(appName: string, selected: string[]): string[] {
  const payload = catalogue.get(appName);

  if (!payload) return [];

  const tags = selected.flatMap((id) => payload[id]?.tags ?? []);

  return Array.from(new Set(tags));
}
