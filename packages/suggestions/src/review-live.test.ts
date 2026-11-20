import type { BlockView, Decoration } from "@gotipe/core";
import { parseMarkdown, serializeMarkdown } from "@gotipe/markdown";
import { describe, expect, it, vi } from "vitest";
import {
  type ReviewCache,
  type ReviewInput,
  computeReviewDecorations,
  createReviewCache,
  proposalsInDocumentOrder,
  revealDecorations,
} from "./review-decorations";
import type { ReviewLane, ReviewProposal } from "./review-types";

const PAGE = "# Plan\n\nThe first paragraph.\n\n## Next\n\nThe last paragraph.\n";
const LANES: ReviewLane[] = [{ id: "agent", name: "Agent", kind: "agent" }];

type Blocks = Extract<Decoration, { type: "blocks" }>;
type Widget = Extract<Decoration, { type: "widget" }>;

function toView(blocks: unknown[]): BlockView[] {
  return (blocks as BlockView[]).map((b) => ({
    ...b,
    decorations: [],
    children: toView(b.children),
  }));
}

function page(text: string) {
  const parsed = parseMarkdown(text);
  const out = serializeMarkdown(parsed.doc, parsed.snapshot);
  expect(out.text).toBe(text);
  return { blocks: toView(parsed.doc.blocks as unknown[]), text: out.text, map: out.map };
}

const parse = (fragment: string) => toView(parseMarkdown(fragment).doc.blocks as unknown[]);

function run(text: string, proposals: ReviewProposal[], extra: Partial<ReviewInput> = {}) {
  const doc = page(text);
  return {
    ...doc,
    ...computeReviewDecorations({ ...doc, parse, proposals, lanes: LANES, ...extra }),
  };
}

const plain = (b: BlockView) =>
  Array.isArray(b.content) ? b.content.map((span) => span.text).join("") : (b.content ?? "");
/** An insertion after the first paragraph, as a host writes a new section there. */
const below = (text: string) => ({
  before: "The first paragraph.",
  quote: "",
  after: "\n\n## Next",
  text,
});
/** An insertion inside the first paragraph. */
const inside = (text: string) => ({ before: "The first", quote: "", after: " paragraph.", text });
const live = (
  id: string,
  edit: ReviewProposal["edits"][number],
  more: Partial<ReviewProposal> = {},
) => ({ id, laneId: "agent", live: true, edits: [edit], ...more }) satisfies ReviewProposal;
const groups = (decorations: Decoration[]) =>
  decorations.filter((d): d is Blocks => d.type === "blocks");
const widgets = (decorations: Decoration[]) =>
  decorations.filter((d): d is Widget => d.type === "widget");

