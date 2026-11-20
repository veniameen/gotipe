import type { LaneCursor, ProposalState, ReviewLane } from "@gotipe/suggestions";
import type React from "react";
import { useState } from "react";
import { useBlockEditorI18n } from "../i18n/strings";
import { PageIcon, type PageIconName } from "../page/icons";

const LANE_ICON: Record<ReviewLane["kind"], PageIconName> = {
  agent: "sparkle",
  skill: "skill",
  tool: "tool",
  user: "user",
};

/**
 * Who is on the page: one round avatar per lane in its colour; a lane with a
 * cursor is busy (a spinning ring). v6 `.wkl-avs`.
 */
export function LaneAvatars({
  lanes,
  cursors = [],
}: { lanes: ReviewLane[]; cursors?: LaneCursor[] }) {
  const i18n = useBlockEditorI18n();
  const busy = new Set(cursors.map((c) => c.laneId));
  return (
    <span className="gotipe-lane-avatars" role="group" aria-label={i18n.t("review.onPage")}>
      {lanes.map((lane) => (
        <span
          key={lane.id}
          className={`gotipe-lane-avatar${busy.has(lane.id) ? " is-busy" : ""}${lane.kind === "user" ? " is-on" : ""}`}
          title={lane.name}
          style={{ "--gt-track": lane.color ?? "var(--gt-track-1)" } as React.CSSProperties}
        >
          <svg className="gotipe-lane-ring" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10.5" />
          </svg>
          <PageIcon name={LANE_ICON[lane.kind]} />
        </span>
      ))}
    </span>
  );
}

/**
 * The edit's bar (v6 `.wkl-live`): what is happening, how many suggestions
 * wait, extra facts from the host (tokens), “Reject all” / “Accept all”.
 */
export function ReviewBar({
  title,
  states,
  extra = [],
  onAcceptAll,
  onRejectAll,
  onClose,
}: {
  /** “GigaChat 2 is editing”. */
  title?: React.ReactNode;
  states: ProposalState[];
  /** More facts, e.g. “3.6K tokens” (shown emphasised, last). */
  extra?: React.ReactNode[];
  onAcceptAll?: () => Promise<unknown> | unknown;
  onRejectAll?: () => Promise<unknown> | unknown;
  /** Shows a close button instead of the actions when nothing waits. */
  onClose?: () => void;
}) {
  const i18n = useBlockEditorI18n();
  const [busy, setBusy] = useState(false);
  // what waits for an answer: a growing proposal (`live`) takes none yet
  const pending = states.filter((s) => s.status === "pending" && !s.live).length;
  const stale = states.filter((s) => s.status === "stale" && !s.live).length;
  const run = async (fn?: () => Promise<unknown> | unknown) => {
    if (!fn) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gotipe-review-bar" role="status">
      <PageIcon name="sparkle" />
      <span className="gotipe-review-bar-text">
        {title ? <b>{title}</b> : null}
        {pending > 0 ? <span>{i18n.plural("review.proposals", pending)}</span> : null}
        {stale > 0 ? <span>{i18n.plural("review.staleCount", stale)}</span> : null}
        {extra.map((item, i) => (
          <span key={i} className="gotipe-review-bar-key">
            {item}
          </span>
        ))}
      </span>
      {pending + stale > 0 ? (
        <>
          {onRejectAll ? (
            <button
              type="button"
              className="gotipe-btn gotipe-btn-secondary"
              disabled={busy}
              onClick={() => void run(onRejectAll)}
            >
              {i18n.t("review.rejectAll")}
            </button>
          ) : null}
          {onAcceptAll && pending > 0 ? (
            <button
              type="button"
              className="gotipe-btn gotipe-btn-primary"
              disabled={busy}
              onClick={() => void run(onAcceptAll)}
            >
              {i18n.t("review.acceptAll")}
            </button>
          ) : null}
        </>
      ) : onClose ? (
        <button
          type="button"
          className="gotipe-review-icon-btn"
          aria-label={i18n.t("review.close")}
          onClick={onClose}
        >
          <PageIcon name="close" />
        </button>
      ) : null}
    </div>
  );
}
