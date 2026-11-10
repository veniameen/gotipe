import type { Block, Document } from "@gotipe/core";
import { compareDocuments } from "@gotipe/versions";

function blocksById(blocks: Block[], map = new Map<string, Block>()) {
  for (const block of blocks) {
    map.set(block.id, block);
    blocksById(block.children, map);
  }
  return map;
}
function text(block: Block | undefined): string {
  if (!block) return "";
  const value = Array.isArray(block.content)
    ? block.content.map((span) => span.text).join("")
    : (block.content ?? "");
  return (
    value ||
    (typeof block.attrs.alt === "string"
      ? block.attrs.alt
      : typeof block.attrs.name === "string"
        ? block.attrs.name
        : `[${block.type}]`)
  );
}

export function VersionChanges({ before, after }: { before: Document; after: Document }) {
  const diff = compareDocuments(before, after);
  const old = blocksById(before.blocks);
  const current = blocksById(after.blocks);
  const ids = new Set([...diff.added, ...diff.removed, ...diff.modified, ...diff.moved]);
  if (!ids.size)
    return <p className="gotipe-version-empty">This version matches the current document.</p>;
  return (
    <div className="gotipe-version-changes" data-gotipe-version-diff>
      <p className="gotipe-version-summary">
        {diff.added.length} added · {diff.removed.length} removed · {diff.modified.length} edited ·{" "}
        {diff.moved.length} moved
      </p>
      <ol>
        {Array.from(ids).map((id) => {
          const was = old.get(id);
          const now = current.get(id);
          const modified = diff.modified.includes(id);
          return (
            <li key={id}>
              <span className="gotipe-version-change-label">
                {now?.type ?? was?.type} ·{" "}
                {was ? (now ? (modified ? "Edited" : "Moved") : "Removed") : "Added"}
              </span>
              {was && (!now || modified) && <del>{text(was)}</del>}
              {now && (!was || modified) && <ins>{text(now)}</ins>}
              {was && now && !modified && <p>{text(now)}</p>}
              {was && now && modified && text(was) === text(now) && (
                <small>Formatting or block settings changed.</small>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