describe("a growing proposal (live)", () => {
  it("is pending and says live: no text to reveal, and its last inline piece ends the text", () => {
    const r = run(PAGE, [live("p", inside(" **bold** and plain"))]);
    expect(r.proposals[0]).toMatchObject({
      status: "pending",
      live: true,
      exact: true,
      insertedChars: 0,
    });
    const pieces = widgets(r.decorations);
    expect(pieces.map((w) => [w.text, w.className])).toEqual([
      ["bold", "gotipe-sug gotipe-sug-ins"],
      [" and plain ", "gotipe-sug gotipe-sug-ins gotipe-sug-live"],
    ]);
  });

  it("the same proposal without `live` is pending and has no end mark", () => {
    const r = run(PAGE, [{ ...live("p", inside(" more")), live: false }]);
    expect(r.proposals[0]).toMatchObject({ status: "pending", insertedChars: 5 });
    // an ordinary proposal's state has no `live` at all, as before there was one
    expect(r.proposals[0]).not.toHaveProperty("live");
    expect(JSON.stringify(r.decorations)).not.toContain("gotipe-sug-live");
  });

  it("marks the text of the last new block, the deepest one of a list", () => {
    const r = run(PAGE, [live("p", below("\n\nFirst new.\n\n- one\n- two\n  - deep **end**"))]);
    const [group] = groups(r.decorations);
    expect(group!.blocks.map((b) => b.type)).toEqual(["paragraph", "bulletList"]);
    const marked: [string, string | undefined][] = [];
    const walk = (block: BlockView) => {
      const own = block.decorations.some(
        (d) => "className" in d && d.className === "gotipe-sug-live",
      );
      for (const d of own ? block.decorations : [])
        if ("className" in d) marked.push([plain(block), d.className]);
      block.children.forEach(walk);
    };
    group!.blocks.forEach(walk);
    expect(marked).toEqual([
      ["deep end", "gotipe-sug-block-ins-text"],
      ["deep end", "gotipe-sug-live"],
    ]);
    // the mark is one piece of the text, its last run of marks: a renderer draws one element
    const deep = group!.blocks[1]!.children[1]!.children[0]!.children[0]!;
    expect(deep.decorations.at(-1)).toEqual({
      type: "inline",
      key: `${deep.id}:live`,
      blockId: deep.id,
      from: 5,
      to: 8,
      className: "gotipe-sug-live",
    });
    // the group itself keeps its class
    expect(group!.className).toBe("gotipe-sug gotipe-sug-block-ins");
  });

  it("marks a last block without text of its own on the block: an empty line, a code block", () => {
    const empty = groups(run(PAGE, [live("p", below("\n\nText.\n\n## "))]).decorations)[0]!;
    const heading = empty.blocks[1]!;
    expect(heading.type).toBe("heading");
    expect(heading.decorations).toEqual([
      {
        type: "node",
        key: `${heading.id}:live`,
        blockId: heading.id,
        className: "gotipe-sug-live",
      },
    ]);
    const code = groups(
      run(PAGE, [live("p", below("\n\n```js\nconst a = 1;\n```"))]).decorations,
    )[0]!;
    expect(code.blocks[0]).toMatchObject({ type: "codeBlock" });
    expect(code.blocks[0]!.decorations).toMatchObject([
      { type: "node", className: "gotipe-sug-live" },
    ]);
  });

  it("with no text yet stands where its text will start; a pending one stays without a place", () => {
    const r = run(PAGE, [live("p", below(""))]);
    const paragraph = r.blocks[1]!;
    const end = { blockId: paragraph.id, offset: "The first paragraph.".length };
    expect(r.decorations).toEqual([]);
    expect(r.proposals[0]).toMatchObject({
      status: "pending",
      live: true,
      position: end,
      insertEnd: end,
    });
    // a replacement: after the quote it will replace
    const replace = run(PAGE, [
      live("p", { before: "The ", quote: "first", after: " paragraph.", text: "" }),
    ]);
    const replaced = replace.blocks[1]!.id;
    expect(replace.proposals[0]!.insertEnd).toEqual({ blockId: replaced, offset: 9 });
    expect(replace.proposals[0]!.position).toEqual({ blockId: replaced, offset: 4 });
    const pending = run(PAGE, [{ id: "p", laneId: "agent", edits: [below("")] }]);
    expect(pending.proposals[0]).toMatchObject({
      status: "pending",
      position: null,
      insertEnd: null,
    });
  });

  it("is stale as any other when its anchor is not found, and still live: a hint keeps its place", () => {
    const r = run(PAGE.replace("## Next", "## Then"), [live("p", below("\n\nNew text."))]);
    expect(r.proposals[0]).toMatchObject({
      status: "stale",
      live: true,
      reason: "missing",
      insertedChars: 0,
    });
    expect(groups(r.decorations)[0]).toMatchObject({
      className: "gotipe-sug gotipe-sug-stale gotipe-sug-block-ins",
    });
    expect(JSON.stringify(r.decorations)).not.toContain("gotipe-sug-live");
    // the host says it is stale: so it is, live or not, and no reason is made up
    const told = run(PAGE, [live("p", below("\n\nNew text."), { status: "stale" })]);
    expect(told.proposals[0]).toMatchObject({ status: "stale", live: true, reason: undefined });
    expect(groups(told.decorations)[0]).toMatchObject({
      className: "gotipe-sug gotipe-sug-stale gotipe-sug-block-ins",
    });
  });

  it("reads its unfinished text through `liveText`; other proposals are read as they are", () => {
    const liveText = vi.fn((text: string) => text.replace("**", "\\*\\*"));
    const edit = inside(" **open");
    const r = run(
      PAGE,
      [live("a", edit), { id: "b", laneId: "agent", edits: [below("\n\n**x")] }],
      {
        liveText,
      },
    );
    expect(liveText.mock.calls).toEqual([[" **open"]]);
    // the diff takes the space both texts share: the new text stands after it
    expect(widgets(r.decorations).map((w) => w.text)).toEqual(["**open "]);
  });

  it("is ordered by its place like a pending one, a stale one last", () => {
    const r = run(PAGE, [
      {
        id: "gone",
        laneId: "agent",
        edits: [{ before: "", quote: "no such text", after: "", text: "x" }],
      },
      live("late", { before: "The last", quote: "", after: " paragraph.", text: " word" }),
      { id: "early", laneId: "agent", edits: [inside(" word")] },
    ]);
    expect(proposalsInDocumentOrder(r.blocks, r.proposals).map((p) => p.id)).toEqual([
      "early",
      "late",
      "gone",
    ]);
  });
});

