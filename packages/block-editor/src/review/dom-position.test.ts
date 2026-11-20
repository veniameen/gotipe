// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { decorationRect, liveEndRects } from "./dom-position";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const rect = (left: number, top: number, width: number, height: number) =>
  new DOMRect(left, top, width, height);

describe("decorationRect: where a suggestion's card is anchored", () => {
  it("a suggested task item stands at its text, past the checkbox", () => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    document.body.innerHTML = `<div id="root"><ul><li data-gotipe-phantom-id="p1" data-gotipe-proposal="s1" class="gotipe-sug-block-ins"><input type="checkbox"><div data-gotipe-todo-content>New task</div></li></ul></div>`;
    const item = document.querySelector("li")!;
    vi.spyOn(item, "getBoundingClientRect").mockReturnValue(rect(56, 100, 400, 24));
    // jsdom has no layout: the first character of the text is 28 px past the item's edge
    Range.prototype.getClientRects = () => [rect(84, 102, 8, 20)] as unknown as DOMRectList;
    const at = decorationRect(document.getElementById("root")!, "data-gotipe-proposal", "s1");
    expect(at?.left).toBe(84);
    expect(at?.top).toBe(100);
    expect(at?.right).toBe(456);
  });

  it("an inline insertion is its own box", () => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    document.body.innerHTML = `<div id="root"><p data-block-id="b"><span class="gotipe-sug-ins" data-gotipe-proposal="s2">and iPadOS</span></p></div>`;
    const mark = document.querySelector("span")!;
    vi.spyOn(mark, "getBoundingClientRect").mockReturnValue(rect(200, 50, 80, 20));
    const at = decorationRect(document.getElementById("root")!, "data-gotipe-proposal", "s2");
    expect(at?.left).toBe(200);
  });

  it("an edit inside a list item stands at its row's marks, not at the changed list (P51)", () => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    document.body.innerHTML = `<div id="root"><ul data-block-id="l" class="gotipe-sug-block-changed" data-gotipe-proposal="s3"><li data-block-id="a">one</li><li data-block-id="b"><span class="gotipe-sug-del" data-gotipe-proposal="s3">old</span><span class="gotipe-sug-ins" data-gotipe-proposal="s3">new</span></li></ul></div>`;
    vi.spyOn(document.querySelector("ul")!, "getBoundingClientRect").mockReturnValue(
      rect(56, 342, 400, 105),
    );
    vi.spyOn(document.querySelector(".gotipe-sug-del")!, "getBoundingClientRect").mockReturnValue(
      rect(84, 386, 30, 17),
    );
    const at = decorationRect(document.getElementById("root")!, "data-gotipe-proposal", "s3");
    expect([at?.left, at?.top]).toEqual([84, 386]);
  });

  it("a new task stands at its text's line, not at the taller item", () => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    document.body.innerHTML = `<div id="root"><ul><li data-gotipe-phantom-id="p1" data-gotipe-proposal="s4" class="gotipe-sug-block-ins"><input type="checkbox"><div data-gotipe-todo-content><span class="gotipe-sug-block-ins-text">New task</span></div></li></ul></div>`;
    vi.spyOn(document.querySelector("li")!, "getBoundingClientRect").mockReturnValue(
      rect(56, 100, 400, 21),
    );
    vi.spyOn(
      document.querySelector(".gotipe-sug-block-ins-text")!,
      "getBoundingClientRect",
    ).mockReturnValue(rect(84, 102, 60, 17));
    Range.prototype.getClientRects = () => [rect(84, 102, 8, 17)] as unknown as DOMRectList;
    const at = decorationRect(document.getElementById("root")!, "data-gotipe-proposal", "s4");
    expect([at?.left, at?.top, at?.bottom, at?.right]).toEqual([84, 102, 119, 456]);
  });

  it("the first place in document order wins over a mark further down", () => {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    document.body.innerHTML = `<div id="root"><p data-block-id="p2" class="gotipe-sug-block-del" data-gotipe-proposal="s5">gone</p><p data-block-id="p5"><span class="gotipe-sug-ins" data-gotipe-proposal="s5">new</span></p></div>`;
    vi.spyOn(document.querySelector("p")!, "getBoundingClientRect").mockReturnValue(
      rect(56, 100, 400, 20),
    );
    vi.spyOn(document.querySelector("span")!, "getBoundingClientRect").mockReturnValue(
      rect(56, 300, 30, 20),
    );
    Range.prototype.getClientRects = () => [rect(56, 100, 8, 20)] as unknown as DOMRectList;
    const at = decorationRect(document.getElementById("root")!, "data-gotipe-proposal", "s5");
    expect(at?.top).toBe(100);
  });
});

