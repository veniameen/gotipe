// @vitest-environment jsdom
import type { LaneCursor, ProposalState, ReviewProposal } from "@gotipe/suggestions";
import { act, createRef } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageEditor, type PageEditorHandle } from "../page/page-editor";
import type { PageReviewProps } from "./review-layer";

let container: HTMLDivElement;
let root: Root;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class NoResize {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("ResizeObserver", NoResize);
  vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/["\\]/g, "\\$&") });
  // a narrow window: a card opens by its text
  vi.stubGlobal("innerWidth", 300);
  const rect = { x: 50, y: 100, left: 50, top: 100, right: 50, bottom: 120, width: 0, height: 20 };
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON() {} }) as DOMRect;
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const MARKDOWN = "# Notes\n\nThe first paragraph with **bold** text.\n\n## Next\n\nThe last one.\n";
const lanes = [{ id: "agent", name: "Agent", kind: "agent" as const, color: "rgb(1, 2, 3)" }];
/** After the first paragraph: where a host writes a new section. */
const below = (text: string) => ({
  before: "with **bold** text.",
  quote: "",
  after: "\n\n## Next",
  text,
});
const live = (id: string, text: string, more: Partial<ReviewProposal> = {}): ReviewProposal => ({
  id,
  laneId: "agent",
  live: true,
  edits: [below(text)],
  ...more,
});

/** A page whose review the test replaces as a host does. */
async function mount(first: Partial<PageReviewProps> = {}) {
  const ref = createRef<PageEditorHandle>();
  const draw = (review: Partial<PageReviewProps>) =>
    root.render(
      <PageEditor
        ref={ref}
        locale="en"
        markdown={MARKDOWN}
        reviewLayout="inline"
        reviewBar={{ title: "Writing" }}
        review={{ lanes, proposals: [], ...review }}
      />,
    );
  await act(async () => {
    draw(first);
    await wait(60);
  });
  const show = async (review: Partial<PageReviewProps>, ms = 30) => {
    await act(async () => {
      draw(review);
      await wait(ms);
    });
  };
  return { ref, show };
}

const suggested = () =>
  [...container.querySelectorAll<HTMLElement>("[data-gotipe-phantom-id]")].filter(
    (element) => !element.parentElement?.closest("[data-gotipe-phantom-id]"),
  );
const texts = () => suggested().map((element) => element.textContent);

