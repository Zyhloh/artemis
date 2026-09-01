import { AuthClients, type EpicAuthSession } from "fnapi-js";
import { epic } from "./epic";
import { setLauncherToken } from "./accounts";
import { heldSession } from "./session";
import { authenticateLibrary, libraryAccount } from "./library";
import type { Account, LauncherToken } from "@/types";

export const toLauncherToken = (session: EpicAuthSession): LauncherToken => ({
  accessToken: session.accessToken,
  expiresAt: session.expiresAt.toISOString(),
  refreshToken: session.refreshTokenValue,
  refreshExpiresAt: null
});

export const launcherSession = async (account: Account) => {
  const held = heldSession();
  const owned = held?.accountId === account.accountId ? held : null;

  const session =
    owned ??
    (await epic.loginWithDeviceAuth({
      accountId: account.accountId,
      deviceId: account.deviceId,
      secret: account.secret
    }));

  try {
    return await session.switchClient(AuthClients.launcherApp);
  } finally {
    if (!owned) void session.logout().catch(() => undefined);
  }
};

export async function linkLibrary(account: Account): Promise<void> {
  const launcher = await launcherSession(account);

  const exchange = await launcher.createExchangeCode();
  await authenticateLibrary(exchange.code);

  const saved = await launcherSession(account);
  await setLauncherToken(account.accountId, toLauncherToken(saved));
}

let linking: { accountId: string; task: Promise<void> } | null = null;

export async function ensureLibraryLink(account: Account): Promise<void> {
  if (linking?.accountId === account.accountId) return linking.task;

  const task = (async () => {
    const linked = await libraryAccount();
    if (linked === account.accountId) return;

    await linkLibrary(account);

    const now = await libraryAccount();

    if (now !== account.accountId) {
      throw new Error(
        `The library is still signed in as another account (${now ?? "none"}).`
      );
    }
  })();

  linking = { accountId: account.accountId, task };

  try {
    await task;
  } finally {
    if (linking?.task === task) linking = null;
  }
}
