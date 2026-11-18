import type { GoTipeEditor } from "@gotipe/core";
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef } from "react";
import type { MarkdownSession } from "./markdown-session";

export interface PageDraft {
  /** Emits a draft not yet sent to `onChange` now, and returns the current Markdown. */
  flush(): string;
  /** Replaces the document with `text`, even when it equals the last value of `markdown`. */
  setMarkdown(text: string): void;
}

/**
 * The page's draft between the editor and the host: after edits it is emitted once a frame, and
 * `flush()` emits it at once (before a save); a new `markdown` that is not the last draft, or a
 * `setMarkdown()` call, replaces the document, keeping focus, caret and scroll.
 */
export function usePageDraft(
  editor: GoTipeEditor | null,
  session: MarkdownSession,
  markdown: string,
  onChange: MutableRefObject<((markdown: string) => void) | undefined>,
): PageDraft {
  const frame = useRef<number | null>(null);
  /** Text given to `setMarkdown` before the editor existed. */
  const pending = useRef<string | null>(null);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const markdownRef = useRef(markdown);
  markdownRef.current = markdown;

  const cancel = useCallback(() => {
    if (frame.current === null) return;
    cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const flush = useCallback((): string => {
    cancel();
    const current = editorRef.current;
    if (!current) return pending.current ?? session.lastText ?? markdownRef.current;
    const { text } = session.serialize(current);
    if (text !== session.lastText) {
      session.lastText = text;
      onChange.current?.(text);
    }
    return text;
  }, [session, onChange, cancel]);

  useEffect(() => {
    if (!editor) return;
    const off = editor.on("update", () => {
      session.touch();
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    });
    return () => {
      off();
      cancel();
    };
  }, [editor, session, flush, cancel]);

  // External replacement (file changed on disk, accepted suggestion…).
  useEffect(() => {
    if (!editor) return;
    const text = pending.current ?? markdown;
    pending.current = null;
    if (text === session.lastText) return;
    session.load(editor, text, true);
  }, [editor, session, markdown]);

  const setMarkdown = useCallback(
    (text: string) => {
      const current = editorRef.current;
      if (!current) {
        pending.current = text;
        return;
      }
      // the host replaces the document: a draft it has not been sent is dropped (flush() first)
      cancel();
      session.load(current, text, true);
    },
    [session, cancel],
  );

  return useMemo(() => ({ flush, setMarkdown }), [flush, setMarkdown]);
}
