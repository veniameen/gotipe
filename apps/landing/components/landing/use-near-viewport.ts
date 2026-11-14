"use client";

import { type RefObject, useEffect, useState } from "react";

/** How far below the viewport a live demo starts to load its editor. */
const NEAR = "480px 0px";

/** True once the element comes near the viewport; it stays true. */
export function useNearViewport(target: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = target.current;
    if (near || !element) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: NEAR },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, target]);
  return near;
}
