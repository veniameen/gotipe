import { BlockEditor, type CommentData, CommentSidebar } from "@gotipe/block-editor";
import { type Comment, type CommentRange, CommentsManager } from "@gotipe/comments";
import type { GoTipeEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useEffect, useRef, useState } from "react";
import { documentOf, text } from "../frame/content";
import { DemoTools, ToolButton } from "../frame/tools";
import "../frame/editor-styles";

const PLAN = "We open the beta to the waiting list on Monday, then to everyone a week later.";
const QUOTE = "the waiting list on Monday";

const DOCUMENT = documentOf("comments", (b) => [
  b.heading(3, "Launch plan"),
  b.paragraph(text(PLAN)),
]);

const ME = { authorId: "you", authorName: "You" };

const toSidebar = (c: Comment): CommentData => ({
  id: c.id,
  author: c.authorName,
  timestamp: Date.parse(c.createdAt),
  body: c.content,
  quotedText: c.quotedText,
  anchorBlockId: c.blockId,
  anchorFrom: c.from,
  anchorTo: c.to,
  endBlockId: c.endBlockId,
  orphaned: c.orphaned,
  resolved: c.resolved,
  replies: c.replies.map((r) => ({
    id: r.id,
    author: r.authorName,
    timestamp: Date.parse(r.createdAt),
    body: r.content,
  })),
});

/** The selected text in one block, or null. */
function selectedRange(editor: GoTipeEditor): CommentRange | null {
  editor.syncSelectionFromDOM();
  const selection = editor.getViewState().selection;
  if (selection.type !== "text") return null;
  const { anchor, head } = selection;
  if (anchor.blockId !== head.blockId || anchor.offset === head.offset) return null;
  return {
    blockId: anchor.blockId,
    from: Math.min(anchor.offset, head.offset),
    to: Math.max(anchor.offset, head.offset),
  };
}

export function CommentsDemo() {
  const editor = useEditor({ engine: "js", extensions: [DefaultPreset], content: DOCUMENT });
  const [manager, setManager] = useState<CommentsManager | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState<CommentRange | null>(null);
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editor) return;
    const next = new CommentsManager(editor);
    const stop = next.subscribe(() => setComments(next.getComments()));
    // one thread to start with, on the first phrase of the plan
    const first = editor.getJSON().blocks[1];
    if (first) {
      const thread = next.addComment({
        blockId: first.id,
        from: PLAN.indexOf(QUOTE),
        to: PLAN.indexOf(QUOTE) + QUOTE.length,
        authorId: "mira",
        authorName: "Mira",
        content: "Can we name the day in the invite?",
      });
      next.addReply(thread.id, { authorId: "lev", authorName: "Lev", content: "Monday the 3rd." });
    }
    setManager(next);
    return () => {
      stop();
      next.destroy();
    };
  }, [editor]);

  useEffect(() => {
    if (draft) field.current?.focus();
  }, [draft]);

  const start = () => {
    if (!editor) return;
    const range = selectedRange(editor);
    setNote(range ? "" : "Select a phrase in one paragraph first.");
    setDraft(range);
    setBody("");
  };
  const post = () => {
    if (!manager || !draft || !body.trim()) return;
    try {
      manager.addComment({ ...draft, ...ME, content: body.trim() });
      setDraft(null);
      setBody("");
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <DemoTools label="Comments">
        {draft ? (
          <form
            className="site-demo-form"
            onSubmit={(event) => {
              event.preventDefault();
              post();
            }}
          >
            <input
              ref={field}
              className="site-demo-input"
              aria-label="Your comment"
              placeholder="Your comment"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setDraft(null)}
            />
            <button type="submit" className="site-demo-button" disabled={!body.trim()}>
              Post
            </button>
            <button type="button" className="site-demo-button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </form>
        ) : (
          <ToolButton disabled={!manager} onClick={start}>
            Comment
          </ToolButton>
        )}
        <output className="site-demo-note">{note}</output>
      </DemoTools>
      <div className="site-demo-side">
        <div className="site-demo-scroll">
          <BlockEditor editor={editor} showAiCommandBar={false} ariaLabel="Launch plan" />
        </div>
        {editor && manager && (
          <aside className="site-demo-aside" aria-label="Comments">
            <CommentSidebar
              editor={editor}
              comments={comments.map(toSidebar)}
              currentUser={ME.authorName}
              onAddReply={(id, content) => {
                manager.addReply(id, { ...ME, content });
              }}
              onResolve={(id) => manager.resolveComment(id, ME.authorId)}
              onUnresolve={(id) => manager.unresolveComment(id)}
              onDelete={(id) => manager.deleteComment(id)}
            />
          </aside>
        )}
      </div>
    </>
  );
}
