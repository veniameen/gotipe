import { type Decoration, type GoTipeEditor, GoTipeError, createTextWalker } from "@gotipe/core";
import { useGoTipeI18n } from "@gotipe/react";
import {
  type CommentState,
  type LaneCursor,
  type ProposalState,
  type ReviewComment,
  type ReviewLane,
  type ReviewProposal,
  computeReviewDecorations,
  findAnchor,
  mapOffsetToText,
  proposalsInDocumentOrder,
  revealDecorations,
} from "@gotipe/suggestions";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PageIcon, type PageIconName } from "../page/icons";
import type { MarkdownSession } from "../page/markdown-session";
import { usePageOverlay } from "../page/overlay";

export type ReviewResult = boolean | undefined;
export type ReviewAction = (id: string) => Promise<ReviewResult> | ReviewResult;

/** Review data and callbacks (ADR-0047). Everything is controlled by the host. */
export interface PageReviewProps {
  lanes: ReviewLane[];
  proposals: ReviewProposal[];
  comments?: ReviewComment[];
  cursors?: LaneCursor[];
  /** Accept one proposal. Return `false` when it failed (stops «Принять все»). */
  onAccept?: ReviewAction;
  onReject?: ReviewAction;
  /** Default: `onAccept` one by one in document order, stopping at the first stale or failed one. */
  onAcceptAll?: () => Promise<void> | void;
  /** Default: `onReject` for every proposal. */
  onRejectAll?: () => Promise<void> | void;
  onReply?: (commentId: string, text: string) => Promise<ReviewResult> | ReviewResult;
  /** Binding results: which proposals are stale, where they are. */
  onStatesChange?: (states: { proposals: ProposalState[]; comments: CommentState[] }) => void;
}

const LANE_ICON: Record<ReviewLane["kind"], PageIconName> = {
  agent: "agent",
  skill: "skill",
  tool: "tool",
  user: "user",
};

const LAYER = "review";
const MAX_REVEAL_MS = 1500;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/** Client rect of a document position (blockId, offset). */
function rectAt(root: HTMLElement, blockId: string, offset: number): DOMRect | null {
  const blockEl = root.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
  if (!blockEl) return null;
  const host =
    blockEl.querySelector("[data-gotipe-todo-content]") ??
    blockEl.querySelector(".gotipe-callout-content") ??
    blockEl;
  const walker = createTextWalker(host);
  let acc = 0;
  let node: Node | null;
  let last: Text | null = null;
  for (node = walker.nextNode(); node; node = walker.nextNode()) {
    const owner = node.parentElement?.closest("[data-block-id]");
    if (owner && owner !== blockEl) continue;
    const text = node as Text;
    last = text;
    const len = text.length;
    if (acc + len >= offset) {
      const range = document.createRange();
      const at = Math.max(0, offset - acc);
      range.setStart(text, at);
      range.setEnd(text, at);
      const rects = range.getClientRects();
      if (rects.length > 0) return rects[rects.length - 1]!;
      if (at > 0) {
        range.setStart(text, at - 1);
        const r = range.getBoundingClientRect();
        return new DOMRect(r.right, r.top, 0, r.height);
      }
      return range.getBoundingClientRect();
    }
    acc += len;
  }
  if (last) {
    const range = document.createRange();
    range.selectNodeContents(last);
    const r = range.getBoundingClientRect();
    return new DOMRect(r.right, r.top, 0, r.height);
  }
  const r = (host as Element).getBoundingClientRect();
  return new DOMRect(r.left, r.top, 0, Math.min(r.height, 22));
}

/** End of the last piece of a proposal's new text in the DOM. */
function proposalEndRect(root: HTMLElement, proposalId: string): DOMRect | null {
  const nodes = root.querySelectorAll(
    `[data-gotipe-proposal="${CSS.escape(proposalId)}"].gotipe-sug-ins, [data-gotipe-proposal="${CSS.escape(proposalId)}"].gotipe-sug-block-ins`,
  );
  const el = nodes[nodes.length - 1];
  if (!el) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = range.getClientRects();
  const r = rects.length > 0 ? rects[rects.length - 1]! : el.getBoundingClientRect();
  return new DOMRect(r.right, r.top, 0, r.height || 20);
}

function decorationRect(root: HTMLElement, attr: string, id: string): DOMRect | null {
  const el = root.querySelector(`[${attr}="${CSS.escape(id)}"]`);
  return el ? el.getBoundingClientRect() : null;
}

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

