import { useFloatingPosition } from "@gotipe/react";
import type { ProposalState, ReviewComment, ReviewLane, ReviewProposal } from "@gotipe/suggestions";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { PageIcon, type PageIconName } from "../page/icons";
type TrackStyle = React.CSSProperties & { "--gt-track": string };
function trackStyle(color: string, style: React.CSSProperties = {}): TrackStyle {
  return { ...style, "--gt-track": color };
}

/**
 * Where a card stands: floating by a row of text (`below` it, `above` it or `beside` the page,
 * each measured with the card's own size), or in the margin column (frame 14).
 */
export type CardPlace =
  | {
      top: number;
      bottom: number;
      left: number;
      side: "below" | "above" | "beside";
      /** Space to the row (`--gt-review-card-gap`), unused beside the page. */
      gap: number;
    }
  | "margin";

const PLACEMENT = { below: "bottom-start", above: "top-start", beside: "bottom-start" } as const;

function useCardPosition(place: CardPlace) {
  const ref = useRef<HTMLDivElement>(null);
  const floating = place !== "margin";
  const top = floating ? place.top : 0;
  const bottom = floating ? place.bottom : 0;
  const left = floating ? place.left : 0;
  const side = floating ? place.side : "beside";
  const rowGap = floating ? place.gap : 0;
  // beside the page the card starts at the given point; by a row it keeps its gap to the text
  const anchor = useCallback(
    () => ({ top, bottom, left, right: left, width: 0, height: bottom - top }),
    [top, bottom, left],
  );
  const position = useFloatingPosition({
    open: floating,
    anchor,
    element: ref,
    placement: PLACEMENT[side],
    gap: side === "beside" ? 0 : rowGap,
  });
  const style: React.CSSProperties = floating
    ? { position: "fixed", ...(position ?? { visibility: "hidden" }) }
    : {};
  return { ref, style };
}

export const LANE_ICON: Record<ReviewLane["kind"], PageIconName> = {
  agent: "sparkle",
  skill: "skill",
  tool: "tool",
  user: "user",
};

function LaneAvatar({ lane }: { lane: ReviewLane | undefined }) {
  return (
    <span
      className="gotipe-review-avatar"
      style={trackStyle(lane?.color ?? "var(--gt-track-1)")}
      aria-hidden="true"
    >
      <PageIcon name={lane ? LANE_ICON[lane.kind] : "sparkle"} />
    </span>
  );
}

export function ProposalCard({
  proposal,
  state,
  lane,
  busy,
  place,
  compact = false,
  onAccept,
  onReject,
  labels,
}: {
  proposal: ReviewProposal;
  state: ProposalState | undefined;
  lane: ReviewLane | undefined;
  busy: boolean;
  place: CardPlace;
  /** In the margin, a card that is not open shows only who and why. */
  compact?: boolean;
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
  const position = useCardPosition(place);
  const stale = state?.status === "stale";
  const edit = proposal.edits[0];
  // Before/after only when whole blocks are rewritten (a pure insertion is visible in place).
  const showDiff = !stale && state && !state.exact && edit && edit.quote.trim().length > 0;
  return (
    <div
      ref={position.ref}
      className={`gotipe-review-card${compact ? " is-compact" : ""}`}
      role={compact ? "group" : "dialog"}
      aria-label={labels.region}
      style={trackStyle(lane?.color ?? "var(--gt-track-1)", position.style)}
      {...(compact
        ? { "data-gotipe-review-summary": "proposal" }
        : { "data-gotipe-review-card": "proposal" })}
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
      {showDiff && !compact ? (
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
      {compact ? null : (
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
      )}
    </div>
  );
}

export function CommentCard({
  comment,
  lane,
  place,
  compact = false,
  onReply,
  onDelete,
  labels,
}: {
  comment: ReviewComment;
  lane: ReviewLane | undefined;
  place: CardPlace;
  /** In the margin, a card that is not open shows only who and what. */
  compact?: boolean;
  onReply: (text: string) => Promise<boolean>;
  /** Deletes the comment; without it the card has no delete button. */
  onDelete?: () => Promise<boolean>;
  labels: {
    reply: string;
    send: string;
    waiting: string;
    region: string;
    you: string;
    delete: string;
  };
}) {
  const position = useCardPosition(place);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const replies = comment.replies ?? [];
  const remove = async () => {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      // the host drops a deleted comment from `comments`; a refused one keeps its card
      setDeleting(false);
    }
  };
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
      ref={position.ref}
      className={`gotipe-review-card${compact ? " is-compact" : ""}`}
      role={compact ? "group" : "dialog"}
      aria-label={labels.region}
      style={trackStyle(lane?.color ?? "var(--gt-track-3)", position.style)}
      {...(compact
        ? { "data-gotipe-review-summary": "comment" }
        : { "data-gotipe-review-card": "comment" })}
    >
      <div className="gotipe-review-card-head">
        <LaneAvatar lane={lane} />
        <b>{lane?.name ?? comment.laneId}</b>
        {comment.question && replies.length === 0 ? <span>{labels.waiting}</span> : null}
        {onDelete && !compact ? (
          <button
            type="button"
            className="gotipe-review-icon-btn gotipe-review-card-delete"
            aria-label={labels.delete}
            title={labels.delete}
            disabled={deleting}
            onClick={() => void remove()}
          >
            <PageIcon name="trash" />
          </button>
        ) : null}
      </div>
      <div className="gotipe-review-card-text">{comment.text}</div>
      {(compact ? [] : replies).map((r) => (
        <div key={r.id} className="gotipe-review-card-reply">
          <b>{r.author || labels.you}</b> {r.text}
        </div>
      ))}
      {compact ? null : (
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
            className="gotipe-review-icon-btn"
            aria-label={labels.send}
            disabled={pending || !draft.trim()}
          >
            <PageIcon name="send" />
          </button>
        </form>
      )}
    </div>
  );
}
