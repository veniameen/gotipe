import { flattenBlocks } from "../../document/tree";
import type { GoTipeEditor } from "../../types/editor";
import { defineExtension } from "../../types/extension";
import type { TransactionContext } from "../../types/state";
import type { BlockView } from "../../types/view";
import { editorScoped, stateListeners } from "../scoped";
import { countCharacters, countWords, fitCharacters } from "./count";

export { countCharacters, countText, countWords, fitCharacters } from "./count";

export interface CharacterCountOptions {
  /**
   * Most characters the document may hold, or `null` for no limit. Typing past it is
   * rejected; plain-text paste is cut to fit. Changes that do not add characters are allowed
   * even above it (a document loaded over the limit can still be shortened).
   */
  limit: number | null;
  /** Locale for word boundaries; the platform's default when omitted. */
  locale?: string;
}

export interface CharacterCountState {
  /** Grapheme clusters in all text of the document; block boundaries do not count. */
  characters: number;
  words: number;
  limit: number | null;
  /** `limit - characters`, negative above the limit; `null` without a limit. */
  remaining: number | null;
}

/** A document block or its view: only the text and the children are read. */
interface TextBlock {
  id: string;
  content: { text: string }[] | string | null;
  children: readonly TextBlock[];
}
const textOf = (block: TextBlock) =>
  Array.isArray(block.content)
    ? block.content.map((span) => span.text).join("")
    : typeof block.content === "string"
      ? block.content
      : "";

/** Counts of one editor, kept per block so an edit recounts only the blocks it changed. */
export class CharacterCountController {
  private counts = new Map<string, { text: string; characters: number; words: number }>();
  private state: CharacterCountState;
  private listeners;
  private stops: (() => void)[] = [];

  constructor(
    private editor: GoTipeEditor,
    private options: CharacterCountOptions,
  ) {
    this.listeners = stateListeners<CharacterCountState>(editor, "characterCount");
    this.state = this.measure(editor.getViewState().blocks);
    this.stops.push(editor.on("update", () => this.refresh()));
    if (this.limit !== null)
      this.stops.push(editor.addTransactionFilter((context) => this.accepts(context)));
  }

  getState(): CharacterCountState {
    return this.state;
  }

  characters(): number {
    return this.state.characters;
  }

  words(): number {
    return this.state.words;
  }

  /** Called with the new state whenever a count changes. */
  subscribe(listener: (state: CharacterCountState) => void): () => void {
    return this.listeners.add(listener);
  }

  /** Plain text cut to the characters that still fit, counting the selection it replaces. */
  fit(text: string): string {
    const limit = this.limit;
    if (limit === null) return text;
    const room = limit - this.state.characters + this.selectedCharacters();
    return fitCharacters(text, room);
  }

  destroy(): void {
    for (const stop of this.stops.splice(0)) stop();
    this.listeners.clear();
  }

  private get limit(): number | null {
    const { limit } = this.options;
    return typeof limit === "number" && Number.isFinite(limit)
      ? Math.max(0, Math.floor(limit))
      : null;
  }

  private accepts({ before, after }: TransactionContext): boolean {
    const limit = this.limit!;
    const next = this.total(after.blocks, false).characters;
    return next <= limit || next <= this.total(before.blocks, false).characters;
  }

  private refresh(): void {
    const state = this.measure(this.editor.getViewState().blocks);
    if (state.characters === this.state.characters && state.words === this.state.words) return;
    this.state = state;
    this.listeners.notify(state);
  }

  private measure(blocks: readonly TextBlock[]): CharacterCountState {
    const { characters, words } = this.total(blocks, true);
    const limit = this.limit;
    return { characters, words, limit, remaining: limit === null ? null : limit - characters };
  }

  /** `prune` drops counts of blocks the document no longer has. */
  private total(blocks: readonly TextBlock[], prune: boolean) {
    const seen = new Set<string>();
    let characters = 0;
    let words = 0;
    for (const block of flattenBlocks(blocks as BlockView[])) {
      if (block.content === null) continue;
      const text = textOf(block);
      let counted = this.counts.get(block.id);
      if (counted?.text !== text) {
        counted = {
          text,
          characters: countCharacters(text),
          words: countWords(text, this.options.locale),
        };
        this.counts.set(block.id, counted);
      }
      seen.add(block.id);
      characters += counted.characters;
      words += counted.words;
    }
    if (prune) for (const id of this.counts.keys()) if (!seen.has(id)) this.counts.delete(id);
    return { characters, words };
  }

  private selectedCharacters(): number {
    const { selection, blocks } = this.editor.getViewState();
    const { anchor, head } = selection;
    if (anchor.blockId === head.blockId && anchor.offset === head.offset) return 0;
    const flat = flattenBlocks(blocks).filter((block) => block.content !== null);
    const covered =
      selection.type === "text"
        ? (() => {
            const a = flat.findIndex((block) => block.id === anchor.blockId);
            const b = flat.findIndex((block) => block.id === head.blockId);
            if (a < 0 || b < 0) return [];
            const [start, end] =
              a < b || (a === b && anchor.offset <= head.offset) ? [anchor, head] : [head, anchor];
            return flat.slice(Math.min(a, b), Math.max(a, b) + 1).map((block) => {
              const text = textOf(block);
              return text.slice(
                block.id === start.blockId ? start.offset : 0,
                block.id === end.blockId ? end.offset : text.length,
              );
            });
          })()
        : [];
    return covered.reduce((sum, text) => sum + countCharacters(text), 0);
  }
}

const controllers = editorScoped<CharacterCountController>();

/**
 * Words and characters of the document, and an optional character limit enforced by a
 * transaction filter. Read it with `getCharacterCount(editor)`.
 */
export const CharacterCount = defineExtension<CharacterCountOptions>({
  name: "characterCount",
  options: { limit: null },
  transformPastedText(text, { editor }) {
    return controllers.get(editor)?.fit(text) ?? text;
  },
  onCreate(editor) {
    controllers.attach(
      editor,
      new CharacterCountController(editor, { limit: null, ...this.options }),
    );
  },
  onDestroy(editor) {
    controllers.detach(editor);
  },
});

/** The counts of an editor with `CharacterCount`; `null` without it or after destroy. */
export function getCharacterCount(editor: GoTipeEditor): CharacterCountController | null {
  return controllers.get(editor);
}
