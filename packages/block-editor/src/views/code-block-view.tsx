import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { type BlockViewComponent, type BlockViewProps, CodeBlock } from "@gotipe/react";
import type { CodeHighlighter } from "../highlight/types";
import { useHighlightedCode } from "../highlight/use-highlighted-code";
import { HighlightedLines } from "./highlighted-lines";

export function CodeBlockView({
  block,
  editor,
  highlight,
}: {
  block: BlockView;
  editor: GoTipeEditor;
  /** Optional lazy highlighter; the base editor does not load it. */
  highlight?: CodeHighlighter;
}) {
  const code = typeof block.content === "string" ? block.content : "";
  const tokens = useHighlightedCode(highlight, code, String(block.attrs.language || "plaintext"));
  return (
    <CodeBlock block={block} editor={editor}>
      {tokens ? <HighlightedLines lines={tokens} /> : undefined}
    </CodeBlock>
  );
}

/** BlockEditor's code view with a highlighter; it keeps the block's root attributes. */
export function codeBlockViewFor(highlight: CodeHighlighter): BlockViewComponent {
  return function HighlightedCodeView({ block, editor, rootProps }: BlockViewProps) {
    const code = typeof block.content === "string" ? block.content : "";
    const tokens = useHighlightedCode(highlight, code, String(block.attrs.language || "plaintext"));
    return (
      <CodeBlock block={block} editor={editor} rootProps={rootProps}>
        {tokens ? <HighlightedLines lines={tokens} /> : undefined}
      </CodeBlock>
    );
  };
}
