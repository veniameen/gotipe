import type { GoTipeEditor } from "@gotipe/core";

export function CommentSidebar({ editor: _editor }: { editor: GoTipeEditor }) {
  return (
    <aside className="gotipe-comment-sidebar" aria-label="Comments">
      <div className="gotipe-comment-sidebar-content">
        {/* Comments rendered by consumer via render prop or children */}
      </div>
    </aside>
  );
}
