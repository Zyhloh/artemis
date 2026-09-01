import type { EpicAuthSession, LiveClient } from "fnapi-js";
import { followEos, followXmpp } from "./presence";
import { tauriSocket } from "./socket";

const clients = new WeakMap<EpicAuthSession, Promise<LiveClient>>();

export function openLive(session: EpicAuthSession): Promise<LiveClient> {
  const existing = clients.get(session);
  if (existing) return existing;

  const opening = session
    .connectEvents({ webSocket: tauriSocket })
    .then((events) => followEos(session, events))
    .catch((reason: unknown) => {
      console.warn("[friends] eos connect failed:", reason);
    })
    .then(() =>
      session.live({
        seedFriends: false,
        seedParty: false,
        connect: { webSocket: tauriSocket }
      })
    )
    .then((live) => {
      console.info("[friends] live client started");

      if (session.events) followEos(session, session.events);
      if (session.xmpp) followXmpp(session, session.xmpp);

      live.on("error", (reason) => {
        const detail = reason as unknown as {
          message?: string;
          status?: number;
          method?: string;
          url?: string;
          errorCode?: string | null;
          body?: unknown;
        };

        console.warn(
          "[friends] live error:",
          detail.method ?? "",
          detail.url ?? detail.message,
          "|",
          detail.status ?? "",
          detail.errorCode ?? "",
          "|",
          JSON.stringify(detail.body ?? {}).slice(0, 400)
        );
      });

      live.on("disconnected", (detail) =>
        console.warn("[friends] live disconnected:", detail)
      );

      console.info(
        "[friends] eos connected:",
        session.events?.connected ?? false,
        "| xmpp connected:",
        session.xmpp?.connected ?? false
      );

      return live;
    })
    .catch((reason: unknown) => {
      clients.delete(session);
      console.error("[friends] live client failed:", reason);
      throw reason;
    });

  clients.set(session, opening);
  return opening;
}

export async function closeLive(session: EpicAuthSession) {
  const existing = clients.get(session);
  if (!existing) return;

  clients.delete(session);

  await existing.catch(() => undefined);
  await session.disconnectLive().catch(() => undefined);
}
