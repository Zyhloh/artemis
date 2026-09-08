import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const ATTRIBUTE = "data-flip";
const DURATION = 320;
const EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const THRESHOLD = 1;

const relative = (node: HTMLElement, origin: DOMRect) => {
  const rect = node.getBoundingClientRect();
  return { left: rect.left - origin.left, top: rect.top - origin.top };
};

const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useFlip(
  container: RefObject<HTMLElement | null>,
  signal: unknown,
  observe = true
) {
  const positions = useRef(new Map<string, { left: number; top: number }>());
  const running = useRef(new Set<Animation>());
  const frame = useRef(0);

  const track = () => {
    cancelAnimationFrame(frame.current);

    const tick = () => {
      if (running.current.size === 0) return;

      const root = container.current;
      if (!root) return;

      const origin = root.getBoundingClientRect();

      for (const node of root.querySelectorAll<HTMLElement>(`[${ATTRIBUTE}]`)) {
        const key = node.getAttribute(ATTRIBUTE);
        if (key) positions.current.set(key, relative(node, origin));
      }

      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
  };

  const pass = () => {
    const root = container.current;
    if (!root) return;

    const nodes = [...root.querySelectorAll<HTMLElement>(`[${ATTRIBUTE}]`)];
    const before = new Map(positions.current);

    for (const animation of running.current) animation.cancel();
    running.current.clear();

    const origin = root.getBoundingClientRect();
    const next = new Map<string, { left: number; top: number }>();
    const moves: { node: HTMLElement; dx: number; dy: number }[] = [];

    for (const node of nodes) {
      const key = node.getAttribute(ATTRIBUTE);
      if (!key) continue;

      const after = relative(node, origin);
      next.set(key, after);

      const prior = before.get(key);
      if (!prior) continue;

      const dx = prior.left - after.left;
      const dy = prior.top - after.top;

      if (Math.abs(dx) > THRESHOLD || Math.abs(dy) > THRESHOLD) {
        moves.push({ node, dx, dy });
      }
    }

    positions.current = next;

    if (!moves.length || still()) return;

    for (const { node, dx, dy } of moves) {
      const animation = node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: DURATION, easing: EASING }
      );

      running.current.add(animation);
      animation.onfinish = () => running.current.delete(animation);
      animation.oncancel = () => running.current.delete(animation);
    }

    track();
  };

  useLayoutEffect(pass, [signal]);

  useEffect(() => {
    const root = container.current;
    if (!root || !observe || typeof ResizeObserver !== "function") return;

    const observer = new ResizeObserver(pass);
    observer.observe(root);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      for (const animation of running.current) animation.cancel();
      running.current.clear();
    };
  }, [container, observe]);
}
