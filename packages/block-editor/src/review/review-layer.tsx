import { type GoTipeEditor, GoTipeError } from "@gotipe/core";
import {
  type CommentState,
  type LaneCursor,
  type ProposalState,
  type ReviewComment,
  type ReviewLane,
  type ReviewProposal,
  proposalsInDocumentOrder,
} from "@gotipe/suggestions";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBlockEditorI18n } from "../i18n/strings";
import { isHostKey } from "../page/host-slot";
import type { MarkdownSession } from "../page/markdown-session";
import { usePageOverlay } from "../page/overlay";
import { decorationRect } from "./dom-position";
import { LaneCursors, type ReviewLaneCursor } from "./lane-cursors";
import { type CardPlace, CommentCard, ProposalCard } from "./review-cards";
import { ReviewMargin, useMarginLayout } from "./review-margin";
import { useReviewDecorations } from "./use-review-decorations";

export type { ReviewLaneCursor } from "./lane-cursors";

export type ReviewResult = boolean | undefined;
/**
 * Where review cards stand: `auto` — in a margin column when the page is wide enough, otherwise
 * one by the text; `inline` — always by the text; `margin` — always in the margin column.
 */
export type ReviewLayout = "auto" | "inline" | "margin";
/** Where the card by the text opens when it has no room beside it. */
export type ReviewCardPlacement = "below" | "above";
export type ReviewAction = (id: string) => Promise<ReviewResult> | ReviewResult;

/** Review data and callbacks (ADR-0047). Everything is controlled by the host. */
export interface PageReviewProps {
  lanes: ReviewLane[];
  /**
   * The proposals. One with `live` is still being written: give a new object with a longer
   * `edits[].text` under the same `id` as its text grows, and the same `id` without `live` when
   * it is written. Until then it takes no decision.
   */
  proposals: ReviewProposal[];
  comments?: ReviewComment[];
  /** Where lanes work now; several of one lane each under their own `id`. */
  cursors?: LaneCursor[];
  /** Accept one proposal. Return `false` when it failed (stops “Accept all”). */
  onAccept?: ReviewAction;
  onReject?: ReviewAction;
  /**
   * Default: `onAccept` one by one in document order, stopping at the first stale or failed one;
   * a growing proposal (`live`) is passed over.
   */
  onAcceptAll?: () => Promise<void> | void;
  /** Default: `onReject` for every proposal but the growing ones (`live`). */
  onRejectAll?: () => Promise<void> | void;
  onReply?: (commentId: string, text: string) => Promise<ReviewResult> | ReviewResult;
  /**
   * Delete a comment: with it the open comment card has a delete button. Ask for confirmation
   * here if needed; return `false` to keep the card. A throw is reported as
   * `COMMENT_ACTION_FAILED`. After success remove the comment from `comments`.
   */
  onDeleteComment?: ReviewAction;
  /** Binding results: which proposals are stale, where they are. */
  onStatesChange?: (states: { proposals: ProposalState[]; comments: CommentState[] }) => void;
}

/** One empty list for a review without comments: a new one each render would recompute forever. */
const NO_COMMENTS: ReviewComment[] = [];

/** Imperative review actions of a mounted page editor. */
export interface ReviewApi {
  /** Resolves to false, with nothing called, for a growing proposal (`live`): it takes no decision. */
  accept(id: string): Promise<boolean>;
  reject(id: string): Promise<boolean>;
  /**
   * One by one in document order; stops at the first stale or failed proposal. Growing
   * proposals (`live`) are passed over, in `rejectAll` too.
   */
  acceptAll(): Promise<number>;
  rejectAll(): Promise<number>;
  states(): { proposals: ProposalState[]; comments: CommentState[] };
  /** Opens the card of a proposal or comment (null closes it). */
  focus(id: string | null): void;
}

