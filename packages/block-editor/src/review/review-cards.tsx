import { useFloatingPosition } from "@gotipe/react";
import type { ProposalState, ReviewComment, ReviewLane, ReviewProposal } from "@gotipe/suggestions";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { PageIcon, type PageIconName } from "../page/icons";
type TrackStyle = React.CSSProperties & { "--gt-track": string };
function trackStyle(color: string, style: React.CSSProperties = {}): TrackStyle {
  return { ...style, "--gt-track": color };
}

function useCardPosition(top: number, left: number) {
  const ref = useRef<HTMLDivElement>(null);
  const anchor = useCallback(
    () => ({ top, bottom: top, left, right: left, width: 0, height: 0 }),
    [top, left],
  );
  const position = useFloatingPosition({ open: true, anchor, element: ref, gap: 0 });
  return { ref, style: position ?? { visibility: "hidden" as const } };
}

export const LANE_ICON: Record<ReviewLane["kind"], PageIconName> = {
  agent: "agent",
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
      <PageIcon name={lane ? LANE_ICON[lane.kind] : "agent"} />
    </span>
  );
}

export function ProposalCard({
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
  const position = useCardPosition(top, left);
  const stale = state?.status === "stale";
  const edit = proposal.edits[0];
  // Было/стало only when whole blocks are rewritten (a pure insertion is visible in place).
  const showDiff = !stale && state && !state.exact && edit && edit.quote.trim().length > 0;
  return (
    <div
      ref={position.ref}
      className="gotipe-review-card"
      role="dialog"
      aria-label={labels.region}
      style={trackStyle(lane?.color ?? "var(--gt-track-1)", {
        position: "fixed",
        ...position.style,
      })}
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

export function CommentCard({
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
  const position = useCardPosition(top, left);
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
      ref={position.ref}
      className="gotipe-review-card"
      role="dialog"
      aria-label={labels.region}
      style={trackStyle(lane?.color ?? "var(--gt-track-3)", {
        position: "fixed",
        ...position.style,
      })}
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
