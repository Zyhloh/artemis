import { getCurrentWindow } from "@tauri-apps/api/window";

export const minimize = () => getCurrentWindow().minimize();

export const close = () => getCurrentWindow().close();

export const toggleMaximize = () => getCurrentWindow().toggleMaximize();

export const isMaximized = () => getCurrentWindow().isMaximized();

export const reveal = () => getCurrentWindow().show();

export const onResized = (handler: (maximized: boolean) => void) =>
  getCurrentWindow().onResized(async () => {
    handler(await getCurrentWindow().isMaximized());
  });
