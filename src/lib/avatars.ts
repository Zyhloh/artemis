import { extractCharacterId, type EpicAuthSession } from "fnapi-js";

const CDN = "https://cdn.fn-api.cc/cosmetics/br";
const BATCH = 100;

export const STOCK_FACE = `${CDN}/cid_defaultoutfit/smallicon.png`;

export type Face = string | null;

export const iconFor = (avatarId: string): Face => {
  const characterId = extractCharacterId(avatarId);
  return characterId ? `${CDN}/${characterId}/smallicon.png` : STOCK_FACE;
};

export async function loadAvatars(
  session: EpicAuthSession,
  accountIds: string[]
): Promise<Map<string, Face>> {
  const wanted = [...new Set(accountIds)].filter(Boolean);
  const found = new Map<string, Face>();

  for (let cursor = 0; cursor < wanted.length; cursor += BATCH) {
    const slice = wanted.slice(cursor, cursor + BATCH);
    const entries = await session.avatars(slice).catch(() => []);

    for (const entry of entries) {
      found.set(entry.accountId, iconFor(entry.avatarId));
    }

    for (const accountId of slice) {
      if (!found.has(accountId)) found.set(accountId, STOCK_FACE);
    }
  }

  return found;
}
