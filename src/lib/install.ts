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

interface Extra extends Entry {
  id: string;
  tags: string[];
}

interface Refinement {
  name: string;
  description: string;
  extras: Extra[];
}

const REFINEMENTS: Record<string, Refinement> = {
  Fortnite: {
    name: "Fortnite Core, Battle Royale, and LEGO",
    description:
      "Common files required to play Fortnite, plus Battle Royale, Creative and LEGO.",
    extras: [
      {
        id: "save_the_world",
        name: "Save the World",
        description: "The co-op campaign, downloaded separately from the rest.",
        tags: ["GFP_SaveTheWorldRoot"]
      }
    ]
  }
};

function refine(
  appName: string,
  payload: Record<string, Entry>
): Record<string, Entry> {
  const plan = REFINEMENTS[appName];
  const required = payload[REQUIRED];

  if (!plan || !required?.tags) return payload;

  const moving = new Set(plan.extras.flatMap((extra) => extra.tags));
  const kept = required.tags.filter((tag) => !moving.has(tag));

  if (kept.length === required.tags.length) return payload;

  const refined: Record<string, Entry> = {
    [REQUIRED]: {
      ...required,
      name: plan.name,
      description: plan.description,
      tags: kept
    }
  };

  for (const extra of plan.extras) {
    const tags = extra.tags.filter((tag) => required.tags?.includes(tag));

    if (tags.length) refined[extra.id] = { ...extra, tags };
  }

  for (const [id, entry] of Object.entries(payload)) {
    if (id !== REQUIRED) refined[id] = entry;
  }

  return refined;
}

export async function installOptions(appName: string): Promise<InstallOption[]> {
  const response = await fetch(`${CATALOG}/${encodeURIComponent(appName)}.json`);

  if (!response.ok) return [];

  const payload = refine(appName, (await response.json()) as Record<string, Entry>);
  catalogue.set(appName, payload);

  return Object.entries(payload).map(([id, entry]) => ({
    id,
    name: entry.name ?? id,
    description: entry.description ?? "",
    required: id === REQUIRED
  }));
}

export function hasComponents(appName: string): boolean | undefined {
  const payload = catalogue.get(appName);

  return payload ? Object.keys(payload).length > 0 : undefined;
}

export function selectedOptions(appName: string, installed: string[]): string[] {
  const payload = catalogue.get(appName);

  if (!payload) return [];

  const present = new Set(installed);

  return Object.entries(payload)
    .filter(
      ([id, entry]) =>
        id === REQUIRED ||
        (entry.tags?.length ? entry.tags.every((tag) => present.has(tag)) : false)
    )
    .map(([id]) => id);
}

export function installTags(appName: string, selected: string[]): string[] {
  const payload = catalogue.get(appName);

  if (!payload) return [];

  const tags = selected.flatMap((id) => payload[id]?.tags ?? []);

  return Array.from(new Set(tags));
}
