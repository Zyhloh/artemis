import { useCallback, useEffect, useRef } from "react";

const VISIBLE = "is-revealed";
const MARGIN = "0px 0px -8% 0px";

const still = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useReveal() {
  const watcher = useRef<IntersectionObserver | null>(null);
  const idle = useRef(true);

  if (idle.current) {
    idle.current = false;

    if (typeof IntersectionObserver === "function" && !still()) {
      watcher.current = new IntersectionObserver(
        (entries, observer) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            entry.target.classList.add(VISIBLE);
            observer.unobserve(entry.target);
          }
        },
        { rootMargin: MARGIN, threshold: 0.01 }
      );
    }
  }

  useEffect(() => () => watcher.current?.disconnect(), []);

  return useCallback((node: HTMLElement | null) => {
    if (!node) return;

    if (!watcher.current) {
      node.classList.add(VISIBLE);
      return;
    }

    watcher.current.observe(node);
  }, []);
}
