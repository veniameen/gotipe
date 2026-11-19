// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { decorationRect } from "./dom-position";

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
});
