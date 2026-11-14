import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react";
import { NO_OVERFLOW, type OverflowPlan, type ToolUnit, planOverflow, samePlan } from "./overflow";

const px = (value: string, fallback: number) => {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
};

/** Units are measured where they stand, in the bar or in «More»: the tools look the same. */
export const UNIT_ATTRIBUTE = "data-gotipe-unit";

/**
 * Plans what leaves the bar for «More» from the bar's own width and its units' widths, before
 * paint, and again whenever the bar or a unit changes size (a longer font name, a narrower
 * container). Geometry comes from the theme: the gap, `--gt-hairline`, `--gt-tool-sep-gap` and
 * `--gt-tool` («More» is a square tool).
 */
export function useOverflowPlan(
  units: readonly ToolUnit[],
  root: RefObject<HTMLElement | null>,
  track: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
): OverflowPlan {
  const [plan, setPlan] = useState<OverflowPlan>(NO_OVERFLOW);
  const widths = useRef(new Map<string, number>());
  const latest = useRef(units);
  latest.current = units;
  const measure = useCallback(() => {
    const line = track.current;
    const owner = root.current;
    if (!line || !owner) return;
    for (const element of owner.querySelectorAll<HTMLElement>(`[${UNIT_ATTRIBUTE}]`)) {
      const id = element.getAttribute(UNIT_ATTRIBUTE);
      if (id) widths.current.set(id, element.getBoundingClientRect().width);
    }
    const style = getComputedStyle(line);
    const available = line.clientWidth - px(style.paddingLeft, 0) - px(style.paddingRight, 0);
    const metrics = {
      gap: px(style.columnGap, 2),
      separator:
        px(style.getPropertyValue("--gt-hairline"), 1) +
        2 * px(style.getPropertyValue("--gt-tool-sep-gap"), 4),
      more: px(style.getPropertyValue("--gt-tool"), 28),
    };
    const padding = panel.current ? px(getComputedStyle(panel.current).paddingLeft, 4) : 4;
    const next =
      available > 0
        ? planOverflow(latest.current, widths.current, available, metrics, padding)
        : NO_OVERFLOW;
    setPlan((previous) => (samePlan(previous, next) ? previous : next));
  }, [root, track, panel]);
  // Each render may move units between the bar and «More»: measure and observe them again.
  useLayoutEffect(() => {
    measure();
    const owner = root.current;
    const line = track.current;
    if (!owner || !line || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(line);
    for (const element of owner.querySelectorAll<HTMLElement>(`[${UNIT_ATTRIBUTE}]`))
      observer.observe(element);
    return () => observer.disconnect();
  });
  return plan;
}
