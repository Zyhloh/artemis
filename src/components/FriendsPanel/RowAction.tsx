import { Icon, type IconName } from "@components/Icon/Icon";
import type { RowPhase } from "@hooks/useRowAction";
import { Ticker } from "./Ticker";

interface RowActionProps {
  icon: IconName;
  label: string;
  phase: RowPhase;
  tone?: "go" | "no";
  onFire: () => void;
}

export function RowAction({
  icon,
  label,
  phase,
  tone = "go",
  onFire
}: RowActionProps) {
  if (phase === "busy") {
    return (
      <span className="social__icon social__icon--wait" aria-label={`${label}…`}>
        <span className="social__spinner social__spinner--small" />
      </span>
    );
  }

  const glyph = phase === "done" ? "check" : phase === "failed" ? "close" : icon;
  const shade = phase === "done" ? "won" : phase === "failed" ? "lost" : tone;

  return (
    <button
      className={`social__icon social__icon--${shade}`}
      onClick={onFire}
      disabled={phase !== "idle"}
      aria-label={label}
    >
      <Icon name={glyph} size={14} strokeWidth={2.2} />
    </button>
  );
}

interface RowNoteProps {
  phase: RowPhase;
  message: string | null;
  fallback: string;
}

export function RowNote({ phase, message, fallback }: RowNoteProps) {
  const text = message ?? fallback;

  const shade =
    phase === "done"
      ? " social__detail--good"
      : phase === "failed"
        ? " social__detail--bad social__detail--wrap"
        : "";

  if (phase === "failed") {
    return (
      <span className={`social__detail${shade}`} dir="auto" key={text}>
        {text}
      </span>
    );
  }

  return (
    <span className={`social__detail${shade}`} dir="auto" key={text}>
      <Ticker text={text} />
    </span>
  );
}
