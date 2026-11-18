import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { decorationRect } from "./dom-position";

/** A proposal or a comment with a card in the margin. */
export interface MarginItem {
  id: string;
  kind: "proposal" | "comment";
  render: (compact: boolean) => React.ReactNode;
}

function px(style: CSSStyleDeclaration, name: string): number {
  const value = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Whether the page is wide enough for a column of cards beside the text (GoTipe Atlas, frame 14):
 * the card, the gap and the least page width, all tokens. While it is, and there is something to
 * review, the page's root lays out as text and margin (`data-review-layout="margin"`). `inline`
 * never takes the column, `margin` always does.
 */
export function useMarginLayout(
  root: HTMLElement | null,
  active: boolean,
  layout: "auto" | "inline" | "margin" = "auto",
): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!root || layout !== "auto") return;
    const measure = () => {
      const style = getComputedStyle(root);
      const need =
        px(style, "--gt-card-w") + px(style, "--gt-margin-gap") + px(style, "--gt-margin-page-min");
      setWide(need > 0 && root.clientWidth >= need);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [root, layout]);
  const margin = active && (layout === "margin" || (layout === "auto" && wide));
  useEffect(() => {
    if (!root) return;
    if (margin) root.setAttribute("data-review-layout", "margin");
    else root.removeAttribute("data-review-layout");
    return () => root.removeAttribute("data-review-layout");
  }, [root, margin]);
  return margin;
}

/**
 * The cards of a page's review in its margin column: each stands level with its text, the next
 * one below the previous when they would meet; the open card has its answers, the others say who
 * and why, and open on a click.
 */
export function ReviewMargin({
  root,
  column,
  items,
  activeId,
  onActivate,
  tick,
}: {
  root: HTMLElement;
  column: HTMLElement;
  items: MarginItem[];
  activeId: string | null;
  onActivate: (id: string) => void;
  /** Changes when the text's decorations move. */
  tick: number;
}) {
  const slots = useRef(new Map<string, HTMLDivElement>());
  const [tops, setTops] = useState<Map<string, number>>(new Map());

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick and activeId re-place the cards
  useLayoutEffect(() => {
    const place = () => {
      const base = column.getBoundingClientRect().top;
      const gap = px(getComputedStyle(column), "--gt-card-gap");
      const wanted = items.map((item, index) => {
        const attr = item.kind === "proposal" ? "data-gotipe-proposal" : "data-gotipe-comment";
        const rect = decorationRect(root, attr, item.id);
        return { id: item.id, top: rect ? rect.top - base : Number.POSITIVE_INFINITY, index };
      });
      wanted.sort((a, b) => a.top - b.top || a.index - b.index);
      const next = new Map<string, number>();
      let floor = 0;
      for (const { id, top } of wanted) {
        const at = Math.max(Number.isFinite(top) ? top : floor, floor);
        next.set(id, at);
        floor = at + (slots.current.get(id)?.offsetHeight ?? 0) + gap;
      }
      setTops((previous) =>
        previous.size === next.size && [...next].every(([id, top]) => previous.get(id) === top)
          ? previous
          : next,
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(root);
    for (const slot of slots.current.values()) observer.observe(slot);
    return () => observer.disconnect();
  }, [root, column, items, activeId, tick]);

  return (
    <>
      {items.map((item) => {
        const top = tops.get(item.id);
        const open = item.id === activeId;
        return (
          <div
            key={item.id}
            ref={(element) => {
              if (element) slots.current.set(item.id, element);
              else slots.current.delete(item.id);
            }}
            className="gotipe-review-slot"
            data-open={open ? "" : undefined}
            style={{ top: top ?? 0, visibility: top === undefined ? "hidden" : undefined }}
            onMouseDown={(event) => {
              if (open) return;
              event.preventDefault();
              onActivate(item.id);
            }}
          >
            {item.render(!open)}
          </div>
        );
      })}
    </>
  );
}
