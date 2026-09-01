import { useCallback, useEffect, useRef, useState } from "react";

export type RowPhase = "idle" | "busy" | "done" | "failed";

export interface RowNotes {
  busy: string;
  done: string;
  failed: string | ((error: unknown) => string);
}

const HOLD = 1150;
const RECOVER = 2800;

export function useRowAction(settle?: () => void) {
  const [active, setActive] = useState<string | null>(null);
  const [phase, setPhase] = useState<RowPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);
  const timer = useRef(0);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const reset = useCallback(() => {
    setActive(null);
    setPhase("idle");
    setMessage(null);
  }, []);

  const run = useCallback(
    async (key: string, notes: RowNotes, task: () => Promise<void>) => {
      if (phase !== "idle") return;

      setActive(key);
      setPhase("busy");
      setMessage(notes.busy);

      try {
        await task();
        if (!alive.current) return;

        setPhase("done");
        setMessage(notes.done);

        timer.current = window.setTimeout(() => {
          settle?.();
          if (alive.current) reset();
        }, HOLD);
      } catch (error) {
        if (!alive.current) return;

        setPhase("failed");
        setMessage(
          typeof notes.failed === "function" ? notes.failed(error) : notes.failed
        );

        timer.current = window.setTimeout(() => {
          if (alive.current) reset();
        }, RECOVER);
      }
    },
    [phase, reset, settle]
  );

  const phaseFor = useCallback(
    (key: string): RowPhase => (active === key ? phase : "idle"),
    [active, phase]
  );

  const shows = useCallback(
    (key: string) => active === null || active === key,
    [active]
  );

  return { active, phase, message, run, phaseFor, shows };
}
