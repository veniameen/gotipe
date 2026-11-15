import type { BlockView, BlocksDecoration, NodeDecoration } from "@gotipe/core";
import { type I18n, createI18n, en } from "@gotipe/i18n";
import { useContext } from "react";
import { TextRenderer } from "../text-renderer";
import { AfterTextContext, PhantomContext } from "./context";
import { alignmentOf, directionOf, textDecorations } from "./decorations";

export function rootPropsOf(block: BlockView, phantom: boolean): Record<string, unknown> {
  const props: Record<string, unknown> = phantom
    ? {
        "data-gotipe-phantom-id": block.id,
        "data-gotipe-widget": "",
        contentEditable: false,
        suppressContentEditableWarning: true,
      }
    : { "data-block-id": block.id };
  // `TextAlign`: the block's own alignment, as the HTML output writes it.
  const align = alignmentOf(block);
  if (align) {
    props["data-align"] = align;
    props.style = { textAlign: align };
  }
  // `TextDirection`: the block's own direction, or `auto` for a text block.
  const dir = directionOf(block);
  if (dir) props.dir = dir;
  const decorations = block.decorations;
  if (decorations && decorations.length > 0) {
    let style = props.style as Record<string, string> | undefined;
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

/**
 * The `afterText` of a block with text, right after its last character: a widget, so it is not
 * part of the text and takes no offsets. A suggested (phantom) block shows none.
 */
function AfterText({ block }: { block: BlockView }) {
  const after = useContext(AfterTextContext);
  const phantom = useContext(PhantomContext);
  const node = after && !phantom ? after(block) : null;
  if (node === null || node === undefined || node === false) return null;
  return (
    <span data-gotipe-widget="" contentEditable={false} suppressContentEditableWarning>
      {node}
    </span>
  );
}

export function BlockContent({ block }: { block: BlockView }) {
  if (block.content === null) return null;
  if (typeof block.content === "string") return <>{block.content}</>;
  if (Array.isArray(block.content)) {
    const hasVisibleText = block.content.some((span) => span.text.length > 0);
    const { inline, widgets } = textDecorations(block.decorations);
    const hasTextDecorations = inline.length > 0 || widgets.length > 0;
    if (hasVisibleText || hasTextDecorations) {
      return (
        <>
          <TextRenderer spans={block.content} decorations={block.decorations} />
          {hasVisibleText ? <AfterText block={block} /> : <br data-gotipe-trailing-break="" />}
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

const englishI18n = createI18n({ locale: "en", locales: { en } });

export function getEmptyBlockPlaceholder(
  block: BlockView,
  parentType?: string,
  i18n: Pick<I18n, "t"> = englishI18n,
): string | null {
  switch (block.type) {
    case "paragraph":
      return i18n.t("placeholder.paragraph");
    case "heading": {
      const level = Math.min(Math.max((block.attrs.level as number) || 1, 1), 6);
      return i18n.t("placeholder.heading", { level });
    }
    case "listItem":
      return i18n.t(
        parentType === "orderedList" ? "placeholder.orderedList" : "placeholder.bulletList",
      );
    case "todoItem":
      return i18n.t("placeholder.todo");
    case "blockquote":
      return i18n.t("placeholder.quote");
    case "toggle":
      return i18n.t("placeholder.toggle");
    default:
      return null;
  }
}
