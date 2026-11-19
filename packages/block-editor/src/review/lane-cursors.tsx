import type { GoTipeEditor } from "@gotipe/core";
import {
  type LaneCursor,
  type ProposalState,
  type ReviewLane,
  findAnchor,
  mapOffsetToText,
} from "@gotipe/suggestions";
import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { PageIcon } from "../page/icons";
import type { MarkdownSession } from "../page/markdown-session";
import { type ChipSide, type ChipState, chipSide } from "./chip-side";
import { liveEndRects, proposalEndRect, rectAt } from "./dom-position";

/** How a lane's cursor looks: a caret with a flag, or an arrow pointer with its name. */
export type ReviewLaneCursor = "caret" | "pointer";

interface Placed {
  key: string;
  name: string;
  label?: string;
  color: string;
  compact: boolean;
  /** It follows a growing proposal's text: a move the text made is drawn as one. */
  glide: boolean;
  /** Where its flag stands: after it, or before it when the page's edge leaves no room. */
  side: ChipSide;
  top: number;
  left: number;
  height: number;
}

const FIELDS = [
  "key",
  "name",
  "label",
  "color",
  "compact",
  "glide",
  "side",
  "top",
  "left",
  "height",
] as const;
const samePlaced = (a: Placed[], b: Placed[]) =>
  a.length === b.length &&
  a.every((one, index) => FIELDS.every((field) => one[field] === b[index]![field]));

/**
 * The cursors of a review's lanes over the page: each at the end of its proposal's new text
 * (where the text of a growing proposal will start while it has none), or after its anchor's
 * quote. A lane has as many as it is given, each under its own `id`. They follow layout: the
 * review's decorations (`tick`), scroll, resize. The cursor of a growing proposal moves to its
 * new place over `--gt-lane-cursor-move` when the text moved it, and at once on a scroll. Each
 * says on which side its flag stands (`data-chip-side`): before it when the flag would cross the
 * page's end edge, for a theme to place it there.
 */
export function LaneCursors({
  editor,
  session,
  root,
  cursors,
  lanes,
  proposals,
  tick,
  look = "caret",
  pointer,
}: {
  editor: GoTipeEditor;
  session: MarkdownSession;
  root: HTMLElement | null;
  cursors: LaneCursor[] | undefined;
  lanes: Map<string, ReviewLane>;
  /** Where each proposal stands (the review's states). */
  proposals: ProposalState[];
  /** Changes when the review's decorations were drawn again. */
  tick: number;
  look?: ReviewLaneCursor;
  /** The host's own arrow for `look: "pointer"` instead of the built-in one. */
  pointer?: React.ReactNode;
}) {
  const [placed, setPlaced] = useState<Placed[]>([]);
  const nodes = useRef(new Map<string, HTMLElement>());
  const sides = useRef(new Map<string, ChipState>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick re-places after decorations change
  useLayoutEffect(() => {
    if (!root) return;
    const place = (scrolled: boolean) => {
      const out: Placed[] = [];
      const keys = new Set<string>();
      // the ends of the growing texts, found in one pass when a cursor first asks
      let ends: Map<string, DOMRect> | null = null;
      for (const cursor of cursors ?? []) {
        const lane = lanes.get(cursor.laneId);
        if (!lane) continue;
        const state = cursor.proposalId
          ? proposals.find((proposal) => proposal.id === cursor.proposalId)
          : undefined;
        const live = state?.status === "live";
        let rect: DOMRect | null = null;
        if (live && cursor.proposalId && !state.reason) {
          ends ??= liveEndRects(root);
          // no text yet: where its text will start
          rect =
            ends.get(cursor.proposalId) ??
            (state.insertEnd
              ? rectAt(root, state.insertEnd.blockId, state.insertEnd.offset)
              : null);
        } else if (cursor.proposalId) rect = proposalEndRect(root, cursor.proposalId);
        if (!rect && cursor.anchor) {
          const page = session.serialize(editor);
          const m = findAnchor(page.text, cursor.anchor);
          if (m.ok) {
            const pos = mapOffsetToText(page.map, m.end, "before");
            if (pos) rect = rectAt(root, pos.blockId, pos.offset);
          }
        }
        if (!rect) continue;
        // two cursors under one key: the later one takes a key of its own
        let key = cursor.id ?? lane.id;
        for (let n = 2; keys.has(key); n++) key = `${cursor.id ?? lane.id}#${n}`;
        keys.add(key);
        out.push({
          key,
          name: cursor.name ?? lane.name,
          label: cursor.label,
          color: lane.color ?? "var(--gt-track-1)",
          compact: cursor.compact === true,
          glide: live && !scrolled,
          side: sides.current.get(key)?.side ?? "end",
          top: rect.top,
          left: rect.left,
          height: rect.height || 20,
        });
      }
      setPlaced((previous) => (samePlaced(previous, out) ? previous : out));
    };
    place(false);
    const onScroll = () => place(true);
    const onResize = () => place(false);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    const observer = new ResizeObserver(onResize);
    observer.observe(root);
    const content = root.querySelector("[data-gotipe-content]");
    if (content) observer.observe(content);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [root, editor, session, cursors, lanes, proposals, tick]);

  // Once drawn, each flag is measured against the page's edges and takes its side. It is
  // measured from its cursor's place, not from where a glide has it at the moment.
  useLayoutEffect(() => {
    if (!root) return;
    const box = root.getBoundingClientRect();
    const page = { left: Math.max(0, box.left), right: Math.min(window.innerWidth, box.right) };
    const next = new Map<string, ChipState>();
    for (const cursor of placed) {
      const chip = nodes.current.get(cursor.key)?.querySelector<HTMLElement>(".gotipe-lane-chip");
      const known = sides.current.get(cursor.key);
      if (!chip) {
        next.set(cursor.key, known ?? { side: "end", offset: null });
        continue;
      }
      const left = cursor.left + chip.offsetLeft;
      const width = chip.offsetWidth;
      next.set(
        cursor.key,
        chipSide(known, cursor.left, { left, right: left + width, width }, page),
      );
    }
    sides.current = next;
    if (placed.some((cursor) => next.get(cursor.key)?.side !== cursor.side))
      setPlaced(placed.map((cursor) => ({ ...cursor, side: next.get(cursor.key)!.side })));
  }, [placed, root]);

  const arrow = look === "pointer";
  return (
    <>
      {placed.map((c) => (
        <div
          key={c.key}
          ref={(node) => {
            if (node) nodes.current.set(c.key, node);
            else nodes.current.delete(c.key);
          }}
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
          data-compact={c.compact ? "" : undefined}
          data-glide={c.glide ? "" : undefined}
          data-chip-side={c.side}
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