describe("proposals that insert at one point", () => {
  const texts = (decorations: Decoration[]) =>
    groups(decorations).map((group) => group.blocks.map(plain).join("|"));

  it("stand by `order`, equal ones as listed; the states keep the list's order", () => {
    const r = run(PAGE, [
      live("c", below("\n\nThird."), { order: 3 }),
      live("a", below("\n\nFirst."), { order: 1 }),
      live("b", below("\n\nSecond."), { order: 1 }),
      { id: "d", laneId: "agent", edits: [below("\n\nNo order.")] },
    ]);
    expect(texts(r.decorations)).toEqual(["No order.", "First.", "Second.", "Third."]);
    expect(groups(r.decorations).every((group) => group.blockId === r.blocks[1]!.id)).toBe(true);
    expect(r.proposals.map((p) => p.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("keep their places while their texts grow", () => {
    const first = run(PAGE, [
      live("b", below("\n\nB"), { order: 2 }),
      live("a", below(""), { order: 1 }),
    ]);
    expect(texts(first.decorations)).toEqual(["B"]);
    const second = run(PAGE, [
      live("b", below("\n\nB grows.\n\nAnd more."), { order: 2 }),
      live("a", below("\n\nA starts."), { order: 1 }),
    ]);
    expect(texts(second.decorations)).toEqual(["A starts.", "B grows.|And more."]);
  });

  it("inside a line stand as listed, whatever their ids: a renderer orders widgets by key", () => {
    const r = run(PAGE, [
      { id: "p9", laneId: "agent", edits: [inside(" nine")] },
      { id: "p10", laneId: "agent", edits: [inside(" ten")] },
      { id: "p1", laneId: "agent", order: -1, edits: [inside(" one")] },
    ]);
    const drawn = widgets(r.decorations).sort((a, b) => a.key.localeCompare(b.key));
    expect(drawn.map((w) => w.text)).toEqual(["one ", "nine ", "ten "]);
    expect(new Set(drawn.map((w) => `${w.blockId}:${w.offset}`)).size).toBe(1);
  });

  it("the reveal still finds a proposal's own text", () => {
    const r = run(PAGE, [
      { id: "p9", laneId: "agent", edits: [inside(" nine")] },
      { id: "p", laneId: "agent", edits: [inside(" ten")] },
    ]);
    const partial = revealDecorations(r.decorations, "p", 2);
    expect(widgets(partial).map((w) => w.text)).toEqual(["nine ", "te"]);
  });
});

describe("what a renderer keeps while a text grows", () => {
  it("a new block's id and its group's key name its place, not its text", () => {
    const one = groups(run(PAGE, [live("p", below("\n\nOne.\n\n- a"))]).decorations)[0]!;
    const two = groups(
      run(PAGE, [live("p", below("\n\nOne.\n\n- a\n- b\n\nThree."))]).decorations,
    )[0]!;
    expect(two.key).toBe(one.key);
    expect(two.blocks.slice(0, 2).map((b) => b.id)).toEqual(one.blocks.map((b) => b.id));
    expect(two.blocks[1]!.children[0]!.id).toBe(one.blocks[1]!.children[0]!.id);
    const ids = new Set<string>();
    const walk = (block: BlockView) => {
      ids.add(block.id);
      block.children.forEach(walk);
    };
    two.blocks.forEach(walk);
    expect(ids.size).toBe(5);
  });

  it("with a cache binds again only the proposal whose object changed", () => {
    const doc = page(PAGE);
    const counting = vi.fn(parse);
    const cache = createReviewCache();
    const still: ReviewProposal = { id: "still", laneId: "agent", edits: [inside(" word")] };
    const comments = [
      {
        id: "c",
        laneId: "agent",
        anchor: { before: "The ", quote: "last", after: " paragraph" },
        text: "?",
      },
    ];
    const call = (grown: string, activeId: string | null = null) =>
      computeReviewDecorations({
        ...doc,
        parse: counting,
        lanes: LANES,
        comments,
        proposals: [still, live("grows", below(grown))],
        activeId,
        cache,
      });
    const first = call("\n\nOne.\n\nTwo");
    expect(counting).toHaveBeenCalledTimes(2);
    const second = call("\n\nOne.\n\nTwo and more");
    // only the grown proposal was parsed again
    expect(counting).toHaveBeenCalledTimes(3);
    const of = (out: typeof first, id: string) =>
      out.decorations.filter((d) => "attrs" in d && d.attrs?.["data-gotipe-proposal"] === id);
    expect(of(second, "still")).toHaveLength(1);
    expect(of(second, "still")[0]).toBe(of(first, "still")[0]);
    expect(second.proposals[0]).toBe(first.proposals[0]);
    expect(second.comments[0]).toBe(first.comments[0]);
    expect(second.decorations.at(-1)).toBe(first.decorations.at(-1));
    // of the grown one, the block that did not change is the same object; its state too
    const was = groups(first.decorations)[0]!;
    const now = groups(second.decorations)[0]!;
    expect(now).not.toBe(was);
    expect(now.blocks[0]).toBe(was.blocks[0]);
    expect(now.blocks[1]).not.toBe(was.blocks[1]);
    expect(now.attrs).toBe(was.attrs);
    expect(now.style).toBe(was.style);
    expect(second.proposals[1]).toBe(first.proposals[1]);
    // nothing changed (the grown proposal is a new object with the same values): nothing is parsed
    const third = call("\n\nOne.\n\nTwo and more");
    expect(counting).toHaveBeenCalledTimes(3);
    expect(third.decorations).toEqual(second.decorations);
    expect(third.decorations.every((d, index) => d === second.decorations[index])).toBe(true);
    // an opened card redraws its own proposal only
    const opened = call("\n\nOne.\n\nTwo and more", "still");
    expect(counting).toHaveBeenCalledTimes(4);
    expect(of(opened, "still")[0]).toMatchObject({
      className: "gotipe-sug gotipe-sug-ins is-active",
    });
    expect(groups(opened.decorations)[0]!.blocks[1]).toBe(now.blocks[1]);
  });

  it("with a cache binds everything again for another text, and forgets what is gone", () => {
    const cache = createReviewCache();
    const counting = vi.fn(parse);
    const proposal: ReviewProposal = { id: "p", laneId: "agent", edits: [inside(" word")] };
    const call = (text: string, proposals: ReviewProposal[]) =>
      computeReviewDecorations({ ...page(text), parse: counting, lanes: LANES, proposals, cache });
    call(PAGE, [proposal]);
    call(`${PAGE}\nOne more.\n`, [proposal]);
    expect(counting).toHaveBeenCalledTimes(2);
    call(PAGE, []);
    const back = call(PAGE, [proposal]);
    expect(counting).toHaveBeenCalledTimes(3);
    expect(back.proposals[0]).toMatchObject({ id: "p", status: "pending" });
  });

  it("a cache has nothing to read or set, and an object it was not made as is no cache", () => {
    const cache = createReviewCache();
    expect(Object.keys(cache)).toEqual([]);
    expect(Object.getOwnPropertySymbols(cache)).toEqual([]);
    expect(Object.isFrozen(cache)).toBe(true);
    const doc = page(PAGE);
    const counting = vi.fn(parse);
    const proposals = [live("a", below("\n\nA."))];
    const call = (given: unknown) =>
      computeReviewDecorations({
        ...doc,
        parse: counting,
        lanes: LANES,
        proposals,
        cache: given as ReviewCache,
      });
    const plainCall = computeReviewDecorations({ ...doc, parse, lanes: LANES, proposals });
    // a look-alike binds everything each time, as no cache does
    expect(call({ proposals: new Map(), comments: new Map(), call: 0 })).toEqual(plainCall);
    expect(call({})).toEqual(plainCall);
    expect(counting).toHaveBeenCalledTimes(2);
    // each cache is its own: one editor's does not answer for another's
    call(cache);
    call(cache);
    expect(counting).toHaveBeenCalledTimes(3);
    call(createReviewCache());
    expect(counting).toHaveBeenCalledTimes(4);
  });

  it("without a cache gives the same result", () => {
    const proposals = [live("a", below("\n\nA.\n\n- x"), { order: 2 }), live("b", inside(" `c"))];
    const doc = page(PAGE);
    const plainCall = computeReviewDecorations({ ...doc, parse, lanes: LANES, proposals });
    const cache = createReviewCache();
    const cachedCall = () =>
      computeReviewDecorations({ ...doc, parse, lanes: LANES, proposals, cache });
    expect(cachedCall()).toEqual(plainCall);
    expect(cachedCall()).toEqual(plainCall);
  });
});
