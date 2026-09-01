import { normalizeConnectPresence } from "fnapi-js";
import type {
  ConnectPresenceUpdate,
  EpicAuthSession,
  FriendPresence,
  PresenceShow
} from "fnapi-js";

const stores = new WeakMap<EpicAuthSession, Map<string, FriendPresence>>();
const tracked = new WeakSet<object>();

export const presenceStore = (session: EpicAuthSession) => {
  const existing = stores.get(session);
  if (existing) return existing;

  const created = new Map<string, FriendPresence>();
  stores.set(session, created);
  return created;
};

const SHOWN: Record<string, PresenceShow> = {
  away: "away",
  extendedaway: "xa",
  xa: "xa",
  dnd: "dnd"
};

const namespacesOf = (payload: Record<string, unknown>) =>
  Array.isArray(payload.perNs) ? payload.perNs : [];

const showOf = (payload: Record<string, unknown>): PresenceShow | null => {
  const raw = typeof payload.status === "string" ? payload.status : "";
  const top = raw.trimStart().startsWith("{") ? "" : raw.toLowerCase();
  const perNs = namespacesOf(payload);

  const aggregate = SHOWN[top];
  if (aggregate) return aggregate;

  for (const entry of perNs) {
    const status = (entry as { status?: unknown } | null)?.status;
    const found = typeof status === "string" ? SHOWN[status.toLowerCase()] : undefined;
    if (found) return found;
  }

  if (top !== "offline" && perNs.length === 0) return "away";

  return null;
};

const trackEos = (session: EpicAuthSession, update: ConnectPresenceUpdate) => {
  const store = presenceStore(session);
  const entry = normalizeConnectPresence(update.payload);

  if (!entry || !entry.available) {
    store.delete(update.accountId);
    return;
  }

  const launcherOnly = namespacesOf(update.payload).length === 0;

  store.set(update.accountId, {
    ...entry,
    show: showOf(update.payload),
    statusText: entry.statusText ?? (launcherOnly ? "In Launcher" : null)
  });
};

export const followEos = (
  session: EpicAuthSession,
  events: { on(event: "presence", listener: (update: ConnectPresenceUpdate) => void): unknown }
) => {
  if (tracked.has(events)) return;

  tracked.add(events);
  events.on("presence", (update) => trackEos(session, update));
};

export const followXmpp = (
  session: EpicAuthSession,
  xmpp: { on(event: "presence", listener: (entry: FriendPresence) => void): unknown }
) => {
  if (tracked.has(xmpp)) return;

  tracked.add(xmpp);
  xmpp.on("presence", (entry) => {
    const store = presenceStore(session);

    if (entry.available) {
      store.set(entry.accountId, entry);
    } else {
      store.delete(entry.accountId);
    }
  });
};
