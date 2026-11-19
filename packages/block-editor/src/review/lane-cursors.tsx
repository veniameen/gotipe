import type { GoTipeEditor } from "@gotipe/core";
import { type LaneCursor, type ReviewLane, findAnchor, mapOffsetToText } from "@gotipe/suggestions";
import type React from "react";
import { useLayoutEffect, useState } from "react";
import { PageIcon, type PageIconName } from "../page/icons";
import type { MarkdownSession } from "../page/markdown-session";
import { proposalEndRect, rectAt } from "./dom-position";
import { LANE_ICON } from "./review-cards";

/** How a lane's cursor looks: a caret with a flag, or an arrow pointer with its name. */
export type ReviewLaneCursor = "caret" | "pointer";

interface Placed {
  laneId: string;
  name: string;
  label?: string;
  color: string;
  icon: PageIconName;
  top: number;
  left: number;
  height: number;
}

/**
 * The cursors of a review's lanes over the page: each at the end of its proposal's new text, or
 * after its anchor's quote. They follow layout: the review's decorations (`tick`), scroll, resize.
 */
export function LaneCursors({
  editor,
  session,
  root,
  cursors,
  lanes,
  tick,
  look = "caret",
  pointer,
}: {
  editor: GoTipeEditor;
  session: MarkdownSession;
  root: HTMLElement | null;
  cursors: LaneCursor[] | undefined;
  lanes: Map<string, ReviewLane>;
  /** Changes when the review's decorations were drawn again. */
  tick: number;
  look?: ReviewLaneCursor;
  /** The host's own arrow for `look: "pointer"` instead of the built-in one. */
  pointer?: React.ReactNode;
}) {
  const [placed, setPlaced] = useState<Placed[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick re-places after decorations change
  useLayoutEffect(() => {
    if (!root) return;
    const place = () => {
      const page = session.serialize(editor);
      const out: Placed[] = [];
      for (const cursor of cursors ?? []) {
        const lane = lanes.get(cursor.laneId);
        if (!lane) continue;
        let rect: DOMRect | null = null;
        if (cursor.proposalId) rect = proposalEndRect(root, cursor.proposalId);
        if (!rect && cursor.anchor) {
          const m = findAnchor(page.text, cursor.anchor);
          if (m.ok) {
            const pos = mapOffsetToText(page.map, m.end, "before");
            if (pos) rect = rectAt(root, pos.blockId, pos.offset);
          }
        }
        if (!rect) continue;
        out.push({
          laneId: lane.id,
          name: lane.name,
          label: cursor.label,
          color: lane.color ?? "var(--gt-track-1)",
          icon: LANE_ICON[lane.kind],
          top: rect.top,
          left: rect.left,
          height: rect.height || 20,
        });
      }
      setPlaced(out);
    };
    place();
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    const observer = new ResizeObserver(place);
    observer.observe(root);
    const content = root.querySelector("[data-gotipe-content]");
    if (content) observer.observe(content);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [root, editor, session, cursors, lanes, tick]);

  const arrow = look === "pointer";
  return (
    <>
      {placed.map((c) => (
        <div
          key={c.laneId}
          className="gotipe-lane-cursor"
          style={
            {
              position: "fixed",
              top: c.top,
              left: c.left,
              height: c.height,
              "--gt-track": c.color,
            } as React.CSSProperties
          }
          data-variant={arrow ? "pointer" : undefined}
          aria-hidden="true"
        >
          {arrow && pointer ? (
            <span className="gotipe-lane-pointer">{pointer}</span>
          ) : arrow ? (
            <PageIcon name="pointer" className="gotipe-lane-pointer" />
          ) : (
            <span className="gotipe-lane-caret" />
          )}
          <span className="gotipe-lane-chip">
            <span className="gotipe-lane-chip-name">{c.name}</span>
            {c.label ? <span className="gotipe-lane-chip-label">{c.label}</span> : null}
          </span>
        </div>
      ))}
    </>
  );
}
