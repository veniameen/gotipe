import { findBlockInTree, flattenBlocks } from "../../document/tree";
import type { GoTipeEditor } from "../../types/editor";
import type { Step } from "../../types/state";
import type { Decoration } from "../../types/view";
import { stateListeners } from "../scoped";
import { replaceSteps } from "./replace";
import {
  type CompiledSearch,
  type SearchCache,
  type SearchFailure,
  type SearchMatch,
  type SearchQuery,
  type SearchTarget,
  cachedRanges,
  collectMatches,
  compileSearch,
  guardSearch,
  scanTargets,
  searchTargets,
  targetText,
  timeoutFailure,
} from "./search";
import { ScanWorker } from "./worker";

export interface FindReplaceOptions {
  /** Search raw-text blocks (code, formulas, raw Markdown) too. Default `false`. */
  includeRaw: boolean;
  /** Most matches found and highlighted; beyond it the state is `truncated`. Default 1000. */
  maxMatches: number;
  /** Milliseconds one search may take before it stops with `TIMEOUT`. Default 200. */
  timeout: number;
  /** Class of every match in the `search` decoration layer. */
  matchClass: string;
  /** Added to the class of the current match. */
  currentClass: string;
}

export interface FindReplaceState extends SearchQuery {
  /** Matches in document order. */
  matches: readonly SearchMatch[];
  /** Index of the current match; -1 without matches. */
  index: number;
  /** The current match counted from 1, for "3 of 12"; 0 without matches. */
  position: number;
  total: number;
  /** More than `maxMatches` matches exist; `total` counts the first `maxMatches`. */
  truncated: boolean;
  /** Why the search found nothing: an invalid or unsafe pattern, or the time budget. */
  error: SearchFailure | null;
  /**
   * A regular-expression search is running in its Worker. `matches` holds the matches of the
   * blocks searched already; the changed blocks follow when the Worker answers.
   */
  pending: boolean;
}

/** The decoration layer of matches. */
export const SEARCH_LAYER = "search";

type Point = { blockId: string; offset: number };

/**
 * One editor's search: state, `search` decorations and replacement as one undo step. Plain
 * queries run on the page; regular expressions run in a Worker that is terminated when the time
 * budget runs out, or, without Workers, on the page when the static check lets them.
 */
export class FindReplaceController {
  private query: SearchQuery = { query: "", caseSensitive: false, wholeWord: false, regex: false };
  private compiled: CompiledSearch | SearchFailure | null = null;
  private state: FindReplaceState;
  /** Ranges per block for the content and search they were found for. */
  private cache: SearchCache = new Map();
  private runner: ScanWorker | null = null;
  /** Counts refreshes: a Worker answer for an older one only fills the cache. */
  private generation = 0;
  /** The search that ran out of time: it shows `TIMEOUT` while it runs again. */
  private timedOut: string | null = null;
  private waiters: (() => void)[] = [];
  private listeners;
  private stop: () => void;
  /** Where the next current match is chosen from: the caret, or after a replacement. */
  private anchor: Point | null = null;
  private published = "";
  private painted = "";
  private destroyed = false;

  constructor(
    private editor: GoTipeEditor,
    private options: FindReplaceOptions,
  ) {
    this.listeners = stateListeners<FindReplaceState>(editor, "findReplace");
    this.state = this.empty(null);
    this.published = this.key(this.state);
    this.stop = editor.on("update", () => this.refresh());
  }

  getState(): FindReplaceState {
    return this.state;
  }

  /** Called with the new state after every change of query, matches or current match. */
  subscribe(listener: (state: FindReplaceState) => void): () => void {
    return this.listeners.add(listener);
  }

  /** Changes the search; the current match becomes the first one at or after the caret. */
  setSearch(search: Partial<SearchQuery>): FindReplaceState {
    if (this.destroyed) return this.state;
    this.query = {
      query: search.query ?? this.query.query,
      caseSensitive: search.caseSensitive ?? this.query.caseSensitive,
      wholeWord: search.wholeWord ?? this.query.wholeWord,
      regex: search.regex ?? this.query.regex,
    };
    this.compiled = compileSearch(this.query);
    const head = this.editor.getViewState().selection.head;
    this.anchor = head.blockId ? { ...head } : null;
    this.refresh();
    return this.state;
  }

