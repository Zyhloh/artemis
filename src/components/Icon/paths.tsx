import type { ReactNode } from "react";

export type IconName =
  | "home"
  | "library"
  | "shop"
  | "settings"
  | "friends"
  | "user"
  | "download"
  | "pause"
  | "disk"
  | "clock"
  | "more"
  | "refresh"
  | "folder"
  | "personAdd"
  | "inbox"
  | "search"
  | "copy"
  | "ban"
  | "chevronLeft"
  | "plus"
  | "link"
  | "play"
  | "check"
  | "trash"
  | "close"
  | "pin"
  | "grid"
  | "list"
  | "filter"
  | "chevronDown"
  | "chevronRight"
  | "external";

export const ICON_PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3.5 10.2 12 3.5l8.5 6.7" />
      <path d="M5.6 8.8V19a1.5 1.5 0 0 0 1.5 1.5h9.8a1.5 1.5 0 0 0 1.5-1.5V8.8" />
      <path d="M9.75 20.5v-6.25h4.5v6.25" />
    </>
  ),
  library: (
    <>
      <path d="M12 2.5 3 7l9 4.5L21 7l-9-4.5Z" />
      <path d="M3 12l9 4.5L21 12" />
      <path d="M3 16.5 12 21l9-4.5" />
    </>
  ),
  shop: (
    <>
      <path d="M4.5 7.5h15l-1.1 12a1.6 1.6 0 0 1-1.6 1.5H7.2a1.6 1.6 0 0 1-1.6-1.5L4.5 7.5Z" />
      <path d="M8.75 10.5V6.75a3.25 3.25 0 0 1 6.5 0v3.75" />
    </>
  ),
  settings: (
    <>
      <path d="M10.29 2.76L13.71 2.76L13.94 5.22L15.42 5.83L17.32 4.25L19.75 6.68L18.17 8.58L18.78 10.06L21.24 10.29L21.24 13.71L18.78 13.94L18.17 15.42L19.75 17.32L17.32 19.75L15.42 18.17L13.94 18.78L13.71 21.24L10.29 21.24L10.06 18.78L8.58 18.17L6.68 19.75L4.25 17.32L5.83 15.42L5.22 13.94L2.76 13.71L2.76 10.29L5.22 10.06L5.83 8.58L4.25 6.68L6.68 4.25L8.58 5.83L10.06 5.22Z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  friends: (
    <>
      <path d="M15.2 20.5v-1.7a4 4 0 0 0-4-4H6.4a4 4 0 0 0-4 4v1.7" />
      <circle cx="8.8" cy="7.4" r="3.6" />
      <path d="M21.6 20.5v-1.7a4 4 0 0 0-3-3.87" />
      <path d="M15.6 4a4 4 0 0 1 0 7.75" />
    </>
  ),
  user: (
    <>
      <path d="M19 20.4v-1.8a4.2 4.2 0 0 0-4.2-4.2H9.2A4.2 4.2 0 0 0 5 18.6v1.8" />
      <circle cx="12" cy="7.8" r="4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.6v11.2" />
      <path d="M7.6 10.4 12 14.8l4.4-4.4" />
      <path d="M4.6 20.4h14.8" />
    </>
  ),
  pause: (
    <>
      <path d="M9.4 4.8v14.4" />
      <path d="M14.6 4.8v14.4" />
    </>
  ),
  disk: (
    <>
      <path d="M4 7.2a8 3.2 0 1 0 16 0a8 3.2 0 1 0-16 0" />
      <path d="M4 7.2v9.6c0 1.77 3.58 3.2 8 3.2s8-1.43 8-3.2V7.2" />
      <path d="M4 12c0 1.77 3.58 3.2 8 3.2s8-1.43 8-3.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2V12l3.2 2.2" />
    </>
  ),
  more: (
    <>
      <circle cx="5.6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18.4" cy="12" r="1.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.2 12a8.2 8.2 0 1 1-2.4-5.8" />
      <path d="M20.4 4.4v5.2h-5.2" />
    </>
  ),
  folder: (
    <path d="M3.4 7.2a1.8 1.8 0 0 1 1.8-1.8h3.6l2 2.4h7.8a1.8 1.8 0 0 1 1.8 1.8v8.4a1.8 1.8 0 0 1-1.8 1.8H5.2a1.8 1.8 0 0 1-1.8-1.8Z" />
  ),
  personAdd: (
    <>
      <path d="M15.6 20.4v-1.8a4.2 4.2 0 0 0-4.2-4.2H6.6a4.2 4.2 0 0 0-4.2 4.2v1.8" />
      <circle cx="9" cy="7.6" r="3.8" />
      <path d="M18.4 8v5.6M21.2 10.8h-5.6" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.4 13.2h4.2l1.4 2.4h6l1.4-2.4h4.2" />
      <path d="M6.1 4.6h11.8l2.7 8.6v4.4a1.8 1.8 0 0 1-1.8 1.8H5.2a1.8 1.8 0 0 1-1.8-1.8v-4.4Z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.4" />
      <path d="M15.5 15.5 20.4 20.4" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11.6" height="11.6" rx="2.2" />
      <path d="M15 6.4V5.6a2.2 2.2 0 0 0-2.2-2.2H5.6A2.2 2.2 0 0 0 3.4 5.6v7.2A2.2 2.2 0 0 0 5.6 15h0.8" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M6.06 6.06 17.94 17.94" />
    </>
  ),
  chevronLeft: <path d="M14.6 4.8 7.4 12l7.2 7.2" />,
  chevronDown: <path d="M4.8 9.4 12 16.6l7.2-7.2" />,
  chevronRight: <path d="M9.4 4.8 16.6 12l-7.2 7.2" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
    </>
  ),
  list: (
    <>
      <path d="M8.5 6h12M8.5 12h12M8.5 18h12" />
      <circle cx="4.2" cy="6" r="1.1" />
      <circle cx="4.2" cy="12" r="1.1" />
      <circle cx="4.2" cy="18" r="1.1" />
    </>
  ),
  filter: <path d="M3.5 5.5h17l-6.6 7.6v5.4l-3.8 1.8v-7.2Z" />,
  external: (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 11 13" />
      <path d="M17.5 13.5v5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V8A1.5 1.5 0 0 1 5.5 6.5h5" />
    </>
  ),
  plus: <path d="M12 5.2v13.6M5.2 12h13.6" />,
  link: (
    <>
      <path d="M10.2 13.8a3.8 3.8 0 0 0 5.7.4l2.9-2.9a3.8 3.8 0 0 0-5.4-5.4l-1.7 1.7" />
      <path d="M13.8 10.2a3.8 3.8 0 0 0-5.7-.4l-2.9 2.9a3.8 3.8 0 0 0 5.4 5.4l1.7-1.7" />
    </>
  ),
  play: <path d="M7.6 4.9 18.4 12 7.6 19.1Z" />,
  check: <path d="M4.8 12.6 9.6 17.4 19.2 6.8" />,
  trash: (
    <>
      <path d="M4 6.4h16" />
      <path d="M9.5 6.4V4.7a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.3 6.4 7.1 19.3a1.6 1.6 0 0 0 1.6 1.5h6.6a1.6 1.6 0 0 0 1.6-1.5l.8-12.9" />
    </>
  ),
  close: <path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" />,
  pin: (
    <>
      <path d="M12 16.5V22" />
      <path d="M8.5 3h7l-1.2 7 3.7 3.2v1.3H6V13.2L9.7 10 8.5 3Z" />
    </>
  )
};
