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
async function mount(first: Partial<PageReviewProps> = {}, markdown = MARKDOWN) {
  const ref = createRef<PageEditorHandle>();
  const draw = (review: Partial<PageReviewProps>) =>
    root.render(
      <PageEditor
        ref={ref}
        locale="en"
        markdown={markdown}
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

  it("keeps the space its text ends with while it grows, so the end of the text is after it", async () => {
    const { show } = await mount({ proposals: [live("p", "\n\nOne word ")] });
    const marked = () => container.querySelector(".gotipe-sug-live")?.textContent;
    expect(marked()).toBe("One word ");
    // the next word comes after it
    await show({ proposals: [live("p", "\n\nOne word more")] });
    expect(marked()).toBe("One word more");
    // written: a paragraph's end drops it, as it always did
    await show({ proposals: [{ ...live("p", "\n\nOne word "), live: false }] });
    expect(texts()).toEqual(["One word"]);
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
    expect(
      seen.at(-1)?.map((state) => [state.id, state.status, state.live, state.insertedChars]),
    ).toEqual([
      ["p", "pending", true, 0],
      ["ready", "pending", undefined, 5],
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
    expect(seen.at(-1)?.[0]).not.toHaveProperty("live");
    expect(document.querySelectorAll('[data-gotipe-review-card="proposal"] button')).toHaveLength(
      2,
    );
    expect(container.querySelector(".gotipe-review-bar")?.textContent).toContain("2 suggestions");
  });

  it("is stale when its anchor is lost, still takes no decision, and Accept all goes past it", async () => {
    const onAccept = vi.fn(() => true);
    const seen: ProposalState[][] = [];
    const review = {
      onAccept,
      onStatesChange: (states: { proposals: ProposalState[] }) => seen.push(states.proposals),
    };
    // its anchor names a heading the page does not have
    const lost: ReviewProposal = {
      ...live("p", "\n\nNew text."),
      edits: [{ ...below("\n\nNew text."), after: "\n\n## Gone" }],
    };
    const pending: ReviewProposal = {
      id: "ready",
      laneId: "agent",
      edits: [{ before: "The ", quote: "last", after: " one.", text: "final" }],
    };
    const { ref } = await mount({ ...review, proposals: [lost, pending] });
    expect(seen.at(-1)?.[0]).toMatchObject({
      id: "p",
      status: "stale",
      live: true,
      reason: "missing",
    });
    // the bar counts what waits for an answer: neither pending nor stale counts it
    const bar = container.querySelector(".gotipe-review-bar")?.textContent ?? "";
    expect(bar).toContain("1 suggestion");
    expect(bar).not.toMatch(/stale/i);
    await act(async () => {
      ref.current!.review!.focus("p");
      await wait(30);
    });
    const card = document.querySelector<HTMLElement>('[data-gotipe-review-card="proposal"]')!;
    expect(card.hasAttribute("data-live")).toBe(true);
    expect(card.textContent).toContain("The text around changed");
    expect(card.querySelector("button")).toBeNull();
    // it takes no answer, and Accept all accepts the rest
    await act(async () => {
      expect(await ref.current!.review!.accept("p")).toBe(false);
      expect(await ref.current!.review!.acceptAll()).toBe(1);
    });
    expect(onAccept.mock.calls).toEqual([["ready"]]);
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

describe("the page reads a growing text as unfinished Markdown", () => {
  it("leaves the page's own code span alone when the text before it opens one", async () => {
    // a backtick left open before the page's own code span would pair with it, so the page's
    // text would be struck and drawn again as code; read as unfinished, it is text
    const growing: ReviewProposal = {
      id: "p",
      laneId: "agent",
      live: true,
      edits: [{ before: "Alpha", quote: "", after: " beta `gamma` delta.", text: " new `op" }],
    };
    await mount({ proposals: [growing] }, "# Notes\n\nAlpha beta `gamma` delta.\n");
    expect(container.querySelectorAll(".gotipe-sug-del")).toHaveLength(0);
    // the diff takes the space both texts share: the new text stands after it
    expect([...container.querySelectorAll(".gotipe-sug-ins")].map((e) => e.textContent)).toEqual([
      "new `op ",
    ]);
    expect(container.querySelector("[data-block-id] code")?.textContent).toBe("gamma");
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

  /**
   * A page 300 wide, or as wide as the test makes it, with every cursor where the test puts it.
   * A flag is 120 wide and stands 10 right of its cursor, or ends at it when it is left of it.
   */
  async function measured(
    run: (the: { cursor(left: number): void; page(width: number): void }) => Promise<void>,
  ) {
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
    let pageWidth = 300;
    Range.prototype.getClientRects = () =>
      [
        { left: cursorLeft, right: cursorLeft, top: 100, bottom: 120, width: 0, height: 20 },
      ] as unknown as DOMRectList;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return this.matches(".gotipe-page") ? box(0, pageWidth) : box(0, 0);
    };
    // the flag's own place in its cursor: 10 after it, or ending at it when it is before it
    const flag = (element: HTMLElement) =>
      element.matches(".gotipe-lane-chip")
        ? element.parentElement?.getAttribute("data-chip-side") === "left"
          ? { left: -120, width: 120 }
          : { left: 10, width: 120 }
        : { left: 0, width: 0 };
    const offsets = {
      offsetLeft: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetLeft")!,
      offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth")!,
    };
    Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
      configurable: true,
      get(this: HTMLElement) {
        return flag(this).left;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get(this: HTMLElement) {
        return flag(this).width;
      },
    });
    try {
      await run({
        cursor(left) {
          cursorLeft = left;
        },
        page(width) {
          pageWidth = width;
        },
      });
    } finally {
      Element.prototype.getBoundingClientRect = original;
      Object.defineProperty(HTMLElement.prototype, "offsetLeft", offsets.offsetLeft);
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsets.offsetWidth);
    }
  }

  /** Resize observers that tell of a resize when the test says so. */
  function resizes() {
    const watching = new Set<ResizeObserverCallback>();
    class Watching {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() {
        watching.add(this.callback);
      }
      unobserve() {}
      disconnect() {
        watching.delete(this.callback);
      }
    }
    vi.stubGlobal("ResizeObserver", Watching);
    return async () => {
      await act(async () => {
        for (const callback of [...watching]) callback([], {} as ResizeObserver);
        await wait(10);
      });
    };
  }
  const windowResized = async () => {
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      await wait(10);
    });
  };
  const side = () => cursors()[0]!.getAttribute("data-chip-side");
  const anchor = { before: "The ", quote: "last", after: " one." };
  const flagged: LaneCursor = { laneId: "agent", id: "c", compact: true, anchor };

  it("says on which side its flag stands: left of it when the flag would cross the page's right edge", async () => {
    await measured(async (the) => {
      const { show } = await mount({ cursors: [flagged] });
      expect(side()).toBe("right");
      // the cursor moves to the page's end edge: the flag has no room after it
      the.cursor(200);
      await show({ cursors: [{ ...flagged }] });
      expect(cursors()[0]!.style.left).toBe("200px");
      expect(side()).toBe("left");
      // a little back: it would fit by a few pixels, and keeps its side
      the.cursor(165);
      await show({ cursors: [{ ...flagged }] });
      expect(side()).toBe("left");
      the.cursor(150);
      await show({ cursors: [{ ...flagged }] });
      expect(side()).toBe("right");
    });
  });

  it("finds the side again when the page's edge moved and the cursor did not", async () => {
    const resized = resizes();
    await measured(async (the) => {
      // 150 + 10 + 120: the flag ends 20 before the page's edge
      the.cursor(150);
      await mount({ cursors: [flagged] });
      const element = cursors()[0]!;
      expect(side()).toBe("right");
      // the page narrows; its text, and the cursor with it, stay where they were
      the.page(270);
      await resized();
      expect(cursors()[0]).toBe(element);
      expect(element.style.left).toBe("150px");
      expect(side()).toBe("left");
      // a little wider: the flag would fit by a few pixels, and keeps its side
      the.page(285);
      await resized();
      expect(side()).toBe("left");
      the.page(300);
      await resized();
      expect(side()).toBe("right");
      // the window's edge is the page's when the window shows less of it
      vi.stubGlobal("innerWidth", 270);
      await windowResized();
      expect(element.style.left).toBe("150px");
      expect(side()).toBe("left");
      vi.stubGlobal("innerWidth", 300);
      await windowResized();
      expect(side()).toBe("right");
    });
  });

  it("the cursor of a growing proposal does not glide to where the page's new width took it", async () => {
    const resized = resizes();
    await measured(async (the) => {
      const cursor: LaneCursor = { laneId: "agent", id: "c", proposalId: "p" };
      const { show } = await mount({ proposals: [live("p", "\n\nSome text")], cursors: [cursor] });
      const element = cursors()[0]!;
      expect(element.hasAttribute("data-glide")).toBe(true);
      // the page narrows and its text is laid out anew: the cursor is at its new place at once
      the.page(280);
      the.cursor(40);
      await resized();
      expect(element.style.left).toBe("40px");
      expect(element.hasAttribute("data-glide")).toBe(false);
      // told of the same resize once more, or drawn again where it is: still no glide
      await resized();
      await show({ proposals: [live("p", "\n\nSome text")], cursors: [{ ...cursor }] });
      expect(element.hasAttribute("data-glide")).toBe(false);
      // the text grows on: a glide again, and a resize that moved nothing leaves it alone
      the.cursor(60);
      await show({ proposals: [live("p", "\n\nSome text more")], cursors: [cursor] });
      expect(element.style.left).toBe("60px");
      expect(element.hasAttribute("data-glide")).toBe(true);
      await resized();
      expect(element.hasAttribute("data-glide")).toBe(true);
    });
  });

  it("is placed again, at once, when web fonts have come and laid the text out anew", async () => {
    // the document's fonts, as a browser gives them: an event when loads end, and a promise
    const fonts = Object.assign(new EventTarget(), {
      status: "loaded" as FontFaceSetLoadStatus,
      ready: Promise.resolve(),
    });
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
    try {
      await measured(async (the) => {
        const cursor: LaneCursor = { laneId: "agent", id: "c", proposalId: "p" };
        const { show } = await mount({
          proposals: [live("p", "\n\nSome text")],
          cursors: [cursor],
        });
        const element = cursors()[0]!;
        expect(element.style.left).toBe("50px");
        // a font came: the text stands elsewhere, and nothing else of the page changed
        the.cursor(140);
        await act(async () => {
          fonts.dispatchEvent(new Event("loadingdone"));
          await wait(10);
        });
        expect(element.style.left).toBe("140px");
        expect(element.hasAttribute("data-glide")).toBe(false);
        // a font still loading when the cursors are placed: they are placed again once it is in
        let loaded!: () => void;
        fonts.status = "loading";
        fonts.ready = new Promise<void>((done) => {
          loaded = done;
        });
        await show({ proposals: [live("p", "\n\nSome text")], cursors: [{ ...cursor }] });
        the.cursor(200);
        expect(element.style.left).toBe("140px");
        await act(async () => {
          loaded();
          await wait(10);
        });
        expect(element.style.left).toBe("200px");
      });
    } finally {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("the cursor of a growing proposal stands where its text will start, and glides as the text moves it", async () => {
    await measured(async (the) => {
      const cursor: LaneCursor = { laneId: "agent", id: "c", proposalId: "p", label: "Writing" };
      const { show } = await mount({ proposals: [live("p", "")], cursors: [cursor] });
      // no text yet, no anchor of its own: at the place of the insertion
      expect(cursors()).toHaveLength(1);
      expect([cursors()[0]!.style.top, cursors()[0]!.style.left]).toEqual(["100px", "50px"]);
      expect(cursors()[0]!.hasAttribute("data-glide")).toBe(true);
      const element = cursors()[0]!;
      the.cursor(90);
      await show({ proposals: [live("p", "\n\nSome text")], cursors: [cursor] });
      expect(cursors()[0]).toBe(element);
      expect(element.style.left).toBe("90px");
      expect(element.hasAttribute("data-glide")).toBe(true);
      // a scroll elsewhere on the screen moves no cursor of the page: the glide goes on
      const other = document.createElement("div");
      document.body.append(other);
      await act(async () => {
        other.dispatchEvent(new Event("scroll"));
        await wait(10);
      });
      other.remove();
      expect(element.hasAttribute("data-glide")).toBe(true);
      // a scroll of the page takes it along at once
      the.cursor(80);
      await act(async () => {
        window.dispatchEvent(new Event("scroll"));
        await wait(10);
      });
      expect(element.style.left).toBe("80px");
      expect(element.hasAttribute("data-glide")).toBe(false);
      // drawn again where it is, it is as it was; moved by its text, it glides again
      await show({ proposals: [live("p", "\n\nSome text")], cursors: [{ ...cursor }] });
      expect(element.hasAttribute("data-glide")).toBe(false);
      the.cursor(120);
      await show({ proposals: [live("p", "\n\nSome text more")], cursors: [cursor] });
      expect(element.style.left).toBe("120px");
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
});