  /** Clears the query, the matches and the decorations. */
  clear(): void {
    this.setSearch({ query: "" });
  }

  next(): SearchMatch | null {
    return this.step(1);
  }

  previous(): SearchMatch | null {
    return this.step(-1);
  }

  /** Puts the editor selection on the current match. */
  selectCurrent(): boolean {
    const match = this.state.matches[this.state.index];
    if (!match || this.destroyed) return false;
    this.editor.setSelection({
      anchor: { blockId: match.blockId, offset: match.from },
      head: { blockId: match.blockId, offset: match.to },
    });
    return true;
  }

  /**
   * Replaces the current match as one undoable step, after a running search finished. The new
   * text takes the marks of the match's first character; in regex mode `$1`, `$<name>` and `$&`
   * refer to the match.
   */
  async replace(replacement: string): Promise<boolean> {
    await this.settled();
    const match = this.state.matches[this.state.index];
    if (!match || !this.editor.isEditable || this.destroyed) return false;
    const block = findBlockInTree(this.editor.getViewState().blocks, match.blockId);
    const steps = block ? replaceSteps(block, match, replacement, this.regex()) : null;
    if (!steps) return false;
    const inserted = steps.length > 1 ? (steps[1] as { text: string }).text.length : 0;
    this.anchor = { blockId: match.blockId, offset: match.from + inserted };
    let applied = false;
    try {
      applied = this.editor.dispatch({ steps });
    } finally {
      if (!applied) this.anchor = null;
    }
    return applied;
  }

  /** Replaces every match, not only the first `maxMatches`, as one undoable step. */
  async replaceAll(replacement: string): Promise<number> {
    await this.settled();
    const search = this.compiled;
    if (!search || "code" in search || this.state.error) return 0;
    if (!this.editor.isEditable || this.destroyed) return 0;
    const { blocks } = this.editor.getViewState();
    const { targets } = searchTargets(blocks, this.options.includeRaw);
    const { matches } = collectMatches(targets, this.cache, search.key, Number.POSITIVE_INFINITY);
    const byId = new Map(flattenBlocks(blocks).map((block) => [block.id, block]));
    const steps: Step[] = [];
    let count = 0;
    // Later matches of a block first, so earlier offsets stay valid.
    for (let index = matches.length - 1; index >= 0; index--) {
      const match = matches[index]!;
      const block = byId.get(match.blockId);
      const replaced = block && replaceSteps(block, match, replacement, this.regex());
      if (!replaced) continue;
      steps.push(...replaced);
      count++;
    }
    if (!steps.length) return 0;
    const head = this.editor.getViewState().selection.head;
    this.anchor = head.blockId ? { ...head } : null;
    return this.editor.dispatch({ steps }) ? count : 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.runner?.destroy();
    this.listeners.clear();
    this.wake();
    if (!this.editor.isDestroyed) this.editor.setDecorations(SEARCH_LAYER, []);
  }