export function ReviewLayer({
  editor,
  session,
  root,
  review,
  layout = "auto",
  cardPlacement = "below",
  laneCursor = "caret",
  lanePointer,
  onLocalAccept,
  apiRef,
  onStates,
}: {
  editor: GoTipeEditor;
  session: MarkdownSession;
  root: HTMLElement | null;
  review: PageReviewProps;
  layout?: ReviewLayout;
  cardPlacement?: ReviewCardPlacement;
  laneCursor?: ReviewLaneCursor;
  /** The host's own arrow for `laneCursor: "pointer"` instead of the built-in one. */
  lanePointer?: React.ReactNode;
  /** Applies a proposal to the document when the host has no `onAccept`. */
  onLocalAccept: (proposal: ReviewProposal) => boolean;
  apiRef?: React.MutableRefObject<ReviewApi | null>;
  onStates?: (states: { proposals: ProposalState[]; comments: CommentState[] }) => void;
}) {
  const i18n = useBlockEditorI18n();
  const overlay = usePageOverlay();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cardPos, setCardPos] = useState<Exclude<CardPlace, "margin"> | null>(null);
  const [busy, setBusy] = useState(false);
  const lanes = useMemo(() => new Map(review.lanes.map((l) => [l.id, l] as const)), [review.lanes]);
  const proposals = review.proposals;
  const comments = review.comments ?? NO_COMMENTS;
  // Wide pages keep every card in a margin column (Atlas, frame 14); narrow ones open one by the text.
  const margin = useMarginLayout(root, proposals.length + comments.length > 0, layout);

  const { states, tick: layoutTick } = useReviewDecorations({
    editor,
    session,
    proposals,
    comments,
    lanes: review.lanes,
    activeId,
  });

  const onStatesChange = review.onStatesChange;
  useEffect(() => {
    onStatesChange?.(states);
    onStates?.(states);
  }, [states, onStatesChange, onStates]);

  // The open card follows layout: decorations, scroll, resize.
  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutTick re-places after decorations change
  useLayoutEffect(() => {
    if (!root) return;
    const place = () => {
      if (activeId && !margin) {
        const rect =
          decorationRect(root, "data-gotipe-proposal", activeId) ??
          decorationRect(root, "data-gotipe-comment", activeId);
        if (rect) {
          // Beside the text when there is room (v6 frame 6), otherwise below it.
          const width = 288;
          const doc = root.querySelector("[data-gotipe-content]")?.getBoundingClientRect();
          const besideLeft = (doc ? doc.right : rect.right) + 16;
          if (besideLeft + width + 8 <= window.innerWidth) {
            const top = Math.max(8, Math.min(rect.top - 10, window.innerHeight - 200));
            setCardPos({ top, bottom: top, left: besideLeft, side: "beside", gap: 0 });
          } else {
            // Below the row (above it when there is no room); `cardPlacement: "above"` the
            // reverse. The card measures its own height, so its gap holds for any card.
            const side = cardPlacement === "above" ? "above" : "below";
            const gap = cardGap(root);
            setCardPos({ top: rect.top, bottom: rect.bottom, left: rect.left, side, gap });
          }
        } else {
          setCardPos(null);
        }
      } else {
        setCardPos(null);
      }
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
  }, [root, activeId, layoutTick, margin, cardPlacement]);

  // Clicking a suggestion or a comment opens its card.
  useEffect(() => {
    if (!root) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (target.closest(".gotipe-review-card")) return;
      const hit = target.closest("[data-gotipe-proposal], [data-gotipe-comment]");
      const id =
        hit?.getAttribute("data-gotipe-proposal") ??
        hit?.getAttribute("data-gotipe-comment") ??
        null;
      setActiveId(id && root.contains(hit) ? id : null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isHostKey(e)) setActiveId(null);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [root]);

  const report = useCallback(
    (e: unknown, code: "PROPOSAL_ACTION_FAILED" | "COMMENT_ACTION_FAILED") => {
      editor.reportError(
        e instanceof GoTipeError
          ? e
          : new GoTipeError(code, e instanceof Error ? e.message : String(e)),
      );
    },
    [editor],
  );

  const accept = useCallback(
    async (id: string): Promise<boolean> => {
      const proposal = proposals.find((p) => p.id === id);
      const state = states.proposals.find((p) => p.id === id);
      if (!proposal || proposal.live) return false;
      if (state?.status === "stale") {
        editor.reportError(
          new GoTipeError("PROPOSAL_STALE", "The text around the suggestion changed", {
            proposalId: id,
          }),
        );
        return false;
      }
      try {
        if (review.onAccept) return (await review.onAccept(id)) !== false;
        return onLocalAccept(proposal);
      } catch (e) {
        report(e, "PROPOSAL_ACTION_FAILED");
        return false;
      }
    },
    [proposals, states, review, onLocalAccept, editor, report],
  );

  const reject = useCallback(
    async (id: string): Promise<boolean> => {
      if (proposals.find((p) => p.id === id)?.live) return false;
      try {
        return (await review.onReject?.(id)) !== false;
      } catch (e) {
        report(e, "PROPOSAL_ACTION_FAILED");
        return false;
      }
    },
    [proposals, review, report],
  );

  const removeComment = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        return (await review.onDeleteComment?.(id)) !== false;
      } catch (e) {
        report(e, "COMMENT_ACTION_FAILED");
        return false;
      }
    },
    [review, report],
  );

  const statesRef = useRef(states);
  statesRef.current = states;
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      accept,
      reject,
      acceptAll: async () => {
        if (review.onAcceptAll) {
          await review.onAcceptAll();
          return 0;
        }
        return acceptAllInOrder(editor, statesRef.current.proposals, accept);
      },
      rejectAll: async () => {
        if (review.onRejectAll) {
          await review.onRejectAll();
          return 0;
        }
        let n = 0;
        for (const p of proposals) if (!p.live && (await reject(p.id))) n += 1;
        return n;
      },
      states: () => statesRef.current,
      focus: (id) => setActiveId(id),
    };
    return () => {
      if (apiRef.current) apiRef.current = null;
    };
  }, [apiRef, accept, reject, review, editor, proposals]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const activeProposal = activeId ? proposals.find((p) => p.id === activeId) : undefined;
  const activeComment = activeId ? comments.find((c) => c.id === activeId) : undefined;

  const proposalLabels = {
    accept: i18n.t("review.accept"),
    reject: i18n.t("review.reject"),
    stale: i18n.t("review.stale"),
    staleText: i18n.t("review.staleText"),
    before: i18n.t("review.before"),
    after: i18n.t("review.after"),
    region: i18n.t("review.suggestion"),
  };
  const commentLabels = {
    reply: i18n.t("review.reply"),
    send: i18n.t("review.send"),
    waiting: i18n.t("review.waitingReply"),
    region: i18n.t("review.comment"),
    you: i18n.t("review.you"),
    delete: i18n.t("review.deleteComment"),
  };
  const proposalCard = (proposal: ReviewProposal, place: CardPlace, compact = false) => (
    <ProposalCard
      key={proposal.id}
      proposal={proposal}
      state={states.proposals.find((s) => s.id === proposal.id)}
      lane={lanes.get(proposal.laneId)}
      busy={busy}
      place={place}
      compact={compact}
      onAccept={() =>
        void run(async () => {
          if (await accept(proposal.id)) setActiveId(null);
        })
      }
      onReject={() =>
        void run(async () => {
          if (await reject(proposal.id)) setActiveId(null);
        })
      }
      labels={proposalLabels}
    />
  );
  const commentCard = (comment: ReviewComment, place: CardPlace, compact = false) => (
    <CommentCard
      key={comment.id}
      comment={comment}
      lane={lanes.get(comment.laneId)}
      place={place}
      compact={compact}
      onReply={async (text) => {
        try {
          return (await review.onReply?.(comment.id, text)) !== false;
        } catch (e) {
          report(e, "COMMENT_ACTION_FAILED");
          return false;
        }
      }}
      onDelete={
        review.onDeleteComment
          ? async () => {
              const ok = await removeComment(comment.id);
              if (ok) setActiveId((id) => (id === comment.id ? null : id));
              return ok;
            }
          : undefined
      }
      labels={commentLabels}
    />
  );

  if (!overlay) return null;

  return createPortal(
    <>
      <LaneCursors
        editor={editor}
        session={session}
        root={root}
        cursors={review.cursors}
        lanes={lanes}
        proposals={states.proposals}
        tick={layoutTick}
        look={laneCursor}
        pointer={lanePointer}
      />
      {margin && root ? (
        <ReviewMargin
          root={root}
          column={overlay}
          activeId={activeId}
          onActivate={setActiveId}
          tick={layoutTick}
          items={[
            ...proposals.map((proposal) => ({
              id: proposal.id,
              kind: "proposal" as const,
              render: (compact: boolean) => proposalCard(proposal, "margin", compact),
            })),
            ...comments.map((comment) => ({
              id: comment.id,
              kind: "comment" as const,
              render: (compact: boolean) => commentCard(comment, "margin", compact),
            })),
          ]}
        />
      ) : null}
      {!margin && cardPos && activeProposal ? proposalCard(activeProposal, cardPos) : null}
      {!margin && cardPos && activeComment ? commentCard(activeComment, cardPos) : null}
    </>,
    overlay,
  );
}

/** `--gt-review-card-gap` on the page (a length in px; 8 when unset or not in px). */
function cardGap(root: HTMLElement): number {
  const value = getComputedStyle(root).getPropertyValue("--gt-review-card-gap").trim();
  const px = /^(-?\d*\.?\d+)px$/.exec(value);
  return px ? Number(px[1]) : 8;
}

/**
 * Accepts proposals one by one in document order; stops at the first stale or failed one. A
 * growing proposal (`live`) is passed over: it takes no decision yet.
 */
export async function acceptAllInOrder(
  editor: GoTipeEditor,
  states: ProposalState[],
  accept: (id: string) => Promise<boolean>,
): Promise<number> {
  let accepted = 0;
  for (const state of proposalsInDocumentOrder(editor.getViewState().blocks, states)) {
    if (state.live) continue;
    if (state.status === "stale") break;
    if (!(await accept(state.id))) break;
    accepted += 1;
  }
  return accepted;
}
