import { GoTipeError } from "../../error";
import type { GoTipeEditor } from "../../types/editor";
import { type TriggerRules, detectTrigger } from "./detect";
import type {
  SuggestionCloseReason,
  SuggestionEvent,
  SuggestionOptions,
  SuggestionRange,
  SuggestionState,
} from "./types";

const isAbort = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { name?: unknown }).name === "AbortError";

/** The caret's rectangle when the DOM selection is inside the mounted editor. */
function caretRect(editor: GoTipeEditor): DOMRect | null {
  const element = editor.element;
  if (!element || typeof document === "undefined") return null;
  const selection = document.getSelection();
  if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0);
  return typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
}

/** One editor's suggestion: detection, item requests, keyboard state and events. */
export class SuggestionController<Item> {
  private current: SuggestionState<Item> | null = null;
  private request: AbortController | null = null;
  /** A trigger closed by Escape or selection stays closed until the caret leaves it. */
  private suppressed: { blockId: string; from: number } | null = null;
  private selecting = false;
  private destroyed = false;
  private readonly stops: (() => void)[];

  constructor(
    private readonly editor: GoTipeEditor,
    private readonly options: SuggestionOptions<Item>,
    private readonly rules: TriggerRules,
    private readonly emit: (event: SuggestionEvent<Item>) => void,
  ) {
    const refresh = () => this.refresh();
    this.stops = [
      editor.on("update", refresh),
      editor.on("selectionChange", refresh),
      // A menu without the editor's focus would take keys meant elsewhere.
      editor.on("blur", () => this.close("blur")),
    ];
    this.refresh();
  }

  get state(): SuggestionState<Item> | null {
    return this.current;
  }

  refresh(): void {
    if (this.destroyed || this.selecting) return;
    const found = detectTrigger(this.editor.getViewState(), this.rules);
    const suppressed = this.suppressed;
    if (found && suppressed?.blockId === found.blockId && suppressed.from === found.from) {
      if (this.current) this.close("caret");
      return;
    }
    this.suppressed = null;
    if (!found) {
      if (this.current) this.close("caret");
      return;
    }
    const previous = this.current;
    const range: SuggestionRange = { blockId: found.blockId, from: found.from, to: found.to };
    const sameTrigger =
      previous?.range.blockId === range.blockId && previous.range.from === range.from;
    if (sameTrigger && previous.query === found.query && previous.range.to === range.to) return;
    if (sameTrigger && previous.query === found.query) {
      this.current = { ...previous, range, rect: caretRect(this.editor) };
      this.emit({ type: "update", editor: this.editor, state: this.current });
      return;
    }
    this.current = {
      query: found.query,
      range,
      items: sameTrigger ? previous.items : [],
      selectedIndex: 0,
      loading: true,
      rect: caretRect(this.editor),
    };
    const type = sameTrigger ? "update" : "open";
    if (!sameTrigger && previous)
      this.emit({ type: "close", editor: this.editor, reason: "caret" });
    this.load(found.query, type);
  }

  /** Requests items for `query`; a newer request aborts it and its result is ignored. */
  private load(query: string, type: "open" | "update"): void {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const settle = (items: Item[]) => {
      if (this.request !== request || !this.current || request.signal.aborted) return;
      this.request = null;
      this.current = { ...this.current, items, selectedIndex: 0, loading: false };
      this.emit({ type: "update", editor: this.editor, state: this.current });
    };
    const fail = (error: unknown) => {
      if (isAbort(error) || this.request !== request) return;
      settle([]);
      this.editor.reportError(
        new GoTipeError(
          "EXTENSION_ERROR",
          error instanceof Error ? error.message : "Suggestion items failed",
          { extension: this.options.name ?? `suggestion:${this.options.char}` },
        ),
      );
    };
    let result: Item[] | Promise<Item[]>;
    try {
      result = this.options.source
        ? this.options.source.search(query, { signal: request.signal })
        : this.options.items!(query, { signal: request.signal, editor: this.editor });
    } catch (error) {
      this.emit({ type, editor: this.editor, state: this.current! });
      fail(error);
      return;
    }
    if (Array.isArray(result)) {
      this.request = null;
      this.current = { ...this.current!, items: result, loading: false };
      this.emit({ type, editor: this.editor, state: this.current });
      return;
    }
    this.emit({ type, editor: this.editor, state: this.current! });
    Promise.resolve(result).then(settle, fail);
  }

  move(delta: 1 | -1): boolean {
    const state = this.current;
    if (!state) return false;
    if (state.items.length) {
      const count = state.items.length;
      this.current = { ...state, selectedIndex: (state.selectedIndex + delta + count) % count };
      this.emit({ type: "update", editor: this.editor, state: this.current });
    }
    return true;
  }

  select(index?: number): boolean {
    const state = this.current;
    // Items still loading belong to the previous query: nothing current to choose.
    const item = state?.loading ? undefined : state?.items[index ?? state.selectedIndex];
    if (!state || item === undefined) return false;
    this.selecting = true;
    try {
      this.options.onSelect(item, {
        editor: this.editor,
        range: { ...state.range },
        query: state.query,
      });
    } catch (error) {
      this.editor.reportError(
        new GoTipeError(
          "EXTENSION_ERROR",
          error instanceof Error ? error.message : "Suggestion selection failed",
        ),
      );
    } finally {
      this.selecting = false;
    }
    this.emit({ type: "select", editor: this.editor, item, state });
    this.suppressed = { blockId: state.range.blockId, from: state.range.from };
    this.close("select");
    return true;
  }

  close(reason: SuggestionCloseReason): boolean {
    const state = this.current;
    if (!state) return false;
    if (reason === "escape")
      this.suppressed = { blockId: state.range.blockId, from: state.range.from };
    this.request?.abort();
    this.request = null;
    this.current = null;
    this.emit({ type: "close", editor: this.editor, reason });
    return true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.close("destroy");
    this.destroyed = true;
    for (const stop of this.stops.splice(0)) stop();
  }
}
