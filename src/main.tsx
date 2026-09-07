import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MainWindow } from "@windows/main/MainWindow";
import { TrayMenu } from "@windows/tray/TrayMenu";
import { syncAppearance, watchAppearance } from "@lib/appearance";
import { lockShell } from "@lib/shell";
import { startupHidden } from "@lib/tray";
import { reveal } from "@lib/window";
import "@fontsource-variable/onest";
import "@styles/global.css";

const tray = getCurrentWindow().label === "tray";

if (tray) document.documentElement.dataset.window = "tray";

lockShell();
void watchAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>{tray ? <TrayMenu /> : <MainWindow />}</StrictMode>
);

void syncAppearance()
  .then(async () => {
    if (tray) return;

    const hidden = await startupHidden().catch(() => false);
    if (!hidden) await reveal();
  })
  .catch(() => undefined);