describe("liveEndRects: where the texts being written end", () => {
  it("finds the end of every growing proposal in one pass, by its marked last piece", () => {
    document.body.innerHTML = `<div id="root">
      <p data-block-id="a">Text <span class="gotipe-sug gotipe-sug-ins gotipe-sug-live" data-gotipe-proposal="inline">new words</span></p>
      <ul data-gotipe-phantom-id="p1" data-gotipe-proposal="blocks" class="gotipe-sug-block-ins"><li data-gotipe-phantom-id="p1.0"><span class="gotipe-sug-block-ins-text">one <span class="gotipe-sug-live">last</span></span></li></ul>
      <div data-gotipe-phantom-id="p2" data-gotipe-proposal="code" class="gotipe-code-block gotipe-sug-block-ins gotipe-sug-live"><div>header</div><pre><code>const a = 1;</code></pre></div>
      <h2 data-gotipe-phantom-id="p3" data-gotipe-proposal="empty" class="gotipe-sug-block-ins gotipe-sug-live"></h2>
      <p data-gotipe-phantom-id="p4" data-gotipe-proposal="written" class="gotipe-sug-block-ins">not growing</p>
    </div>`;
    // jsdom has no layout: each character of a text node is 10 wide from 10 on, and the marked
    // pieces (a code block's code) stand on a row at 20
    Range.prototype.getClientRects = function (this: Range) {
      const text = this.toString();
      return (text
        ? [rect(10 + this.startOffset * 10, 20, text.length * 10, 18)]
        : []) as unknown as DOMRectList;
    };
    const rows = vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (
      this: Element,
    ) {
      return (this.matches(".gotipe-sug-live:not(h2), pre > code")
        ? [rect(0, 20, 999, 18)]
        : []) as unknown as DOMRectList;
    });
    vi.spyOn(document.querySelector("h2")!, "getBoundingClientRect").mockReturnValue(
      rect(56, 300, 400, 30),
    );
    const ends = liveEndRects(document.getElementById("root")!);
    rows.mockRestore();
    expect([...ends.keys()].sort()).toEqual(["blocks", "code", "empty", "inline"]);
    const at = (id: string) => [ends.get(id)?.left, ends.get(id)?.top, ends.get(id)?.width];
    // after the last character of the marked piece
    expect(at("inline")).toEqual([10 + "new words".length * 10, 20, 0]);
    expect(at("blocks")).toEqual([10 + "last".length * 10, 20, 0]);
    // a code block ends where its code does, not where its header does
    expect(at("code")).toEqual([10 + "const a = 1;".length * 10, 20, 0]);
    // an empty block: at its start
    expect(at("empty")).toEqual([56, 300, 0]);
  });

  it("puts the end of a text that ends in inline code after the code's last letter, on the text's row", () => {
    document.body.innerHTML = `<div id="root">
      <p data-gotipe-phantom-id="p" data-gotipe-proposal="code-end" class="gotipe-sug-block-ins"><span class="gotipe-sug-block-ins-text">Run <span class="gotipe-sug-live"><code>npm run</code></span></span></p>
      <p data-gotipe-phantom-id="q" data-gotipe-proposal="space-end" class="gotipe-sug-block-ins"><span class="gotipe-sug-live">word </span></p>
    </div>`;
    // the code's own box reaches past its letters (its plate), and its letters stand lower
    Range.prototype.getClientRects = function (this: Range) {
      const text = this.toString();
      const lower = this.startContainer.parentElement?.closest("code") ? 1.2 : 0;
      return (text
        ? [rect(100 + this.startOffset * 8, 22 + lower, text.length * 8, 15)]
        : []) as unknown as DOMRectList;
    };
    const rows = vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (
      this: Element,
    ) {
      if (this.matches("code")) return [rect(96, 21, 64, 18)] as unknown as DOMRectList;
      return (this.matches(".gotipe-sug-live")
        ? [rect(50, 20, 114, 20)]
        : []) as unknown as DOMRectList;
    });
    const ends = liveEndRects(document.getElementById("root")!);
    rows.mockRestore();
    // after "n", the code's last letter, inside its plate; on the marked piece's row
    expect([
      ends.get("code-end")?.left,
      ends.get("code-end")?.top,
      ends.get("code-end")?.height,
    ]).toEqual([100 + "npm run".length * 8, 20, 20]);
    // a space at the end counts as a character: the end is after it
    expect(ends.get("space-end")?.left).toBe(100 + "word ".length * 8);
  });
});
