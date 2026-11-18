import { type BlockView, type GoTipeEditor, createId } from "@gotipe/core";
import {
  type InlineAtoms,
  type MarkdownMap,
  type MarkdownSnapshot,
  parseMarkdown,
  serializeMarkdown,
} from "@gotipe/markdown";

type DocBlock = {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  content: unknown;
  children: DocBlock[];
};
type Doc = { version: number; blocks: DocBlock[] };

export interface SerializedPage {
  text: string;
  map: MarkdownMap;
  /** The editor document version this text was produced from. */
  revision: number;
}

function isEmptyTitle(block: DocBlock | undefined): boolean {
  if (!block || block.type !== "heading" || Number(block.attrs.level) !== 1) return false;
  const content = block.content;
  return !Array.isArray(content) || content.every((s: { text: string }) => s.text.trim() === "");
}

/** An image or a file whose source is not chosen yet: the page's placeholder, not file content. */
function isPlaceholder(block: DocBlock): boolean {
  if (block.type === "image") return !String(block.attrs.src ?? "").trim();
  if (block.type === "file") return !String(block.attrs.url ?? "").trim();
  return false;
}

/** `blocks` without placeholders at any depth; the same array when there are none. */
function withoutPlaceholders(blocks: DocBlock[]): DocBlock[] {
  let changed = false;
  const kept: DocBlock[] = [];
  for (const block of blocks) {
    if (isPlaceholder(block)) {
      changed = true;
      continue;
    }
    const children = withoutPlaceholders(block.children);
    if (children !== block.children) changed = true;
    kept.push(children === block.children ? block : { ...block, children });
  }
  return changed ? kept : blocks;
}

/**
 * Keeps an editor and a Markdown file in sync:
 * - `load(text)` parses the file (reusing block ids of the previous version,
 *   so the caret and scroll survive external replacement);
 * - `serialize()` writes the document back, copying untouched top-level
 *   blocks byte-for-byte from the source.
 * A page always starts with a title (H1). When the file has none, an empty
 * synthetic title block is shown and left out of the file until typed in.
 * An image or a file placeholder (no source yet) is left out of the file too.
 * `fingerprints` keeps those of the view's top-level blocks: an edit fingerprints only what it
 * changed.
 */
export class MarkdownSession {
  private snapshot: MarkdownSnapshot | undefined;
  private syntheticTitleId: string | null = null;
  private revision = 0;
  private cache: SerializedPage | null = null;
  private readonly fingerprints = new WeakMap<object, string>();
  /** Last text loaded from the host or emitted to it. */
  lastText: string | null = null;

  /** `atoms`: inline atoms the reader makes (a page with mentions reads them back). */
  constructor(private readonly options: { ensureTitle: boolean; atoms?: InlineAtoms }) {}

  /** Parses `text` into a document (ids reused from the previous load). */
  parse(text: string, previousDoc?: Doc): Doc {
    const { doc, snapshot } = parseMarkdown(text, {
      previous: this.snapshot,
      previousDoc: previousDoc as never,
      atoms: this.options.atoms,
    });
    this.snapshot = snapshot;
    this.lastText = text;
    this.cache = null;
    const blocks = doc.blocks as unknown as DocBlock[];
    this.syntheticTitleId = null;
    if (this.options.ensureTitle) {
      const first = blocks[0];
      const hasTitle = first?.type === "heading" && Number(first.attrs.level) === 1;
      if (!hasTitle) {
        const id =
          previousDoc?.blocks[0] && isEmptyTitle(previousDoc.blocks[0])
            ? previousDoc.blocks[0].id
            : createId();
        blocks.unshift({ id, type: "heading", attrs: { level: 1 }, content: [], children: [] });
        this.syntheticTitleId = id;
      }
    }
    return { version: 1, blocks };
  }

  /** Loads `text` into `editor`. `external`: keep selection, focus and scroll. */
  load(editor: GoTipeEditor, text: string, external: boolean): void {
    const previous = external ? (editor.getJSON() as Doc) : undefined;
    const doc = this.parse(text, previous);
    editor.setContent(doc, { preserveSelection: external, addToHistory: external });
    this.revision += 1;
  }

  /** Marks the editor document as changed (invalidates the cached text). */
  touch(): void {
    this.revision += 1;
    this.cache = null;
  }

  /** The current document as Markdown, plus the text ⇄ block map. */
  serialize(editor: GoTipeEditor): SerializedPage {
    if (this.cache && this.cache.revision === this.revision) return this.cache;
    // The view's blocks are never changed in place and an unchanged block keeps its object, so
    // what the writer knows of a block (`fingerprints`) holds between edits. The writer reads
    // the document's fields only: decorations and the view's own flags do not reach the text.
    const doc = editor.getViewState() as unknown as Doc;
    const blocks = [...doc.blocks];
    if (
      this.syntheticTitleId &&
      blocks[0]?.id === this.syntheticTitleId &&
      isEmptyTitle(blocks[0])
    ) {
      blocks.shift();
    }
    const { text, map, snapshot } = serializeMarkdown(
      { version: doc.version, blocks: withoutPlaceholders(blocks) } as never,
      this.snapshot,
      { fingerprints: this.fingerprints },
    );
    this.snapshot = snapshot;
    this.cache = { text, map, revision: this.revision };
    return this.cache;
  }

  /** Parses a fragment (for proposals) into view blocks with fresh ids. */
  parseFragment(fragment: string): BlockView[] {
    const { doc } = parseMarkdown(fragment);
    const toView = (b: DocBlock): BlockView =>
      ({
        id: b.id,
        type: b.type,
        attrs: b.attrs,
        content: b.content as BlockView["content"],
        children: b.children.map(toView),
        decorations: [],
      }) as BlockView;
    return (doc.blocks as unknown as DocBlock[]).map(toView);
  }

  isSyntheticTitle(blockId: string): boolean {
    return blockId === this.syntheticTitleId;
  }
}
