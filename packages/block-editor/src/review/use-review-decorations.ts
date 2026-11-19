import type { Decoration, GoTipeEditor } from "@gotipe/core";
import {
  type CommentState,
  type ProposalState,
  type ReviewComment,
  type ReviewLane,
  type ReviewProposal,
  computeReviewDecorations,
  revealDecorations,
} from "@gotipe/suggestions";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MarkdownSession } from "../page/markdown-session";

const LAYER = "review";
const MAX_REVEAL_MS = 1500;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Where every proposal and comment of a review stands in the document. */
export interface ReviewStates {
  proposals: ProposalState[];
  comments: CommentState[];
}

/**
 * Binds a review's proposals and comments to the editor's document and draws them as the
 * editor's `review` decoration layer: again on every document change (once a frame) and on new
 * data. A new proposal reveals its text. `tick` changes whenever the layer was drawn, for what
 * is placed by it.
 */
export function useReviewDecorations({
  editor,
  session,
  proposals,
  comments,
  lanes,
  activeId,
}: {
  editor: GoTipeEditor;
  session: MarkdownSession;
  proposals: ReviewProposal[];
  comments: ReviewComment[];
  lanes: ReviewLane[];
  activeId: string | null;
}): { states: ReviewStates; tick: number } {
  const [states, setStates] = useState<ReviewStates>({ proposals: [], comments: [] });
  const fullRef = useRef<Decoration[]>([]);
  const seenRef = useRef<Set<string> | null>(null);
  const revealRef = useRef(new Map<string, { start: number; total: number; duration: number }>());
  const frameRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  const applyDecorations = useCallback(() => {
    let decorations = fullRef.current;
    const now = performance.now();
    for (const [id, r] of revealRef.current) {
      const t = Math.min(1, (now - r.start) / r.duration);
      if (t >= 1) {
        revealRef.current.delete(id);
        continue;
      }
      decorations = revealDecorations(decorations, id, Math.ceil(r.total * t));
    }
    editor.setDecorations(LAYER, decorations);
    setTick((n) => n + 1);
    if (revealRef.current.size > 0) {
      frameRef.current = requestAnimationFrame(applyDecorations);
    } else {
      frameRef.current = null;
    }
  }, [editor]);

  const recompute = useCallback(() => {
    const page = session.serialize(editor);
    const out = computeReviewDecorations({
      blocks: editor.getViewState().blocks,
      text: page.text,
      map: page.map,
      parse: (fragment) => session.parseFragment(fragment),
      proposals,
      comments,
      lanes,
      activeId,
    });
    fullRef.current = out.decorations;
    // New proposals reveal their text (unless motion is reduced).
    if (seenRef.current === null) {
      seenRef.current = new Set(proposals.map((p) => p.id));
    } else {
      const reduced = prefersReducedMotion();
      for (const state of out.proposals) {
        if (seenRef.current.has(state.id)) continue;
        seenRef.current.add(state.id);
        if (!reduced && state.status === "pending" && state.insertedChars > 0) {
          revealRef.current.set(state.id, {
            start: performance.now(),
            total: state.insertedChars,
            duration: Math.min(MAX_REVEAL_MS, Math.max(250, state.insertedChars * 18)),
          });
        }
      }
    }
    setStates({ proposals: out.proposals, comments: out.comments });
    if (frameRef.current === null) applyDecorations();
  }, [editor, session, proposals, comments, lanes, activeId, applyDecorations]);

  // Recompute on every document change (throttled to a frame) and on new data.
  useEffect(() => {
    let scheduled: number | null = null;
    const schedule = () => {
      if (scheduled !== null) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = null;
        recompute();
      });
    };
    recompute();
    const off = editor.on("update", schedule);
    return () => {
      off();
      if (scheduled !== null) cancelAnimationFrame(scheduled);
    };
  }, [editor, recompute]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      editor.setDecorations(LAYER, []);
    },
    [editor],
  );

  return { states, tick };
}