describe("a growing proposal on the page (live)", () => {
  it("shows its whole text at once, grows in place, and is not revealed when it stops growing", async () => {
    const { show } = await mount();
    // whole at once: nothing of it is held back for a reveal
    await show({ proposals: [live("p", "\n\nOne long paragraph.")] }, 0);
    expect(texts()).toEqual(["One long paragraph."]);
    const first = suggested()[0]!;
    await show({ proposals: [live("p", "\n\nOne long paragraph.\n\n- and a li")] }, 0);
    expect(texts()).toEqual(["One long paragraph.", "and a li"]);
    // the block written before is the same element: it was not drawn anew
    expect(suggested()[0]).toBe(first);
    const list = suggested()[1]!;
    // written: the same id without `live`, the same text, shown whole and in the same elements
    const done: ReviewProposal = {
      ...live("p", "\n\nOne long paragraph.\n\n- and a list"),
      live: false,
    };
    await show({ proposals: [done] }, 0);
    expect(texts()).toEqual(["One long paragraph.", "and a list"]);
    expect(suggested()[0]).toBe(first);
    expect(suggested()[1]).toBe(list);
    // an ordinary new proposal does reveal its text: right after it comes, not all of it is there
    const slow: ReviewProposal = {
      id: "slow",
      laneId: "agent",
      edits: [
        { before: "The last one.", quote: "", after: "", text: "\n\nRevealed letter by letter." },
      ],
    };
    await show({ proposals: [done, slow] }, 0);
    expect(texts().slice(0, 2)).toEqual(["One long paragraph.", "and a list"]);
    expect(texts().slice(2).join("").length).toBeLessThan("Revealed letter by letter.".length);
  });

  it("marks the end of its text with gotipe-sug-live, and only while it grows", async () => {
    const { show } = await mount({ proposals: [live("p", "\n\nOne.\n\nTwo **bo")] });
    const marked = () => [...container.querySelectorAll(".gotipe-sug-live")];
    expect(marked().map((element) => [element.tagName, element.textContent])).toEqual([
      ["SPAN", "Two **bo"],
    ]);
    expect(marked()[0]!.parentElement?.className).toBe("gotipe-sug-block-ins-text");
    // one element at the end of the text, whatever marks the text has: its last piece
    await show({ proposals: [live("p", "\n\nOne.\n\nTwo **bold**\n\n")] });
    expect(marked().map((element) => element.innerHTML)).toEqual(["<strong>bold</strong>"]);
    expect(marked()[0]!.closest("[data-gotipe-phantom-id]")?.textContent).toBe("Two bold");
    await show({ proposals: [{ ...live("p", "\n\nOne.\n\nTwo **bold**\n\n"), live: false }] });
    expect(marked()).toEqual([]);
    expect(texts()).toEqual(["One.", "Two bold"]);
  });

  it("takes no decision: no answers on its card, none through the handle or the bar", async () => {
    const onAccept = vi.fn(() => true);
    const onReject = vi.fn(() => true);
    const seen: ProposalState[][] = [];
    const review = {
      onAccept,
      onReject,
      onStatesChange: (states: { proposals: ProposalState[] }) => seen.push(states.proposals),
    };
    const pending: ReviewProposal = {
      id: "ready",
      laneId: "agent",
      reason: "Shorter",
      edits: [{ before: "The ", quote: "last", after: " one.", text: "final" }],
    };
    const growing = live("p", "\n\nNew text.", { reason: "A new section" });
    const { ref, show } = await mount({ ...review, proposals: [growing, pending] });
    expect(seen.at(-1)?.map((state) => [state.id, state.status, state.insertedChars])).toEqual([
      ["p", "live", 0],
      ["ready", "pending", 5],
    ]);
    // the bar counts what waits for an answer
    expect(container.querySelector(".gotipe-review-bar")?.textContent).toContain("1 suggestion");
    await act(async () => {
      ref.current!.review!.focus("p");
      await wait(30);
    });
    const card = document.querySelector<HTMLElement>('[data-gotipe-review-card="proposal"]')!;
    expect(card.hasAttribute("data-live")).toBe(true);
    expect(card.textContent).toContain("A new section");
    expect(card.querySelector("button")).toBeNull();
    await act(async () => {
      expect(await ref.current!.review!.accept("p")).toBe(false);
      expect(await ref.current!.review!.reject("p")).toBe(false);
      expect(await ref.current!.review!.rejectAll()).toBe(1);
    });
    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject.mock.calls).toEqual([["ready"]]);
    await act(async () => {
      expect(await ref.current!.review!.acceptAll()).toBe(1);
    });
    expect(onAccept.mock.calls).toEqual([["ready"]]);
    // the text grows: nothing new to tell the host about where the proposals stand
    const told = seen.length;
    await show({
      ...review,
      proposals: [live("p", "\n\nNew text grows.", { reason: "A new section" }), pending],
    });
    expect(seen.length).toBe(told);
    // written: its card has both answers, and it is accepted with the rest
    await show({ ...review, proposals: [{ ...growing, live: false }, pending] });
    expect(seen.at(-1)?.[0]).toMatchObject({ id: "p", status: "pending" });
    expect(document.querySelectorAll('[data-gotipe-review-card="proposal"] button')).toHaveLength(
      2,
    );
    expect(container.querySelector(".gotipe-review-bar")?.textContent).toContain("2 suggestions");
  });

  it("keeps the page's own marks whatever its unfinished end leaves open", async () => {
    const bold = () =>
      [...container.querySelectorAll("[data-block-id] strong")].map((b) => b.textContent);
    const inside = (text: string): ReviewProposal => ({
      id: "p",
      laneId: "agent",
      live: true,
      edits: [{ before: "The first", quote: "", after: " paragraph with", text }],
    });
    const { show } = await mount({ proposals: [inside(" new **op")] });
    expect(bold()).toEqual(["bold"]);
    expect(container.querySelector(".gotipe-sug-ins")?.textContent).toBe("new **op ");
    await show({ proposals: [inside(" new **open**")] });
    expect(container.querySelector(".gotipe-sug-ins strong")?.textContent).toBe("open");
    // an open code block holds the code so far and takes nothing of the page
    await show({ proposals: [live("p", "\n\n```js\nconst a = 1;")] });
    expect(suggested().map((element) => element.getAttribute("data-block-type"))).toEqual([
      "codeBlock",
    ]);
    expect(suggested()[0]!.textContent).toContain("const a = 1;");
    expect(container.querySelector("h2[data-block-id]")?.textContent).toBe("Next");
    expect(bold()).toEqual(["bold"]);
  });
});

describe("proposals that insert at one point", () => {
  it("stand by `order` and keep their places while they grow", async () => {
    const part = (id: string, order: number, text: string) => live(id, text, { order });
    const { show } = await mount({ proposals: [part("b", 2, "\n\n## B")] });
    expect(texts()).toEqual(["B"]);
    await show({ proposals: [part("b", 2, "\n\n## B\n\nB text"), part("a", 1, "\n\n## A")] });
    expect(texts()).toEqual(["A", "B", "B text"]);
    const heading = suggested()[1]!;
    await show({
      proposals: [part("b", 2, "\n\n## B\n\nB text grows"), part("a", 1, "\n\n## A\n\nA text")],
    });
    expect(texts()).toEqual(["A", "A text", "B", "B text grows"]);
    expect(suggested()[2]).toBe(heading);
    // without `order`: as listed
    await show({ proposals: [live("z", "\n\nfirst listed"), live("y", "\n\nsecond listed")] });
    expect(texts()).toEqual(["first listed", "second listed"]);
  });
});

