import type { GoTipeEditor } from "../../types/editor";

/** The trigger and query in one block: `from` is the trigger's offset, `to` the caret's. */
export interface SuggestionRange {
  blockId: string;
  from: number;
  to: number;
}

/** A provider of items, such as the emoji table of `@gotipe/core/emoji`. */
export interface SuggestionSource<Item> {
  search(query: string, context: { signal: AbortSignal }): Item[] | Promise<Item[]>;
}

export interface SuggestionSelectContext {
  editor: GoTipeEditor;
  range: SuggestionRange;
  query: string;
}

export interface SuggestionOptions<Item> {
  /** Extension name; `suggestion:<char>` by default, so `@` and `:` can coexist. */
  name?: string;
  /** The trigger, such as `@` or `:`. */
  char: string;
  /** Single spaces may be part of the query (never a leading space or a line break). */
  allowSpaces?: boolean;
  /** The trigger opens only at the start of a block or after whitespace (default). */
  startOfWord?: boolean;
  /** Longest query that keeps the suggestion open (default 50). */
  maxQueryLength?: number;
  /** Items for a query. Give this or `source`. A stale query's signal is aborted. */
  items?: (
    query: string,
    context: { signal: AbortSignal; editor: GoTipeEditor },
  ) => Item[] | Promise<Item[]>;
  /** Items from a provider. Give this or `items`. */
  source?: SuggestionSource<Item>;
  /** Applies the chosen item, usually replacing `range` with an atom or text. */
  onSelect: (item: Item, context: SuggestionSelectContext) => void;
}

export interface SuggestionState<Item> {
  query: string;
  range: SuggestionRange;
  items: Item[];
  selectedIndex: number;
  /** Items for the current query are still being read. */
  loading: boolean;
  /** The caret's rectangle in the viewport when the editor is mounted, else `null`. */
  rect: DOMRect | null;
}

export type SuggestionCloseReason = "escape" | "select" | "caret" | "blur" | "destroy";

export type SuggestionEvent<Item> =
  | { type: "open" | "update"; editor: GoTipeEditor; state: SuggestionState<Item> }
  | { type: "select"; editor: GoTipeEditor; item: Item; state: SuggestionState<Item> }
  | { type: "close"; editor: GoTipeEditor; reason: SuggestionCloseReason };
