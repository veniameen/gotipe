"use client";

import { PageEditor, type PageEditorHandle } from "@gotipe/block-editor";
import type { GoTipeEditor } from "@gotipe/core";
import { parseMarkdown } from "@gotipe/markdown";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SIGNATURE_MARKDOWN } from "./demo-content";
import { fieldOf, fileOf, lineAt, lineSummary, linesOf, rewrittenLines } from "./markdown-lines";
import { SignatureWindow, type SourceInput } from "./signature-window";

const SOURCE_LINES = linesOf(SIGNATURE_MARKDOWN);
/** The pause in typing after which the document takes the source: a keystroke does not rebuild it. */
const SOURCE_SETTLE_MS = 120;

type Block = { id: string; children?: Block[] };
type Span = { start: number; end: number };

/** Index of the top-level block that holds `blockId`, or -1. */
function topLevelIndex(blocks: Block[], blockId: string): number {
  const holds = (block: Block): boolean =>
    block.id === blockId || (block.children ?? []).some(holds);
  return blocks.findIndex(holds);
}

/** The lines (0-based) a span of the file `text` covers. */
function linesOfSpan(text: string, span: Span): Set<number> {
  const first = lineAt(text, span.start);
  const count = text.slice(span.start, span.end).replace(/\n$/, "").split("\n").length;
  const lines = new Set<number>();
  for (let line = first; line < first + count; line += 1) lines.add(line);
  return lines;
}

/** The lines (0-based) of the `index`-th top-level block of the file `text`. */
function linesOfBlock(text: string, index: number): Set<number> {
  const block = parseMarkdown(text).snapshot.blocks[index];
  return block ? linesOfSpan(text, block) : new Set();
}

/** The lines of the top-level block of `text` the caret at `offset` stands in; a blank line alone. */
function linesAround(text: string, offset: number): Set<number> {
  const block = parseMarkdown(text).snapshot.blocks.find((each) => {
    const stop = each.end - (text[each.end - 1] === "\n" ? 1 : 0);
    return each.start <= offset && offset <= stop;
  });
  return block ? linesOfSpan(text, block) : new Set([lineAt(text, offset)]);
}

/**
 * The live signature: PageEditor (@gotipe/block-editor) on the file, both panes editable. Typing in
 * the document, its Markdown session writes the source pane after every edit: untouched blocks come
 * back byte for byte, so only the lines of edited blocks differ from the original. Typing in the
 * source, the document takes the file at each pause and rebuilds only what changed, keeping its
 * caret. The pane with the focus leads; the other follows.
 */
export default function SignatureEditor() {
  /** The file as the source pane shows it. */
  const [text, setText] = useState(SIGNATURE_MARKDOWN);
  /** The file the document was given last: the source's text, or the document's own. */
  const [given, setGiven] = useState(SIGNATURE_MARKDOWN);
  const [current, setCurrent] = useState<Set<number>>(() => new Set());
  const handle = useRef<PageEditorHandle>(null);
  const [editor, setEditor] = useState<GoTipeEditor | null>(null);
  /** The source pane has the focus: it leads, and the document's echoes do not rewrite it. */
  const typing = useRef(false);
  /** The source typed since the document last took it, and the pause that hands it over. */
  const pending = useRef<string | null>(null);
  const settle = useRef<number | undefined>(undefined);

  const lines = useMemo(() => linesOf(text), [text]);
  const rewritten = useMemo(() => rewrittenLines(SOURCE_LINES, lines).size, [lines]);

  const showCaret = useCallback(() => {
    if (typing.current) return;
    const ed = handle.current?.editor;
    if (!ed || ed.isDestroyed) return;
    const view = ed.getViewState();
    const index = topLevelIndex(view.blocks, view.selection.head.blockId);
    setCurrent(index < 0 ? new Set() : linesOfBlock(handle.current?.getMarkdown() ?? "", index));
  }, []);

  useEffect(() => {
    if (!editor) return;
    const offs = [
      editor.on("selectionChange", showCaret),
      editor.on("focus", showCaret),
      editor.on("blur", () => {
        if (!typing.current) setCurrent(new Set());
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [editor, showCaret]);

  // the document's edits: the source follows unless the person is typing there
  const onChange = useCallback(
    (markdown: string) => {
      // the document's own text: a source typed back to an earlier text still replaces it
      setGiven(markdown);
      if (typing.current) return;
      setText(markdown);
      if (handle.current?.editor?.getDOMSelection()) showCaret();
    },
    [showCaret],
  );

  /** Hands the typed source to the document now. */
  const handOver = useCallback(() => {
    window.clearTimeout(settle.current);
    settle.current = undefined;
    const file = pending.current;
    pending.current = null;
    if (file !== null) setGiven(file);
  }, []);
  useEffect(() => () => window.clearTimeout(settle.current), []);

  const source = useMemo<SourceInput>(
    () => ({
      value: fieldOf(text),
      onInput(value) {
        const file = fileOf(value);
        setText(file);
        pending.current = file;
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(handOver, SOURCE_SETTLE_MS);
      },
      onCaret(value, offset) {
        if (typing.current) setCurrent(linesAround(fileOf(value), offset));
      },
      onFocus() {
        typing.current = true;
      },
      onBlur() {
        typing.current = false;
        handOver();
        setCurrent(new Set());
      },
    }),
    [text, handOver],
  );

  return (
    <SignatureWindow
      lines={lines}
      current={current}
      summary={lineSummary(SOURCE_LINES.length, lines.length, rewritten)}
      live
      source={source}
    >
      <PageEditor
        ref={handle}
        markdown={given}
        onChange={onChange}
        onReady={setEditor}
        view="notion"
        reviewBar={false}
        titlePlaceholder="notes.md"
        className="site-page-editor"
      />
    </SignatureWindow>
  );
}
