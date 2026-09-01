import type { EpicAuthSession, FriendPresence } from "fnapi-js";
import { displayName } from "./display";
import { presenceStore } from "./presence";
import type {
  FriendRow,
  FriendState,
  Relation,
  RequestRow,
  SearchRow
} from "@/types";

interface Named {
  accountId: string;
  displayName?: string;
  account?: { displayName?: string };
}

export const nameOf = (entry: Named) =>
  displayName(entry.displayName ?? entry.account?.displayName ?? "") ||
  entry.accountId.slice(0, 8);

const same = (row: FriendRow, next: FriendRow) =>
  next.state === row.state &&
  next.platform === row.platform &&
  next.statusText === row.statusText &&
  next.playing === row.playing;

const stateOf = (entry: FriendPresence): FriendState => {
  if (!entry.available) return "offline";
  if (entry.show === "xa") return "extended";
  if (entry.show === "away") return "away";

  return "online";
};

const spokenOf = (entry: FriendPresence): string | null => {
  const rich = entry.status?.Status;

  if (typeof rich === "string") {
    const clean = displayName(rich);
    if (clean) return clean;
  }

  const plain = entry.statusText;

  if (typeof plain === "string" && !plain.trimStart().startsWith("{")) {
    const clean = displayName(plain);
    if (clean) return clean;
  }

  return null;
};

const merge = (row: FriendRow, entry: FriendPresence): FriendRow => {
  const spoken = spokenOf(entry);

  const next: FriendRow = {
    ...row,
    state: stateOf(entry),
    platform: entry.platform ?? row.platform,
    statusText: spoken ?? row.statusText,
    playing: entry.playing
  };

  return same(row, next) ? row : next;
};

const offline = (row: FriendRow): FriendRow => {
  const next: FriendRow = {
    ...row,
    state: "offline",
    platform: null,
    statusText: null,
    playing: false
  };

  return same(row, next) ? row : next;
};

export async function loadPresences(session: EpicAuthSession) {
  const rows = await session.friendPresences().catch((reason: unknown) => {
    console.warn("[friends] friendPresences failed:", reason);
    return [];
  });

  const entries = new Map(rows.map((entry) => [entry.accountId, entry]));

  for (const [accountId, entry] of presenceStore(session)) {
    entries.set(accountId, entry);
  }

  console.info(
    "[friends] presences:",
    entries.size,
    "| store:",
    presenceStore(session).size,
    "| eos cache:",
    session.events?.presences.size ?? 0,
    "| xmpp cache:",
    session.xmpp?.presences.size ?? 0
  );

  return entries;
}

export async function loadFriends(session: EpicAuthSession) {
  const [summary, resolved, presences] = await Promise.all([
    session.friendsSummary(),
    session.friendsListResolved(),
    loadPresences(session)
  ]);

  const friends: FriendRow[] = resolved.map((entry) => ({
    accountId: entry.accountId,
    displayName: nameOf(entry as Named),
    nickname: displayName(entry.nickname ?? "") || null,
    avatar: null,
    state: "offline",
    platform: null,
    statusText: null,
    playing: false
  }));

  const blocked: FriendRow[] = summary.blocklist.map((entry) => ({
    accountId: entry.accountId,
    displayName: nameOf(entry as unknown as Named),
    nickname: null,
    avatar: null,
    state: "blocked",
    platform: null,
    statusText: null,
    playing: false
  }));

  const label = async (ids: string[]) => {
    if (!ids.length) return new Map<string, string>();

    const entries = await session
      .resolveFriends(ids.map((accountId) => ({ accountId })))
      .catch(() => []);

    return new Map(
      entries.map((entry) => [entry.accountId, nameOf(entry as Named)])
    );
  };

  const [incomingNames, outgoingNames] = await Promise.all([
    label(summary.incoming.map((entry) => entry.accountId)),
    label(summary.outgoing.map((entry) => entry.accountId))
  ]);

  const requests: RequestRow[] = [
    ...summary.incoming.map((entry) => ({
      accountId: entry.accountId,
      displayName: incomingNames.get(entry.accountId) ?? entry.accountId,
      avatar: null,
      direction: "incoming" as const,
      created: entry.created ?? null
    })),
    ...summary.outgoing.map((entry) => ({
      accountId: entry.accountId,
      displayName: outgoingNames.get(entry.accountId) ?? entry.accountId,
      avatar: null,
      direction: "outgoing" as const,
      created: entry.created ?? null
    }))
  ];

  return { friends: seedPresence(friends, presences), blocked, requests };
}

export async function findUsers(
  session: EpicAuthSession,
  prefix: string
): Promise<SearchRow[]> {
  const results = await session.searchUsersResolved(prefix);
  const self = session.accountId;

  return results
    .filter((entry) => entry.accountId !== self)
    .map((entry) => ({
      accountId: entry.accountId,
      displayName: nameOf(entry as unknown as Named)
    }));
}

export const relationOf = (
  accountId: string,
  friends: FriendRow[],
  requests: RequestRow[]
): Relation => {
  if (friends.some((entry) => entry.accountId === accountId)) return "friend";

  const pending = requests.find((entry) => entry.accountId === accountId);
  if (pending) return pending.direction;

  return "none";
};

export const detailOf = (row: FriendRow): string => {
  if (row.state === "blocked") return STATE_LABEL.blocked;
  if (row.state === "offline") return STATE_LABEL.offline;
  if (row.statusText) return row.statusText;
  if (row.playing) return "In a match";
  if (row.state === "away") return STATE_LABEL.away;
  if (row.state === "extended") return STATE_LABEL.extended;

  return "In Launcher";
};

export const applyPresence = (
  rows: FriendRow[],
  entry: FriendPresence
): FriendRow[] =>
  rows.map((row) =>
    row.accountId === entry.accountId ? merge(row, entry) : row
  );

export const dropPresence = (
  rows: FriendRow[],
  accountId: string
): FriendRow[] => {
  let changed = false;

  const next = rows.map((row) => {
    if (row.accountId !== accountId || row.state === "blocked") return row;

    const gone = offline(row);
    if (gone === row) return row;

    changed = true;
    return gone;
  });

  return changed ? next : rows;
};

export const seedPresence = (
  rows: FriendRow[],
  entries: ReadonlyMap<string, FriendPresence>
): FriendRow[] => {
  let changed = false;

  const next = rows.map((row) => {
    if (row.state === "blocked") return row;

    const entry = entries.get(row.accountId);
    const merged = entry ? merge(row, entry) : offline(row);

    if (merged === row) return row;

    changed = true;
    return merged;
  });

  return changed ? next : rows;
};

const SOCIAL = /^com\.epicgames\.(friends|social)\./;

export const isSocialNotification = (body: string) => {
  try {
    const parsed: unknown = JSON.parse(body);
    const kind = (parsed as { type?: unknown }).type;

    return typeof kind === "string" && SOCIAL.test(kind);
  } catch {
    return false;
  }
};

export const ORDER: FriendState[] = [
  "online",
  "away",
  "extended",
  "offline",
  "blocked"
];

export const STATE_LABEL: Record<FriendState, string> = {
  online: "Online",
  away: "Away",
  extended: "Extended Away",
  offline: "Offline",
  blocked: "Blocked"
};
