import { useCallback, useEffect, useRef, useState } from "react";

export type ActionPhase = "idle" | "busy" | "done" | "failed";

const HOLD = 1000;
const RECOVER = 2200;

export function useAction(run: () => Promise<void>, settle?: () => void) {
  const [phase, setPhase] = useState<ActionPhase>("idle");
  const [error, setError] = useState<unknown>(null);
  const alive = useRef(true);
  const timer = useRef(0);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const fire = useCallback(async () => {
    if (phase === "busy" || phase === "done") return;

    window.clearTimeout(timer.current);
    setError(null);
    setPhase("busy");

    try {
      await run();
      if (!alive.current) return;

      setPhase("done");

      timer.current = window.setTimeout(() => {
        settle?.();
        if (alive.current) setPhase("idle");
      }, HOLD);
    } catch (thrown) {
      if (!alive.current) return;

      setError(thrown);
      setPhase("failed");

      timer.current = window.setTimeout(() => {
        if (alive.current) setPhase("idle");
      }, RECOVER);
    }
  }, [phase, run, settle]);

  return { phase, error, fire };
}