  /** Resolves when no search is running. */
  private async settled(): Promise<void> {
    while (this.state.pending && !this.destroyed)
      await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  private regex(): CompiledSearch | null {
    const search = this.compiled;
    return search && !("code" in search) && search.regex ? search : null;
  }

  private step(direction: 1 | -1): SearchMatch | null {
    const { total, index } = this.state;
    if (!total || this.destroyed) return null;
    const next = (index + direction + total) % total;
    this.anchor = null;
    this.publish({ ...this.state, index: next, position: next + 1 });
    return this.state.matches[next] ?? null;
  }

  private empty(error: SearchFailure | null): FindReplaceState {
    const state = { matches: [], index: -1, position: 0, total: 0, truncated: false };
    return { ...this.query, ...state, error, pending: false };
  }

  private fail(error: SearchFailure | null): void {
    this.anchor = null;
    this.publish(this.empty(error));
    this.wake();
  }

  /** Recomputes matches after a document or query change, keeping the current match. */
  private refresh(): void {
    if (this.destroyed) return;
    const generation = ++this.generation;
    const search = this.compiled;
    if (!search || "code" in search) {
      this.fail(search);
      return;
    }
    if (search.regex) this.runner ??= new ScanWorker();
    const inWorker = search.regex && this.runner!.usable;
    const refused = inWorker ? null : guardSearch(search);
    if (refused) {
      this.fail(refused);
      return;
    }
    const { blocks } = this.editor.getViewState();
    const { targets, order } = searchTargets(blocks, this.options.includeRaw);
    const cache: SearchCache = new Map();
    for (const { blockId } of targets) {
      const entry = this.cache.get(blockId);
      if (entry) cache.set(blockId, entry);
    }
    this.cache = cache;
    const missing = targets.filter((target) => !cachedRanges(cache, target, search.key));
    if (missing.length && !inWorker && !scanTargets(missing, search, cache, this.options.timeout)) {
      this.fail(timeoutFailure());
      return;
    }
    const pending = inWorker && missing.length > 0;
    if (pending) this.request(search, missing, generation);
    this.show(targets, order, search.key, pending);
    if (!pending) this.wake();
  }

  /** Searches `targets` in the Worker; the answer of the latest refresh refreshes again. */
  private request(search: CompiledSearch, targets: SearchTarget[], generation: number): void {
    const { source, flags, wholeWord, key } = search;
    const job = { source, flags, wholeWord, texts: targets.map(targetText) };
    void this.runner!.run(job, this.options.timeout).then((answer) => {
      if (!answer || this.destroyed) return;
      if (answer.kind === "done")
        targets.forEach((target, index) => {
          const ranges = answer.ranges[index] ?? [];
          this.cache.set(target.blockId, { content: target.content, key, ranges });
        });
      if (generation !== this.generation) return;
      if (answer.kind === "done" || answer.kind === "unavailable") this.refresh();
      else if (answer.kind === "error")
        this.fail({ code: "UNSAFE_PATTERN", message: answer.message });
      else {
        this.timedOut = key;
        this.fail(timeoutFailure());
      }
    });
  }

  /** Publishes the cached matches; while `pending` the changed blocks have none yet. */
  private show(
    targets: SearchTarget[],
    order: Map<string, number>,
    key: string,
    pending: boolean,
  ): void {
    if (pending && this.timedOut === key) {
      this.publish({ ...this.empty(timeoutFailure()), pending });
      return;
    }
    if (!pending) this.timedOut = null;
    const limit = Math.max(1, this.options.maxMatches);
    const { matches, truncated } = collectMatches(targets, this.cache, key, limit);
    const current = this.state.matches[this.state.index];
    const from =
      this.anchor ?? (current ? { blockId: current.blockId, offset: current.from } : null);
    // Until the Worker answers, the current match is chosen again from the same point.
    this.anchor = pending ? from : null;
    const rank = (blockId: string) => order.get(blockId) ?? -1;
    let index = -1;
    if (matches.length) {
      const at = from ? rank(from.blockId) : -1;
      if (from && at >= 0) {
        index = matches.findIndex((match) => {
          const block = rank(match.blockId);
          return block > at || (block === at && match.from >= from.offset);
        });
        if (index < 0) index = 0;
      } else index = Math.min(Math.max(this.state.index, 0), matches.length - 1);
    }
    this.publish({
      ...this.query,
      matches,
      index,
      position: index + 1,
      total: matches.length,
      truncated,
      error: null,
      pending,
    });
  }

  private key(state: FindReplaceState): string {
    return JSON.stringify([
      state.query,
      state.caseSensitive,
      state.wholeWord,
      state.regex,
      state.index,
      state.truncated,
      state.pending,
      state.error?.code ?? null,
      state.matches.map((match) => [match.blockId, match.from, match.to]),
    ]);
  }

  /** Replaces the state object only when something in it changed. */
  private publish(state: FindReplaceState): void {
    const key = this.key(state);
    if (key === this.published) return;
    this.published = key;
    this.state = state;
    this.paint();
    this.listeners.notify(state);
  }

  private paint(): void {
    const { matches, index } = this.state;
    const painted = JSON.stringify([index, matches]);
    if (painted === this.painted) return;
    this.painted = painted;
    const { matchClass, currentClass } = this.options;
    const decorations: Decoration[] = matches.map((match, position) => ({
      type: "inline",
      key: `search-${position}`,
      blockId: match.blockId,
      from: match.from,
      to: match.to,
      className: position === index ? `${matchClass} ${currentClass}` : matchClass,
      attrs: {
        "data-gotipe-search-match": String(position),
        ...(position === index ? { "data-gotipe-search-current": "" } : {}),
      },
    }));
    this.editor.setDecorations(SEARCH_LAYER, decorations);
  }
}
