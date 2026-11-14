"use client";

import { PageEditor, type PageEditorHandle } from "@gotipe/block-editor";
import type { GoTipeEditor } from "@gotipe/core";
import { parseMarkdown } from "@gotipe/markdown";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SIGNATURE_MARKDOWN } from "./demo-content";
import { lineSummary, linesOf, rewrittenLines } from "./markdown-lines";
import { SignatureWindow } from "./signature-window";

const SOURCE_LINES = linesOf(SIGNATURE_MARKDOWN);

type Block = { id: string; children?: Block[] };

/** Index of the top-level block that holds `blockId`, or -1. */
function topLevelIndex(blocks: Block[], blockId: string): number {
  const holds = (block: Block): boolean =>
    block.id === blockId || (block.children ?? []).some(holds);
  return blocks.findIndex(holds);
}

/** The lines (0-based) of the `index`-th top-level block of the file `text`. */
function linesOfBlock(text: string, index: number): Set<number> {
  const block = parseMarkdown(text).snapshot.blocks[index];
  const lines = new Set<number>();
  if (!block) return lines;
  const first = text.slice(0, block.start).split("\n").length - 1;
  const body = text.slice(block.start, block.end).replace(/\n$/, "");
  const count = body.split("\n").length;
  for (let line = first; line < first + count; line += 1) lines.add(line);
  return lines;
}

/**
 * The live signature: PageEditor (@gotipe/block-editor) on the file, its Markdown session writing
 * the source pane after every edit. Untouched blocks come back byte for byte, so only the lines
 * of edited blocks differ from the original.
 */
export default function SignatureEditor() {
  const [text, setText] = useState(SIGNATURE_MARKDOWN);
  const [current, setCurrent] = useState<Set<number>>(() => new Set());
  const handle = useRef<PageEditorHandle>(null);
  const [editor, setEditor] = useState<GoTipeEditor | null>(null);

  const lines = useMemo(() => linesOf(text), [text]);
  const rewritten = useMemo(() => rewrittenLines(SOURCE_LINES, lines).size, [lines]);

  const showCaret = useCallback(() => {
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
      editor.on("blur", () => setCurrent(new Set())),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [editor, showCaret]);

  const onChange = useCallback(
    (markdown: string) => {
      setText(markdown);
      if (handle.current?.editor?.getDOMSelection()) showCaret();
    },
    [showCaret],
  );

  return (
    <SignatureWindow
      lines={lines}
      current={current}
      summary={lineSummary(SOURCE_LINES.length, lines.length, rewritten)}
      live
    >
      <PageEditor
        ref={handle}
        markdown={SIGNATURE_MARKDOWN}
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
