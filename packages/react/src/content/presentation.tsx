import type { BlockView, BlocksDecoration, NodeDecoration } from "@gotipe/core";
import { TextRenderer } from "../text-renderer";

export function rootPropsOf(block: BlockView, phantom: boolean): Record<string, unknown> {
  const props: Record<string, unknown> = phantom
    ? {
        "data-gotipe-phantom-id": block.id,
        "data-gotipe-widget": "",
        contentEditable: false,
        suppressContentEditableWarning: true,
      }
    : { "data-block-id": block.id };
  const decorations = block.decorations;
  if (decorations && decorations.length > 0) {
    let style: Record<string, string> | undefined;
    for (const d of decorations) {
      if (d.type !== "node") continue;
      const node = d as NodeDecoration;
      if (node.attrs) Object.assign(props, node.attrs);
      if (node.style) style = { ...(style ?? {}), ...node.style };
      props["data-gotipe-node-decoration"] = "";
    }
    if (style) props.style = style;
  }
  return props;
}

export function nodeDecorationClass(block: BlockView): string | undefined {
  const classes: string[] = [];
  for (const d of block.decorations ?? []) {
    if (d.type === "node" && d.className) classes.push(d.className);
  }
  return classes.length > 0 ? classes.join(" ") : undefined;
}

export function phantomBlocksOf(
  block: BlockView,
  position: "before" | "after",
): BlocksDecoration[] {
  const out: BlocksDecoration[] = [];
  for (const d of block.decorations ?? []) {
    if (d.type === "blocks" && d.position === position) out.push(d);
  }
  return out;
}

export function blockKey(block: BlockView): string {
  return block.renderKey ? `${block.id}:${block.renderKey}` : block.id;
}

export function BlockContent({ block }: { block: BlockView }) {
  if (block.content === null) return null;
  if (typeof block.content === "string") return <>{block.content}</>;
  if (Array.isArray(block.content)) {
    const hasVisibleText = block.content.some((span) => span.text.length > 0);
    const hasTextDecorations = (block.decorations ?? []).some(
      (d) => d.type === "widget" || d.type === "inline",
    );
    if (hasVisibleText || hasTextDecorations) {
      return (
        <>
          <TextRenderer spans={block.content} decorations={block.decorations} />
          {hasVisibleText ? null : <br data-gotipe-trailing-break="" />}
        </>
      );
    }
    // Keep empty editable blocks caret-addressable in the DOM.
    return <br data-gotipe-trailing-break="" />;
  }
  return null;
}

export function isBlockContentEmpty(block: BlockView): boolean {
  if (block.content === null) return true;
  if (typeof block.content === "string") return block.content.length === 0;
  if (Array.isArray(block.content)) return block.content.every((span) => span.text.length === 0);
  return true;
}

export function getEmptyBlockPlaceholder(block: BlockView, parentType?: string): string | null {
  switch (block.type) {
    case "paragraph":
      return "Text";
    case "heading": {
      const level = Math.min(Math.max((block.attrs.level as number) || 1, 1), 6);
      return `Heading ${level}`;
    }
    case "listItem":
      return parentType === "orderedList" ? "Numbered List" : "Bullet List";
    case "todoItem":
      return "To-do List";
    case "blockquote":
      return "Quote";
    default:
      return null;
  }
}
