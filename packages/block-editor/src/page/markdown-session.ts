import type { BlockView, GoTipeEditor } from "@gotipe/core";
import {
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

/**
 * Keeps an editor and a Markdown file in sync:
 * - `load(text)` parses the file (reusing block ids of the previous version,
 *   so the caret and scroll survive external replacement);
 * - `serialize()` writes the document back, copying untouched top-level
 *   blocks byte-for-byte from the source.
 * A page always starts with a title (H1). When the file has none, an empty
 * synthetic title block is shown and left out of the file until typed in.
 */
export class MarkdownSession {
  private snapshot: MarkdownSnapshot | undefined;
  private syntheticTitleId: string | null = null;
  private revision = 0;
  private cache: SerializedPage | null = null;
  /** Last text loaded from the host or emitted to it. */
  lastText: string | null = null;

  constructor(private readonly options: { ensureTitle: boolean }) {}

  /** Parses `text` into a document (ids reused from the previous load). */
  parse(text: string, previousDoc?: Doc): Doc {
    const { doc, snapshot } = parseMarkdown(text, {
      previous: this.snapshot,
      previousDoc: previousDoc as never,
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
        const id = previousDoc?.blocks[0] && isEmptyTitle(previousDoc.blocks[0]) ? previousDoc.blocks[0].id : crypto.randomUUID();
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
    const doc = editor.getJSON() as Doc;
    const blocks = [...doc.blocks];
    if (this.syntheticTitleId && blocks[0]?.id === this.syntheticTitleId && isEmptyTitle(blocks[0])) {
      blocks.shift();
    }
    const { text, map, snapshot } = serializeMarkdown({ version: doc.version, blocks } as never, this.snapshot);
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
