import { useEffect, useRef, useState } from "react";

interface TickerProps {
  text: string;
  className?: string;
}

const SPEED = 20;
const LEAD = 1.8;
const TAIL = 1.4;
const REST = 3;
const FADE = 16;

export function Ticker({ text, className = "" }: TickerProps) {
  const holder = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const shell = holder.current;
    const inner = body.current;
    if (!shell || !inner) return;

    const measure = () => {
      const overflow = inner.scrollWidth - shell.clientWidth;
      setDistance(overflow > 1 ? Math.ceil(overflow) + FADE : 0);
    };

    measure();

    const watcher = new ResizeObserver(measure);
    watcher.observe(shell);

    return () => watcher.disconnect();
  }, [text]);

  useEffect(() => {
    const inner = body.current;
    if (!inner || distance <= 0) return;

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (calm.matches) return;

    const travel = distance / SPEED;
    const total = LEAD + travel + TAIL + REST;
    const away = `translateX(-${distance}px)`;

    const rolling = inner.animate(
      [
        { offset: 0, transform: "translateX(0)" },
        { offset: LEAD / total, transform: "translateX(0)" },
        { offset: (LEAD + travel) / total, transform: away },
        { offset: (LEAD + travel + TAIL) / total, transform: away },
        {
          offset: (LEAD + travel + TAIL) / total + 0.0001,
          transform: "translateX(0)"
        },
        { offset: 1, transform: "translateX(0)" }
      ],
      { duration: total * 1000, iterations: Infinity, easing: "linear" }
    );

    return () => rolling.cancel();
  }, [distance]);

  return (
    <span
      className={`ticker${distance > 0 ? " ticker--rolling" : ""} ${className}`.trim()}
      ref={holder}
    >
      <span className="ticker__text" ref={body}>
        {text}
      </span>
    </span>
  );
}
