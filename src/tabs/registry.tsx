import type { ComponentType } from "react";
import type { EpicAuthSession } from "fnapi-js";
import type { IconName } from "@components/Icon/Icon";
import type { Account, DownloadJob, GameSession, LibraryGame } from "@/types";
import { Downloads } from "./Downloads/Downloads";
import { ItemShop } from "./ItemShop/ItemShop";
import { Library } from "./Library/Library";
import { Settings } from "./Settings/Settings";

export interface TabProps {
  account: Account | null;
  session: EpicAuthSession | null;
  jobs: DownloadJob[];
  sessions: GameSession[];
  onInstall: (
    appName: string,
    title: string,
    path: string,
    tags: string[]
  ) => Promise<void>;
  onImport: (appName: string, title: string, path: string) => Promise<void>;
  onRequestCancel: (job: DownloadJob) => void;
  onPause: (appName: string) => void;
  onResume: (appName: string) => void;
  onClear: (id: string) => void;
  onClearHistory: () => void;
  onNavigate: (id: string) => void;
  onLaunch: (appName: string) => void;
  onRequestStop: (game: LibraryGame) => void;
  onUpdate: (game: LibraryGame) => void;
  onVerify: (game: LibraryGame) => void;
  onUninstall: (game: LibraryGame) => void;
}

export interface TabEntry {
  id: string;
  label: string;
  icon: IconName;
  view: ComponentType<TabProps>;
}

export interface TabGroup {
  id: string;
  label?: string;
  items: TabEntry[];
}

export const TAB_GROUPS: TabGroup[] = [
  {
    id: "main",
    items: [
      { id: "library", label: "Library", icon: "library", view: Library },
      { id: "downloads", label: "Downloads", icon: "download", view: Downloads },
      { id: "item-shop", label: "Item Shop", icon: "shop", view: ItemShop }
    ]
  }
];

export const FOOTER_GROUP: TabGroup = {
  id: "system",
  items: [
    { id: "settings", label: "Settings", icon: "settings", view: Settings }
  ]
};

export const ALL_TABS: TabEntry[] = [
  ...TAB_GROUPS.flatMap((group) => group.items),
  ...FOOTER_GROUP.items
];
