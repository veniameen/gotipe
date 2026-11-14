import { flattenBlocks } from "../../document/tree";
import type { BlockView } from "../../types/view";
import { unsafePattern } from "./guard";
import { scanText } from "./scan";

/** What to look for. Plain queries match literally; `regex` takes JavaScript syntax. */
export interface SearchQuery {
  query: string;
  caseSensitive: boolean;
  /** Matches must not touch a letter, digit, combining mark or `_` on either side. */
  wholeWord: boolean;
  regex: boolean;
}

/** A match `[from, to)` in UTF-16 offsets of one block's text. Matches never span blocks. */
export interface SearchMatch {
  blockId: string;
  from: number;
  to: number;
}

export type SearchErrorCode = "INVALID_PATTERN" | "UNSAFE_PATTERN" | "TIMEOUT";
export interface SearchFailure {
  code: SearchErrorCode;
  message: string;
}

export interface CompiledSearch {
  pattern: RegExp;
  source: string;
  flags: string;
  wholeWord: boolean;
  /** The query is a regular expression; plain queries cannot backtrack. */
  regex: boolean;
  /** Identifies the compiled search in caches. */
  key: string;
}

/** A searched block and the content its matches belong to: spans, or raw text. */
export interface SearchTarget {
  blockId: string;
  content: readonly { text: string }[] | string;
}

/** The ranges of one content for one search: `from, to` pairs. */
export interface CacheEntry {
  content: SearchTarget["content"];
  key: string;
  ranges: number[];
}
export type SearchCache = Map<string, CacheEntry>;

const MAX_QUERY = 1000;
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** `null` for an empty query; `INVALID_PATTERN` for a pattern that does not compile. */
export function compileSearch(search: SearchQuery): CompiledSearch | SearchFailure | null {
  if (!search.query) return null;
  if (search.query.length > MAX_QUERY)
    return { code: "INVALID_PATTERN", message: "The search is longer than 1000 characters" };
  const source = search.regex ? search.query : search.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let pattern: RegExp;
  try {
    pattern = new RegExp(source, search.caseSensitive ? "gu" : "giu");
  } catch (error) {
    return {
      code: "INVALID_PATTERN",
      message: error instanceof Error ? error.message : "Invalid regular expression",
    };
  }
  return {
    pattern,
    source,
    flags: pattern.flags,
    wholeWord: search.wholeWord,
    regex: search.regex,
    key: `${pattern.flags}:${search.wholeWord}:${source}`,
  };
}

/**
 * `UNSAFE_PATTERN` for a regular expression that may backtrack without end: such a pattern runs
 * only in a Worker, which is terminated when it runs out of time.
 */
export function guardSearch(search: CompiledSearch): SearchFailure | null {
  if (!search.regex || !unsafePattern(search.source, search.flags.includes("i"))) return null;
  return {
    code: "UNSAFE_PATTERN",
    message: "The pattern can backtrack without end and no Worker is available to stop it",
  };
}

export function timeoutFailure(): SearchFailure {
  return { code: "TIMEOUT", message: "The search took longer than its time budget" };
}

/** Searched blocks in document order (depth first, parents first) and the order of all blocks. */
export function searchTargets(
  blocks: readonly BlockView[],
  includeRaw: boolean,
): { targets: SearchTarget[]; order: Map<string, number> } {
  const targets: SearchTarget[] = [];
  const order = new Map<string, number>();
  for (const block of flattenBlocks(blocks as BlockView[])) {
    order.set(block.id, order.size);
    const content = block.content;
    if (Array.isArray(content) || (typeof content === "string" && includeRaw))
      targets.push({ blockId: block.id, content });
  }
  return { targets, order };
}

export function targetText(target: SearchTarget): string {
  const content = target.content;
  return typeof content === "string" ? content : content.map((span) => span.text).join("");
}

/** The cached ranges of `target` for the search `key`; `undefined` when it must be searched. */
export function cachedRanges(cache: SearchCache, target: SearchTarget, key: string) {
  const entry = cache.get(target.blockId);
  return entry && entry.key === key && entry.content === target.content ? entry.ranges : undefined;
}

/** Searches `targets` on this thread into `cache`; `false` when the time budget ran out. */
export function scanTargets(
  targets: readonly SearchTarget[],
  search: CompiledSearch,
  cache: SearchCache,
  timeout: number,
): boolean {
  const deadline = now() + timeout;
  for (const target of targets) {
    const ranges = scanText(targetText(target), search.pattern, search.wholeWord, deadline);
    if (!ranges) return false;
    cache.set(target.blockId, { content: target.content, key: search.key, ranges });
    if (now() > deadline) return false;
  }
  return true;
}

/** The first `limit` matches in document order; blocks without cached ranges have none yet. */
export function collectMatches(
  targets: readonly SearchTarget[],
  cache: SearchCache,
  key: string,
  limit: number,
): { matches: SearchMatch[]; truncated: boolean } {
  const matches: SearchMatch[] = [];
  for (const target of targets) {
    const ranges = cachedRanges(cache, target, key) ?? [];
    for (let index = 0; index < ranges.length; index += 2) {
      if (matches.length >= limit) return { matches, truncated: true };
      matches.push({ blockId: target.blockId, from: ranges[index]!, to: ranges[index + 1]! });
    }
  }
  return { matches, truncated: false };
}
