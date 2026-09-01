import { invoke } from "@tauri-apps/api/core";
import { FnccAPI, type EpicAuthSession, type FetchLike } from "fnapi-js";
import { epic } from "./epic";
import { heldSession } from "./session";
import type { Account } from "@/types";

const OUTFIT_SLOT = "LoadoutSlot_Character";
const CATEGORY = "br";

export const LOCKER_EVENT = "locker:changed";

export interface Look {
  accountId: string;
  outfitId: string;
  outfitName: string | null;
  avatar: string | null;
}

interface LoadoutSlot {
  equippedItemId?: string | null;
  slotTemplate?: string | null;
}

interface Loadout {
  loadoutSlots?: LoadoutSlot[];
}

interface LockerItems {
  activeLoadoutGroup?: { loadouts?: Record<string, Loadout> };
}

const browserFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

const fncc = new FnccAPI({ fetch: browserFetch });
const sessions = new Map<string, Promise<EpicAuthSession>>();

const sessionFor = (account: Account): Promise<EpicAuthSession> => {
  const held = heldSession();
  if (held?.accountId === account.accountId) return Promise.resolve(held);

  const existing = sessions.get(account.accountId);
  if (existing) return existing;

  const opening = epic
    .loginWithDeviceAuth({
      accountId: account.accountId,
      deviceId: account.deviceId,
      secret: account.secret
    })
    .catch((reason: unknown) => {
      sessions.delete(account.accountId);
      throw reason;
    });

  sessions.set(account.accountId, opening);
  return opening;
};

export const forgetLockerSession = (accountId: string) => {
  const pending = sessions.get(accountId);
  sessions.delete(accountId);

  void pending?.then((session) => session.logout()).catch(() => undefined);
};

const equippedOf = (items: LockerItems): string | null => {
  const loadouts = items.activeLoadoutGroup?.loadouts ?? {};

  for (const loadout of Object.values(loadouts)) {
    for (const slot of loadout.loadoutSlots ?? []) {
      if (!slot.slotTemplate?.endsWith(OUTFIT_SLOT)) continue;

      const equipped = slot.equippedItemId;
      if (!equipped) continue;

      const id = equipped.split(":").pop() ?? "";
      if (id) return id.toLowerCase();
    }
  }

  return null;
};

export const rememberedLooks = () => invoke<Look[]>("locker_roster");

export async function refreshLook(account: Account): Promise<Look | null> {
  const session = await sessionFor(account);
  const items = (await session.lockerItems()) as LockerItems;
  const outfitId = equippedOf(items);

  if (!outfitId) return null;

  const cosmetic = await fncc.cosmetics.get(CATEGORY, outfitId);
  const images = cosmetic.images as
    | { icon?: string | null; smallIcon?: string | null }
    | undefined;

  const icon = images?.icon ?? images?.smallIcon;
  if (!icon) return null;

  return invoke<Look | null>("locker_remember", {
    accountId: account.accountId,
    outfitId,
    outfitName: cosmetic.name ?? null,
    icon
  });
}