/** Imperative review actions of a mounted page editor. */
export interface ReviewApi {
  accept(id: string): Promise<boolean>;
  reject(id: string): Promise<boolean>;
  /** One by one in document order; stops at the first stale or failed proposal. */
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
  onLocalAccept,
  apiRef,
  onStates,
}: {
  editor: GoTipeEditor;
  session: MarkdownSession;
  root: HTMLElement | null;
  review: PageReviewProps;
  /** Applies a proposal to the document when the host has no `onAccept`. */
  onLocalAccept: (proposal: ReviewProposal) => boolean;
  apiRef?: React.MutableRefObject<ReviewApi | null>;
  onStates?: (states: { proposals: ProposalState[]; comments: CommentState[] }) => void;
}) {
  const i18n = useGoTipeI18n();
  const overlay = usePageOverlay();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [states, setStates] = useState<{ proposals: ProposalState[]; comments: CommentState[] }>({
    proposals: [],
    comments: [],
  });
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const fullRef = useRef<Decoration[]>([]);
  const seenRef = useRef<Set<string> | null>(null);
  const revealRef = useRef(new Map<string, { start: number; total: number; duration: number }>());
  const frameRef = useRef<number | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);

  const lanes = useMemo(() => new Map(review.lanes.map((l) => [l.id, l] as const)), [review.lanes]);
  const proposals = review.proposals;
  const comments = review.comments ?? [];

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
    setLayoutTick((n) => n + 1);
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
      lanes: review.lanes,
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
  }, [editor, session, proposals, comments, review.lanes, activeId, applyDecorations]);

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

  const onStatesChange = review.onStatesChange;
  useEffect(() => {
    onStatesChange?.(states);
    onStates?.(states);
  }, [states, onStatesChange, onStates]);

  // Cursors and the open card follow layout: decorations, scroll, resize.
  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutTick re-places after decorations change
  useLayoutEffect(() => {
    if (!root) return;
    const place = () => {
      const page = session.serialize(editor);
      const out: Placed[] = [];
      for (const cursor of review.cursors ?? []) {
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
      if (activeId) {
        const rect =
          decorationRect(root, "data-gotipe-proposal", activeId) ??
          decorationRect(root, "data-gotipe-comment", activeId);
        if (rect) {
          // Beside the text when there is room (v6 к. 6), otherwise below it.
          const width = 288;
          const doc = root.querySelector("[data-gotipe-content]")?.getBoundingClientRect();
          const besideLeft = (doc ? doc.right : rect.right) + 16;
          if (besideLeft + width + 8 <= window.innerWidth) {
            setCardPos({
              top: Math.max(8, Math.min(rect.top - 10, window.innerHeight - 200)),
              left: besideLeft,
            });
          } else {
            const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
            const below = rect.bottom + 8;
            setCardPos({
              top: below + 180 > window.innerHeight ? Math.max(8, rect.top - 188) : below,
              left,
            });
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
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [root, editor, session, review.cursors, lanes, activeId, layoutTick]);

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
      if (e.key === "Escape") setActiveId(null);
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
      if (!proposal) return false;
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
      try {
        return (await review.onReject?.(id)) !== false;
      } catch (e) {
        report(e, "PROPOSAL_ACTION_FAILED");
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
        for (const p of proposals) if (await reject(p.id)) n += 1;
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
  const activeState = activeProposal
    ? states.proposals.find((s) => s.id === activeProposal.id)
    : undefined;

  if (!overlay) return null;

  return createPortal(
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
          aria-hidden="true"
        >
          <span className="gotipe-lane-caret" />
          <span className="gotipe-lane-chip">
            <span className="gotipe-lane-chip-name">{c.name}</span>
            {c.label ? <span className="gotipe-lane-chip-label">{c.label}</span> : null}
          </span>
        </div>
      ))}
      {cardPos && activeProposal ? (
        <ProposalCard
          proposal={activeProposal}
          state={activeState}
          lane={lanes.get(activeProposal.laneId)}
          busy={busy}
          top={cardPos.top}
          left={cardPos.left}
          onAccept={() =>
            void run(async () => {
              if (await accept(activeProposal.id)) setActiveId(null);
            })
          }
          onReject={() =>
            void run(async () => {
              if (await reject(activeProposal.id)) setActiveId(null);
            })
          }
          labels={{
            accept: i18n.t("review.accept"),
            reject: i18n.t("review.reject"),
            stale: i18n.t("review.stale"),
            staleText: i18n.t("review.staleText"),
            before: i18n.t("review.before"),
            after: i18n.t("review.after"),
            region: i18n.t("review.suggestion"),
          }}
        />
      ) : null}
      {cardPos && activeComment ? (
        <CommentCard
          comment={activeComment}
          lane={lanes.get(activeComment.laneId)}
          top={cardPos.top}
          left={cardPos.left}
          onReply={async (text) => {
            try {
              return (await review.onReply?.(activeComment.id, text)) !== false;
            } catch (e) {
              report(e, "COMMENT_ACTION_FAILED");
              return false;
            }
          }}
          labels={{
            reply: i18n.t("review.reply"),
            send: i18n.t("review.send"),
            waiting: i18n.t("review.waitingReply"),
            region: i18n.t("review.comment"),
            you: i18n.t("review.you"),
          }}
        />
      ) : null}
    </>,
    overlay,
  );
}

function LaneAvatar({ lane }: { lane: ReviewLane | undefined }) {
  return (
    <span
      className="gotipe-review-avatar"
      style={{ "--gt-track": lane?.color ?? "var(--gt-track-1)" } as React.CSSProperties}
      aria-hidden="true"
    >
      <PageIcon name={lane ? LANE_ICON[lane.kind] : "agent"} />
    </span>
  );
}

function ProposalCard({
  proposal,
  state,
  lane,
  busy,
  top,
  left,
  onAccept,
  onReject,
  labels,
}: {
  proposal: ReviewProposal;
  state: ProposalState | undefined;
  lane: ReviewLane | undefined;
  busy: boolean;
  top: number;
  left: number;
  onAccept: () => void;
  onReject: () => void;
  labels: {
    accept: string;
    reject: string;
    stale: string;
    staleText: string;
    before: string;
    after: string;
    region: string;
  };
}) {
  const stale = state?.status === "stale";
  const edit = proposal.edits[0];
  // Было/стало only when whole blocks are rewritten (a pure insertion is visible in place).
  const showDiff = !stale && state && !state.exact && edit && edit.quote.trim().length > 0;
  return (
    <div
      className="gotipe-review-card"
      role="dialog"
      aria-label={labels.region}
      style={
        {
          position: "fixed",
          top,
          left,
          "--gt-track": lane?.color ?? "var(--gt-track-1)",
        } as React.CSSProperties
      }
      data-gotipe-review-card="proposal"
    >
      <div className="gotipe-review-card-head">
        <LaneAvatar lane={lane} />
        <b>{lane?.name ?? proposal.laneId}</b>
        {stale ? <span>{labels.stale}</span> : null}
      </div>
      {stale ? (
        <div className="gotipe-review-card-text">{labels.staleText}</div>
      ) : proposal.reason ? (
        <div className="gotipe-review-card-text">{proposal.reason}</div>
      ) : null}
      {showDiff ? (
        <div className="gotipe-review-card-diff">
          {edit.quote ? (
            <div className="gotipe-review-card-was">
              <span>{labels.before}</span>
              <s>{edit.quote.trim()}</s>
            </div>
          ) : null}
          {edit.text ? (
            <div className="gotipe-review-card-now">
              <span>{labels.after}</span>
              <ins>{edit.text.trim()}</ins>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="gotipe-review-card-actions">
        <button
          type="button"
          className="gotipe-btn gotipe-btn-secondary"
          disabled={busy}
          onClick={onReject}
        >
          {labels.reject}
        </button>
        {stale ? null : (
          <button
            type="button"
            className="gotipe-btn gotipe-btn-primary"
            disabled={busy}
            onClick={onAccept}
          >
            {labels.accept}
          </button>
        )}
      </div>
    </div>
  );
}

function CommentCard({
  comment,
  lane,
  top,
  left,
  onReply,
  labels,
}: {
  comment: ReviewComment;
  lane: ReviewLane | undefined;
  top: number;
  left: number;
  onReply: (text: string) => Promise<boolean>;
  labels: { reply: string; send: string; waiting: string; region: string; you: string };
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const replies = comment.replies ?? [];
  const submit = async () => {
    const text = draft.trim();
    if (!text || pending) return;
    setPending(true);
    const ok = await onReply(text);
    setPending(false);
    if (ok) setDraft("");
    else setFailed(true);
  };
  return (
    <div
      className="gotipe-review-card"
      role="dialog"
      aria-label={labels.region}
      style={
        {
          position: "fixed",
          top,
          left,
          "--gt-track": lane?.color ?? "var(--gt-track-3)",
        } as React.CSSProperties
      }
      data-gotipe-review-card="comment"
    >
      <div className="gotipe-review-card-head">
        <LaneAvatar lane={lane} />
        <b>{lane?.name ?? comment.laneId}</b>
        {comment.question && replies.length === 0 ? <span>{labels.waiting}</span> : null}
      </div>
      <div className="gotipe-review-card-text">{comment.text}</div>
      {replies.map((r) => (
        <div key={r.id} className="gotipe-review-card-reply">
          <b>{r.author || labels.you}</b> {r.text}
        </div>
      ))}
      <form
        className="gotipe-review-card-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          value={draft}
          placeholder={labels.reply}
          aria-label={labels.reply}
          aria-invalid={failed || undefined}
          disabled={pending}
          onChange={(e) => {
            setDraft(e.target.value);
            setFailed(false);
          }}
        />
        <button
          type="submit"
          className="gotipe-page-icon-btn"
          aria-label={labels.send}
          disabled={pending || !draft.trim()}
        >
          <PageIcon name="send" />
        </button>
      </form>
    </div>
  );
}

/** Accepts proposals one by one in document order; stops at the first stale or failed one. */
export async function acceptAllInOrder(
  editor: GoTipeEditor,
  states: ProposalState[],
  accept: (id: string) => Promise<boolean>,
): Promise<number> {
  let accepted = 0;
  for (const state of proposalsInDocumentOrder(editor.getViewState().blocks, states)) {
    if (state.status === "stale") break;
    if (!(await accept(state.id))) break;
    accepted += 1;
  }
  return accepted;
}
