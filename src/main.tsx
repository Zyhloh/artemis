import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MainWindow } from "@windows/main/MainWindow";
import { syncAppearance, watchAppearance } from "@lib/appearance";
import { lockShell } from "@lib/shell";
import { reveal } from "@lib/window";
import "@fontsource-variable/onest";
import "@styles/global.css";

lockShell();
void watchAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MainWindow />
  </StrictMode>
);

void syncAppearance()
  .then(reveal)
  .catch(() => undefined);
