import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkForUpdates,
  installUpdate,
  updateStatus,
  watchUpdateProgress,
  watchUpdates,
  type UpdateProgress,
  type UpdateStatus
} from "@lib/update";

export type CheckPhase = "idle" | "checking" | "settled";
export type InstallPhase = "idle" | "downloading" | "installing" | "failed";

let cached: UpdateStatus | null = null;

const SETTLE = 4000;
const MIN_SPIN = 900;

export function useUpdate() {
  const [status, setStatus] = useState<UpdateStatus | null>(cached);
  const [phase, setPhase] = useState<CheckPhase>("idle");
  const [install, setInstall] = useState<InstallPhase>("idle");
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const manual = useRef<number | null>(null);

  useEffect(() => {
    let live = true;

    const adopt = (next: UpdateStatus) => {
      if (!live) return;

      cached = next;
      setStatus(next);

      if (manual.current !== null && !next.checking) {
        const elapsed = Date.now() - manual.current;
        manual.current = null;

        setTimeout(
          () => {
            if (!live) return;
            setPhase("settled");
            setTimeout(() => {
              if (live) setPhase("idle");
            }, SETTLE);
          },
          Math.max(0, MIN_SPIN - elapsed)
        );
      }
    };

    updateStatus().then(adopt).catch(() => undefined);

    const changes = watchUpdates(adopt);
    const advances = watchUpdateProgress((next) => {
      if (!live) return;
      setProgress(next);
      setInstall(next.stage);
    });

    return () => {
      live = false;
      void changes.then((off) => off());
      void advances.then((off) => off());
    };
  }, []);

  const check = useCallback(() => {
    if (phase !== "idle") return;

    manual.current = Date.now();
    setPhase("checking");
    void checkForUpdates().catch(() => {
      manual.current = null;
      setPhase("idle");
    });
  }, [phase]);

  const apply = useCallback(() => {
    if (install === "downloading" || install === "installing") return;

    setFailure(null);
    setProgress(null);
    setInstall("downloading");

    installUpdate().catch((cause) => {
      setInstall("failed");
      setFailure(
        cause instanceof Error ? cause.message : "The update could not be installed."
      );
    });
  }, [install]);

  return { status, phase, install, progress, failure, check, apply };
}
