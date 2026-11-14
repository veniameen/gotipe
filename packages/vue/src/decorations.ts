import type {
  BlockView,
  Decoration,
  GoTipeEditor,
  InlineDecoration,
  NodeDecoration,
  WidgetDecoration,
} from "@gotipe/core";
import { toSafeColor } from "@gotipe/core";

/** A widget to draw; `caret` marks another person's caret with their name and color. */
export interface TextWidget extends WidgetDecoration {
  caret?: { name: string; color: string | null };
}

/**
 * Every text decoration of every layer as an inline range or a widget, with the same classes as
 * the React renderer: `gotipe-comment-highlight` (+ `resolved`, `data-comment-id`),
 * `gotipe-suggestion-insert|delete` (`data-suggestion-id`), `gotipe-remote-range` and
 * `gotipe-remote-cursor` (`data-peer-id`), `gotipe-ghost-text`; `inline` and `widget` pass through.
 */
export function textDecorations(decorations: readonly Decoration[] | undefined): {
  inline: InlineDecoration[];
  widgets: TextWidget[];
} {
  const inline: InlineDecoration[] = [];
  const widgets: TextWidget[] = [];
  const range = (
    d: { blockId: string; from: number; to: number },
    key: string,
    className: string,
    attrs: Record<string, string>,
    style?: Record<string, string>,
  ) =>
    inline.push({
      type: "inline",
      key,
      blockId: d.blockId,
      from: d.from,
      to: d.to,
      className,
      attrs,
      style,
    });
  for (const d of decorations ?? []) {
    if (d.type === "inline") inline.push(d);
    else if (d.type === "widget") widgets.push(d);
    else if (d.type === "comment-highlight")
      range(
        d,
        `comment:${d.commentId}`,
        d.resolved ? "gotipe-comment-highlight resolved" : "gotipe-comment-highlight",
        { "data-comment-id": d.commentId },
      );
    else if (d.type === "suggestion-insert" || d.type === "suggestion-delete")
      range(d, `${d.type}:${d.suggestionId}`, `gotipe-${d.type}`, {
        "data-suggestion-id": d.suggestionId,
      });
    else if (d.type === "remote-selection") {
      const color = toSafeColor(d.color);
      range(
        d,
        `remote:${d.peerId}`,
        "gotipe-remote-range",
        { "data-peer-id": d.peerId },
        color
          ? {
              backgroundColor: `color-mix(in srgb, ${color} calc(var(--gt-remote-selection-opacity) * 100%), transparent)`,
            }
          : undefined,
      );
    } else if (d.type === "remote-cursor")
      widgets.push({
        type: "widget",
        key: `remote:${d.peerId}`,
        blockId: d.blockId,
        offset: d.offset,
        className: "gotipe-remote-cursor",
        attrs: { "data-peer-id": d.peerId, "aria-hidden": "true" },
        caret: { name: d.user.name, color: toSafeColor(d.user.color) },
      });
    else if (d.type === "ghost-text")
      widgets.push({
        type: "widget",
        key: "ghost-text",
        blockId: d.blockId,
        offset: d.offset,
        text: d.text,
        className: "gotipe-ghost-text",
        attrs: { "data-gotipe-ghost-text": "", "aria-hidden": "true" },
      });
  }
  return { inline, widgets };
}

/**
 * The blocks without the decorations of `layers`: the host draws those layers itself.
 * Untouched blocks keep their identity.
 */
export function withoutLayers(
  editor: Pick<GoTipeEditor, "getDecorations">,
  blocks: BlockView[],
  layers: readonly string[] | undefined,
): BlockView[] {
  if (!layers?.length) return blocks;
  const hidden = new Set<Decoration>(layers.flatMap((layer) => editor.getDecorations(layer)));
  if (!hidden.size) return blocks;
  const visit = (block: BlockView): BlockView => {
    const own = block.decorations ?? [];
    const decorations = own.some((d) => hidden.has(d)) ? own.filter((d) => !hidden.has(d)) : own;
    const children = block.children.map(visit);
    const same = children.every((child, index) => child === block.children[index]);
    return decorations === own && same
      ? block
      : { ...block, decorations, children: same ? block.children : children };
  };
  return blocks.map(visit);
}

/**
 * While the browser composes text in `blockId` (`editor.isComposing`), the block keeps the
 * decorations it was last drawn with when only they changed: redrawing its text would cut the
 * composition. `drawn` is the tree drawn last; the held decorations follow after it ends.
 */
export function holdComposing(
  blocks: BlockView[],
  drawn: readonly BlockView[] | null,
  blockId: string | null,
): BlockView[] {
  const find = (list: readonly BlockView[]): BlockView | null => {
    for (const block of list) {
      const found = block.id === blockId ? block : find(block.children);
      if (found) return found;
    }
    return null;
  };
  const before = blockId && drawn ? find(drawn) : null;
  if (!before) return blocks;
  const visit = (block: BlockView): BlockView => {
    if (block.id === blockId) {
      if (block.content !== before.content || block.type !== before.type) return block;
      if (block.decorations === before.decorations) return block;
      if (block.attrs === before.attrs && block.children === before.children) return before;
      return { ...block, decorations: before.decorations };
    }
    const children = block.children.map(visit);
    const same = children.every((child, index) => child === block.children[index]);
    return same ? block : { ...block, children };
  };
  return blocks.map(visit);
}

const ALIGNMENTS = new Set(["left", "center", "right", "justify"]);
const DIRECTIONS = new Set(["ltr", "rtl", "auto"]);
const DIRECTED = new Set(["paragraph", "heading", "listItem", "todoItem"]);

/**
 * Attributes of a block's root from its decorations and its `align` (`TextAlign`): node
 * decoration classes, attributes and styles, and the `placeholder` decoration's text while
 * the block is empty and editable.
 */
export function blockPresentation(
  block: BlockView,
  editable: boolean,
  placeholder?: (block: BlockView) => string | null,
): { class?: string; style?: Record<string, string>; attrs: Record<string, string> } {
  const attrs: Record<string, string> = {};
  const classes: string[] = [];
  let style: Record<string, string> | undefined;
  const align = block.attrs.align;
  if (typeof align === "string" && ALIGNMENTS.has(align)) {
    attrs["data-align"] = align;
    style = { textAlign: align };
  }
  // `TextDirection`: the block's own `dir`, else `auto` for a text block (Arabic, Hebrew run RTL).
  const dir = block.attrs.dir;
  if (typeof dir === "string" && DIRECTIONS.has(dir)) attrs.dir = dir;
  else if (DIRECTED.has(block.type)) attrs.dir = "auto";
  for (const d of block.decorations ?? []) {
    if (d.type === "node") {
      const node = d as NodeDecoration;
      Object.assign(attrs, node.attrs ?? {}, { "data-gotipe-node-decoration": "" });
      if (node.className) classes.push(node.className);
      if (node.style) style = { ...(style ?? {}), ...node.style };
    } else if (d.type === "placeholder" && editable && isEmpty(block)) {
      // The host's words first, then the decoration's own; this adapter has no strings.
      const text = placeholder ? placeholder(block) : d.text;
      if (text) attrs["data-placeholder"] = text;
    }
  }
  return { class: classes.length ? classes.join(" ") : undefined, style, attrs };
}

function isEmpty(block: BlockView): boolean {
  return Array.isArray(block.content)
    ? block.content.every((span) => !span.text)
    : typeof block.content === "string"
      ? !block.content
      : true;
}
