import { useState } from "react";
import { useBlockEditorI18n } from "../i18n/strings";
import { CommentThread } from "./comments/comment-thread";
import type { CommentData, CommentSidebarProps } from "./comments/types";
export type { CommentData, ReplyData, CommentSidebarProps } from "./comments/types";

/**
 * Host-controlled discussion UI. Missing action callbacks do not expose inactive controls. Its
 * words come from `GoTipeI18nProvider` (`@gotipe/react`), English without one.
 */
export function CommentSidebar({
  editor,
  comments,
  currentUser,
  collapsed = false,
  onAddReply,
  onResolve,
  onUnresolve,
  onDelete,
  onToggleCollapse,
}: CommentSidebarProps) {
  const i18n = useBlockEditorI18n();
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [activeId, setActiveId] = useState<string | null>(null);
  const open = comments.filter((comment) => !comment.resolved);
  const resolved = comments.filter((comment) => comment.resolved);
  const visible = filter === "open" ? open : resolved;
  const active = Math.max(
    0,
    visible.findIndex((comment) => comment.id === activeId),
  );
  const locate = (comment: CommentData) => {
    if (!comment.anchorBlockId || comment.orphaned) return;
    setActiveId(comment.id);
    const block = Array.from(
      editor.element?.querySelectorAll<HTMLElement>("[data-block-id]") ?? [],
    ).find((node) => node.dataset.blockId === comment.anchorBlockId);
    block?.scrollIntoView({ block: "nearest" });
    if (comment.anchorFrom !== undefined && comment.anchorTo !== undefined) {
      editor.focus();
      editor.setSelection({
        anchor: { blockId: comment.anchorBlockId, offset: comment.anchorFrom },
        head: { blockId: comment.endBlockId ?? comment.anchorBlockId, offset: comment.anchorTo },
      });
    }
    editor.emit("scrollToBlock", { blockId: comment.anchorBlockId });
  };
  const navigate = (delta: number) => {
    const comment = visible[(active + delta + visible.length) % visible.length];
    if (comment) {
      setActiveId(comment.id);
      locate(comment);
    }
  };
  if (collapsed)
    return (
      <aside
        className="gotipe-comment-sidebar gotipe-comment-panel is-collapsed"
        aria-label={i18n.t("comments.label")}
      >
        {onToggleCollapse && (
          <button type="button" onClick={onToggleCollapse} aria-label={i18n.t("comments.expand")}>
            {i18n.t("comments.count", { count: open.length })}
          </button>
        )}
      </aside>
    );
  return (
    <aside
      className="gotipe-comment-sidebar gotipe-comment-panel"
      aria-label={i18n.t("comments.label")}
    >
      <div className="gotipe-comment-sidebar-content">
        <div className="gotipe-comment-panel-heading">
          <h2>{i18n.t("comments.label")}</h2>
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={i18n.t("comments.collapseLabel")}
            >
              {i18n.t("comments.collapse")}
            </button>
          )}
        </div>
        <div className="gotipe-comment-filters">
          <button type="button" aria-pressed={filter === "open"} onClick={() => setFilter("open")}>
            {i18n.t("comments.open", { count: open.length })}
          </button>
          <button
            type="button"
            aria-pressed={filter === "resolved"}
            onClick={() => setFilter("resolved")}
          >
            {i18n.t("comments.resolved", { count: resolved.length })}
          </button>
        </div>
        {visible.length > 1 && (
          <div className="gotipe-comment-navigation">
            <button
              type="button"
              aria-label={i18n.t("comments.previousLabel")}
              onClick={() => navigate(-1)}
            >
              {i18n.t("comments.previous")}
            </button>
            <span>
              {active + 1}/{visible.length}
            </span>
            <button
              type="button"
              aria-label={i18n.t("comments.nextLabel")}
              onClick={() => navigate(1)}
            >
              {i18n.t("comments.next")}
            </button>
          </div>
        )}
        {!visible.length ? (
          <p className="gotipe-comment-empty">
            {i18n.t(filter === "open" ? "comments.noOpen" : "comments.noResolved")}
          </p>
        ) : (
          visible.map((comment, index) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              active={index === active}
              currentUser={currentUser}
              onAddReply={onAddReply}
              onResolve={onResolve}
              onUnresolve={onUnresolve}
              onDelete={onDelete}
              onLocate={locate}
            />
          ))
        )}
      </div>
    </aside>
  );
}
