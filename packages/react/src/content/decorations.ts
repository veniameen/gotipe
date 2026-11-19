import type {
  BlockView,
  Decoration,
  GoTipeEditor,
  InlineDecoration,
  WidgetDecoration,
} from "@gotipe/core";
import { toSafeColor } from "@gotipe/core";

/** A widget to draw; `caret` marks another person's caret with their name and color. */
export interface TextWidget extends WidgetDecoration {
  caret?: { name: string; color: string | null };
}

/**
 * Every text decoration of every layer as an inline range or a widget, with stable classes:
 * comments (`gotipe-comment-highlight`, `resolved`, `data-comment-id`), proposals
 * (`gotipe-suggestion-insert|delete`, `data-suggestion-id`), other people's selections
 * (`gotipe-remote-range`, `data-peer-id`) and carets (`gotipe-remote-cursor`), and model ghost
 * text (`gotipe-ghost-text`). Generic `inline` and `widget` decorations pass through.
 */
export function textDecorations(decorations: readonly Decoration[] | undefined): {
  inline: InlineDecoration[];
  widgets: TextWidget[];
} {
  const inline: InlineDecoration[] = [];
  const widgets: TextWidget[] = [];
  for (const d of decorations ?? []) {
    switch (d.type) {
      case "inline":
        inline.push(d);
        break;
      case "widget":
        widgets.push(d);
        break;
      case "comment-highlight":
        inline.push({
          type: "inline",
          key: `comment:${d.commentId}`,
          blockId: d.blockId,
          from: d.from,
          to: d.to,
          className: d.resolved ? "gotipe-comment-highlight resolved" : "gotipe-comment-highlight",
          attrs: { "data-comment-id": d.commentId },
        });
        break;
      case "suggestion-insert":
      case "suggestion-delete":
        inline.push({
          type: "inline",
          key: `${d.type}:${d.suggestionId}`,
          blockId: d.blockId,
          from: d.from,
          to: d.to,
          className: `gotipe-${d.type}`,
          attrs: { "data-suggestion-id": d.suggestionId },
        });
        break;
      case "remote-selection": {
        // The person's color at the theme's selection opacity.
        const color = toSafeColor(d.color);
        inline.push({
          type: "inline",
          key: `remote:${d.peerId}`,
          blockId: d.blockId,
          from: d.from,
          to: d.to,
          className: "gotipe-remote-range",
          attrs: { "data-peer-id": d.peerId },
          style: color
            ? {
                backgroundColor: `color-mix(in srgb, ${color} calc(var(--gt-remote-selection-opacity) * 100%), transparent)`,
              }
            : undefined,
        });
        break;
      }
      case "remote-cursor":
        widgets.push({
          type: "widget",
          key: `remote:${d.peerId}`,
          blockId: d.blockId,
          offset: d.offset,
          className: "gotipe-remote-cursor",
          attrs: { "data-peer-id": d.peerId, "aria-hidden": "true" },
          caret: { name: d.user.name, color: toSafeColor(d.user.color) },
        });
        break;
      case "ghost-text":
        widgets.push({
          type: "widget",
          key: "ghost-text",
          blockId: d.blockId,
          offset: d.offset,
          text: d.text,
          className: "gotipe-ghost-text",
          attrs: { "data-gotipe-ghost-text": "", "aria-hidden": "true" },
        });
        break;
    }
  }
  return { inline, widgets };
}

/**
 * Text of a `placeholder` decoration on the block (the `Placeholder` extension's layer):
 * `""` asks for the renderer's own localized words, `null` means there is no decoration.
 */
export function placeholderOf(block: BlockView): string | null {
  for (const d of block.decorations ?? []) if (d.type === "placeholder") return d.text;
  return null;
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

const sameItems = (a: readonly unknown[], b: readonly unknown[]) =>
  a === b || (a.length === b.length && a.every((item, index) => item === b[index]));

/**
 * The blocks with the objects drawn last wherever a block is the same as then: the core gives a
 * block that has decorations a new object on every change of any layer, so one whose own
 * decorations and children are the very same would be drawn again for nothing. `drawn` is the
 * tree drawn last; blocks are compared place by place.
 */
export function keepDrawn(blocks: BlockView[], drawn: readonly BlockView[] | null): BlockView[] {
  if (!drawn) return blocks;
  const visit = (block: BlockView, before: BlockView | undefined): BlockView => {
    if (!before || block === before || block.id !== before.id) return block;
    const children =
      block.children === before.children
        ? block.children
        : block.children.map((child, index) => visit(child, before.children[index]));
    if (
      block.content === before.content &&
      block.attrs === before.attrs &&
      block.type === before.type &&
      block.renderKey === before.renderKey &&
      sameItems(block.decorations ?? [], before.decorations ?? []) &&
      sameItems(children, before.children)
    )
      return before;
    return sameItems(children, block.children) ? block : { ...block, children };
  };
  let same = blocks.length === drawn.length;
  const kept = blocks.map((block, index) => {
    const next = visit(block, drawn[index]);
    if (next !== drawn[index]) same = false;
    return next;
  });
  return same ? (drawn as BlockView[]) : kept;
}

const ALIGNMENTS = new Set(["left", "center", "right", "justify"]);

/** A block's own `align` attribute (`TextAlign`), when it is one of the four values. */
export function alignmentOf(block: BlockView): string | null {
  const value = block.attrs.align;
  return typeof value === "string" && ALIGNMENTS.has(value) ? value : null;
}

const DIRECTIONS = new Set(["ltr", "rtl", "auto"]);
/** Text blocks that follow their own text's direction unless `dir` says otherwise. */
const DIRECTED = new Set(["paragraph", "heading", "listItem", "todoItem"]);

/**
 * The `dir` of a block's root (`TextDirection`): its own `dir`, else `auto` for a text block, so
 * an Arabic or Hebrew paragraph runs right to left from its first strong character.
 */
export function directionOf(block: BlockView): string | null {
  const value = block.attrs.dir;
  if (typeof value === "string" && DIRECTIONS.has(value)) return value;
  return DIRECTED.has(block.type) ? "auto" : null;
}