describe("lane cursors", () => {
  const cursors = () => [...document.querySelectorAll<HTMLElement>(".gotipe-lane-cursor")];
  const names = () =>
    cursors().map((element) => [
      element.querySelector(".gotipe-lane-chip-name")?.textContent,
      element.querySelector(".gotipe-lane-chip-label")?.textContent ?? null,
    ]);

  it("a lane has as many as it is given: each under its id, with its own name, compact or not", async () => {
    const anchor = { before: "The ", quote: "last", after: " one." };
    const given: LaneCursor[] = [
      { laneId: "agent", id: "one", name: "Intro", label: "Writing", compact: true, anchor },
      { laneId: "agent", id: "two", name: "Steps", anchor },
      { laneId: "agent", anchor },
    ];
    const { show } = await mount({ cursors: given });
    expect(names()).toEqual([
      ["Intro", "Writing"],
      ["Steps", null],
      ["Agent", null],
    ]);
    expect(cursors().map((element) => element.hasAttribute("data-compact"))).toEqual([
      true,
      false,
      false,
    ]);
    expect(cursors().every((element) => element.getAttribute("aria-hidden") === "true")).toBe(true);
    // the same cursors in another order keep their elements
    const [one, two] = cursors();
    await show({ cursors: [given[1]!, given[0]!] });
    expect(cursors()).toEqual([two, one]);
    // without ids two cursors of a lane are still two
    await show({
      cursors: [
        { laneId: "agent", anchor },
        { laneId: "agent", anchor, label: "Second" },
      ],
    });
    expect(names()).toEqual([
      ["Agent", null],
      ["Agent", "Second"],
    ]);
  });

  it("says on which side its flag stands: before it when the flag would cross the page's edge", async () => {
    // the page is 300 wide; a flag is 120 wide and stands 10 after its cursor, or ends at it
    const original = Element.prototype.getBoundingClientRect;
    const box = (left: number, width: number) =>
      ({
        x: left,
        y: 0,
        left,
        top: 0,
        right: left + width,
        bottom: 20,
        width,
        height: 20,
        toJSON() {},
      }) as DOMRect;
    let cursorLeft = 50;
    Range.prototype.getClientRects = () =>
      [
        { left: cursorLeft, right: cursorLeft, top: 100, bottom: 120, width: 0, height: 20 },
      ] as unknown as DOMRectList;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.matches(".gotipe-page")) return box(0, 300);
      if (this.matches(".gotipe-lane-chip")) {
        const flipped = this.parentElement?.getAttribute("data-chip-side") === "start";
        return flipped ? box(cursorLeft - 120, 120) : box(cursorLeft + 10, 120);
      }
      return box(0, 0);
    };
    try {
      const anchor = { before: "The ", quote: "last", after: " one." };
      const cursor: LaneCursor = { laneId: "agent", id: "c", compact: true, anchor };
      const { show } = await mount({ cursors: [cursor] });
      const side = () => cursors()[0]!.getAttribute("data-chip-side");
      expect(side()).toBe("end");
      // the cursor moves to the page's end edge: the flag has no room after it
      cursorLeft = 200;
      await show({ cursors: [{ ...cursor }] });
      expect(cursors()[0]!.style.left).toBe("200px");
      expect(side()).toBe("start");
      // a little back: it would fit by a few pixels, and keeps its side
      cursorLeft = 165;
      await show({ cursors: [{ ...cursor }] });
      expect(side()).toBe("start");
      cursorLeft = 150;
      await show({ cursors: [{ ...cursor }] });
      expect(side()).toBe("end");
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  it("the cursor of a growing proposal stands where its text will start, and glides as the text moves it", async () => {
    const cursor: LaneCursor = { laneId: "agent", id: "c", proposalId: "p", label: "Writing" };
    const { show } = await mount({ proposals: [live("p", "")], cursors: [cursor] });
    // no text yet, no anchor of its own: at the place of the insertion
    expect(cursors()).toHaveLength(1);
    expect([cursors()[0]!.style.top, cursors()[0]!.style.left]).toEqual(["100px", "50px"]);
    expect(cursors()[0]!.hasAttribute("data-glide")).toBe(true);
    const element = cursors()[0]!;
    await show({ proposals: [live("p", "\n\nSome text")], cursors: [cursor] });
    expect(cursors()[0]).toBe(element);
    expect(element.hasAttribute("data-glide")).toBe(true);
    // a scroll moves it at once; the next growth glides again
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
      await wait(10);
    });
    expect(element.hasAttribute("data-glide")).toBe(false);
    await show({ proposals: [live("p", "\n\nSome text more")], cursors: [cursor] });
    expect(element.hasAttribute("data-glide")).toBe(true);
    // written: an ordinary proposal's cursor does not glide
    await show({
      proposals: [{ ...live("p", "\n\nSome text more"), live: false }],
      cursors: [cursor],
    });
    expect(cursors()[0]!.hasAttribute("data-glide")).toBe(false);
    // an ordinary proposal with no text has no place for a cursor without an anchor
    await show({
      proposals: [{ ...live("q", ""), live: false }],
      cursors: [{ ...cursor, proposalId: "q" }],
    });
    expect(cursors()).toHaveLength(0);
  });
});
