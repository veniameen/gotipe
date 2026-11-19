import type { Decoration } from "@gotipe/core";
import type { CommentState, ProposalState, ReviewComment, ReviewProposal } from "../review-types";
import type { ReviewInput } from "./input";
import { sameData } from "./keep";

/** What a proposal or a comment gave last time, and from what. */
interface Entry<Item, State> {
  item: Item;
  text: string;
  map: ReviewInput["map"];
  parse: ReviewInput["parse"];
  liveText: ReviewInput["liveText"];
  color: string | undefined;
  active: boolean;
  rank: number;
  state: State;
  decorations: Decoration[];
  /** The call that last used it. */
  call: number;
}

/**
 * What `computeReviewDecorations` found last time, kept by its caller (one per editor). With
 * it a proposal or a comment is bound again only when it (its object, or the values of a new
 * one), the document's text and map, its lane's colour, its place among the others or its
 * being open changed; otherwise its state and decorations are the same objects as before. Made
 * by `createReviewCache()`.
 */
export interface ReviewCache {
  /** @internal */
  readonly proposals: Map<string, Entry<ReviewProposal, ProposalState>>;
  /** @internal */
  readonly comments: Map<string, Entry<ReviewComment, CommentState>>;
  /** @internal */
  call: number;
}

export function createReviewCache(): ReviewCache {
  return { proposals: new Map(), comments: new Map(), call: 0 };
}

/**
 * The entry of `item` when it still holds for `input`, else undefined. `rank` is the item's
 * place among the others (0 where it does not matter).
 */
export function cached<Item, State>(
  entries: Map<string, Entry<Item, State>>,
  id: string,
  item: Item,
  input: ReviewInput,
  color: string | undefined,
  rank: number,
): Entry<Item, State> | undefined {
  const entry = entries.get(id);
  if (
    !entry ||
    entry.map !== input.map ||
    entry.text !== input.text ||
    entry.parse !== input.parse ||
    entry.liveText !== input.liveText ||
    entry.color !== color ||
    entry.rank !== rank ||
    entry.active !== (input.activeId === id)
  )
    return undefined;
  // a host often builds its proposals anew on every render: the same values are the same item
  if (entry.item !== item) {
    if (!sameData(entry.item, item)) return undefined;
    entry.item = item;
  }
  return entry;
}

export function remember<Item, State>(
  cache: ReviewCache,
  entries: Map<string, Entry<Item, State>>,
  id: string,
  item: Item,
  input: ReviewInput,
  color: string | undefined,
  rank: number,
  state: State,
  decorations: Decoration[],
): void {
  entries.set(id, {
    item,
    text: input.text,
    map: input.map,
    parse: input.parse,
    liveText: input.liveText,
    color,
    active: input.activeId === id,
    rank,
    state,
    decorations,
    call: cache.call,
  });
}

/** Drops what the call just made did not use: its proposals and comments are gone. */
export function forget(cache: ReviewCache): void {
  for (const entries of [cache.proposals, cache.comments]) {
    for (const [id, entry] of entries) if (entry.call !== cache.call) entries.delete(id);
  }
}
