import type { CommentData } from "@gotipe/block-editor";
import type { Comment, CommentsManager } from "@gotipe/comments";
import type { Block, GoTipeEditor } from "@gotipe/core";

export const STORAGE_KEY = "gotipe.playground.comments.v1";
export const INITIAL =
  "# Discuss a draft\n\nSelect a phrase to start a discussion. Comments follow their quoted text as you edit the document.\n\nReply with details, resolve a discussion, or reopen it when more work is needed.\n";
export interface SavedSession {
  markdown: string;
  comments?: unknown;
  error?: string;
}
export function readSession(): SavedSession {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { markdown: INITIAL };
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      !("markdown" in value) ||
      typeof value.markdown !== "string" ||
      !("comments" in value)
    )
      throw new Error("The saved discussion is invalid. Reset the demo to start again.");
    return { markdown: value.markdown, comments: value.comments };
  } catch (error) {
    return {
      markdown: INITIAL,
      error: error instanceof Error ? error.message : "The saved discussion could not be read.",
    };
  }
}
export function saveSession(editor: GoTipeEditor, manager: CommentsManager): void {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ markdown: editor.getMarkdown(), comments: manager.exportState() }),
  );
}
export function sidebarComment(comment: Comment): CommentData {
  return {
    id: comment.id,
    author: comment.authorName,
    timestamp: Date.parse(comment.createdAt),
    body: comment.content,
    quotedText: comment.quotedText,
    anchorBlockId: comment.blockId,
    anchorFrom: comment.from,
    anchorTo: comment.to,
    endBlockId: comment.endBlockId,
    orphaned: comment.orphaned,
    resolved: comment.resolved,
    replies: comment.replies.map((reply) => ({
      id: reply.id,
      author: reply.authorName,
      timestamp: Date.parse(reply.createdAt),
      body: reply.content,
    })),
  };
}
export function selectedRange(editor: GoTipeEditor) {
  editor.syncSelectionFromDOM();
  const { selection } = editor.getViewState();
  if (selection.type !== "text") throw new Error("Select the text you want to discuss first.");
  const blocks: Block[] = [];
  const visit = (entries: Block[]) => {
    for (const block of entries) {
      if (block.content !== null) blocks.push(block);
      visit(block.children);
    }
  };
  visit(editor.getJSON().blocks);
  const { anchor, head } = selection;
  const a = blocks.findIndex((block) => block.id === anchor.blockId);
  const h = blocks.findIndex((block) => block.id === head.blockId);
  if (a < 0 || h < 0 || (a === h && anchor.offset === head.offset))
    throw new Error("Select the text you want to discuss first.");
  const forward = a < h || (a === h && anchor.offset < head.offset);
  const from = forward ? anchor : head;
  const to = forward ? head : anchor;
  const first = Math.min(a, h);
  const last = Math.max(a, h);
  const quote = blocks
    .slice(first, last + 1)
    .map((block, index) => {
      const text =
        typeof block.content === "string"
          ? block.content
          : (block.content?.map((span) => span.text).join("") ?? "");
      return text.slice(
        index === 0 ? from.offset : 0,
        index === last - first ? to.offset : undefined,
      );
    })
    .join("\n");
  return {
    range: {
      blockId: from.blockId,
      from: from.offset,
      endBlockId: to.blockId === from.blockId ? undefined : to.blockId,
      to: to.offset,
    },
    quote,
    document: JSON.stringify(editor.getJSON()),
  };
}
