import { useCallback, useEffect, useRef, useState } from "react";

/** Keeps controls reachable while the pointer crosses the small gap to a floating toolbar. */
export function useHoverIntent(delay = 140) {
  const [hovered, setHovered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  const onEnter = useCallback(() => {
    cancel();
    setHovered(true);
  }, [cancel]);
  const onLeave = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      setHovered(false);
    }, delay);
  }, [cancel, delay]);
  return { hovered, onEnter, onLeave };
}
