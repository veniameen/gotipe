import { useEffect, useState } from "react";

export type ScrollMore = "left" | "right" | "both";

/**
 * The side of a sideways-scrolling element with more to see — `data-more`, as the library marks a
 * wide table. The theme fades that edge (GoTipe Atlas, frame 3).
 */
export function useScrollMore(element: HTMLElement | null): ScrollMore | undefined {
  const [more, setMore] = useState<ScrollMore | undefined>();
  useEffect(() => {
    if (!element) return;
    const update = () => {
      const left = element.scrollLeft > 1;
      const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setMore(left && right ? "both" : left ? "left" : right ? "right" : undefined);
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [element]);
  return more;
}
