export type BackdropKind = "mica" | "acrylic" | "blur" | "none";

export type ThemeMode = "light" | "dark";

export interface Appearance {
  backdrop: BackdropKind;
  mode: ThemeMode;
}

export interface AppConfig {
  app: {
    name: string;
    version: string;
  };
  appearance: {
    backdrop: BackdropKind;
  };
}

export interface AppInfo {
  name: string;
  version: string;
  author: string;
  identifier: string;
}

export interface LauncherToken {
  accessToken: string;
  expiresAt: string;
  refreshToken: string | null;
  refreshExpiresAt: string | null;
}

export interface Account {
  accountId: string;
  displayName: string;
  deviceId: string;
  secret: string;
  launcher?: LauncherToken | null;
}

export interface AccountStore {
  current: string | null;
  accounts: Account[];
}

export type AccountStage =
  | "idle"
  | "starting"
  | "waiting"
  | "finishing"
  | "logout"
  | "error";

export type LibraryKind = "game" | "app" | "extra";

export interface LibraryGame {
  appName: string;
  title: string;
  developer: string | null;
  namespace: string | null;
  catalogItemId: string | null;
  baseAppName: string | null;
  buildVersion: string | null;
  kind: LibraryKind;
  platforms: string[];
  thirdParty: string | null;
  art: string | null;
  artFile: string | null;
  wideArt: string | null;
  wideArtFile: string | null;
  installed: boolean;
  installPath: string | null;
  installSize: number | null;
  installedVersion: string | null;
  installTags: string[];
}

export interface LibrarySnapshot {
  games: LibraryGame[];
  refreshing: boolean;
  error: string | null;
}

export type LibraryStatus =
  | "signedOut"
  | "loading"
  | "ready"
  | "error";

export interface InstallOption {
  id: string;
  name: string;
  description: string;
  required: boolean;
}

export type InstallStatus = "loading" | "ready" | "error";

export type DownloadStage =
  | "preparing"
  | "verifying"
  | "downloading"
  | "paused"
  | "done"
  | "failed";

export type DownloadKind = "install" | "verify" | "import";

export interface DownloadJob {
  id: string;
  appName: string;
  kind: DownloadKind;
  missing: number;
  mismatched: number;
  fresh: boolean;
  title: string;
  path: string;
  tags: string[];
  stage: DownloadStage;
  percent: number;
  downloaded: number;
  written: number;
  downloadSize: number;
  installSize: number;
  speed: number;
  diskWrite: number;
  diskRead: number;
  eta: string;
  message: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface PathStatus {
  path: string;
  writable: boolean;
  elevated: boolean;
}

export type GameStage = "launching" | "running";

export interface GameSession {
  appName: string;
  stage: GameStage;
}

export interface LaunchFailure {
  appName: string;
  reason: string;
  outdated: boolean;
}

export interface GameStatus {
  appName: string;
  version: string;
  updateAvailable: boolean;
  installSize: number;
}

export interface LaunchArgs {
  enabled: boolean;
  value: string;
}

export interface TagSize {
  tag: string;
  download: number;
  disk: number;
}

export interface InstallManifest {
  downloadSize: number;
  diskSize: number;
  tags: TagSize[];
}

export type FriendState =
  | "online"
  | "away"
  | "extended"
  | "offline"
  | "blocked";

export interface FriendRow {
  accountId: string;
  displayName: string;
  nickname: string | null;
  avatar: string | null;
  state: FriendState;
  platform: string | null;
  statusText: string | null;
  playing: boolean;
}

export interface RequestRow {
  accountId: string;
  displayName: string;
  avatar: string | null;
  direction: "incoming" | "outgoing";
  created: string | null;
}

export type Relation = "none" | "friend" | "incoming" | "outgoing";

export interface SearchRow {
  accountId: string;
  displayName: string;
}
