import type { Decoration, Document } from "@gotipe/core";
import { type TrackedChange, findBlock } from "./change";
import { locatePatch, plain } from "./text-patch";

/** Decorations are a view of current anchors; stale records never highlight unrelated text. */
export function trackedDecorations(
  id: string,
  change: TrackedChange,
  document: Document,
): Decoration[] {
  if (change.kind === "structure")
    return change.changedIds
      .filter((blockId) => findBlock(document.blocks, blockId))
      .map((blockId) => ({
        type: "node",
        key: `${id}-${blockId}`,
        blockId,
        className: "gotipe-tracked-structure",
        attrs: { "data-suggestion-id": id },
        style: { boxShadow: "inset 3px 0 var(--gt-accent)" },
      }));
  const decorations: Decoration[] = [];
  for (const patch of change.patches) {
    const block = findBlock(document.blocks, patch.blockId);
    if (!block) continue;
    let location: { from: number; to: number };
    try {
      location = locatePatch(patch, block);
    } catch {
      continue;
    }
    const { from, to } = location;
    if (to > from)
      decorations.push({
        type: "inline",
        key: `${id}-${block.id}-insert`,
        blockId: block.id,
        from,
        to,
        attrs: { "data-suggestion-id": id },
        style: {
          textDecoration: "underline",
          textDecorationColor: "var(--gt-success)",
          backgroundColor: "color-mix(in srgb, var(--gt-success) 12%, transparent)",
        },
      });
    const removed = plain(patch.before);
    if (removed && removed !== plain(patch.after))
      decorations.push({
        type: "widget",
        key: `${id}-${block.id}-delete`,
        blockId: block.id,
        offset: from,
        text: removed,
        side: -1,
        attrs: { "data-suggestion-id": id },
        style: { color: "var(--gt-danger)", textDecoration: "line-through" },
      });
  }
  return decorations;
}
