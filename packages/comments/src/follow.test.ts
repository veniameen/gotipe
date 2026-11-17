import { describe, expect, it } from "vitest";
import { followChange } from "./follow";

const TEXT = "Discuss a draft\nSelect a phrase to start a discussion.";
const QUOTE = { from: 16, to: 31 }; // "Select a phrase", right after the block boundary

function follow(after: string, range = QUOTE) {
  const moved = followChange(TEXT, after)(range.from, range.to);
  return moved && { ...moved, text: after.slice(moved.from, moved.to) };
}

describe("followChange", () => {
  it("moves a range by text typed right before it, counting UTF-16 units", () => {
    const after = `${TEXT.slice(0, 16)}Префикс 😀 ${TEXT.slice(16)}`;
    expect(follow(after)).toEqual({ from: 27, to: 42, text: "Select a phrase" });
  });

  it("keeps a range when text is typed right after it or removed next to it", () => {
    expect(follow(`${TEXT.slice(0, 31)} 🦀${TEXT.slice(31)}`)).toEqual({
      from: 16,
      to: 31,
      text: "Select a phrase",
    });
    // Joining the blocks removes the "\n" right before the quote.
    expect(follow(TEXT.replace("\n", ""))).toEqual({ from: 15, to: 30, text: "Select a phrase" });
    expect(follow(TEXT.replace("draft\n", ""))).toEqual({
      from: 10,
      to: 25,
      text: "Select a phrase",
    });
  });

  it("places a window between repeated characters on the side that leaves the range alone", () => {
    // "S" before "Select" reads as an insertion after the first "S" unless the window moves left.
    expect(follow(`${TEXT.slice(0, 16)}S${TEXT.slice(16)}`)).toEqual({
      from: 17,
      to: 32,
      text: "Select a phrase",
    });
    // "e" after "phrase" reads as an insertion before its last "e" unless the window moves right.
    expect(follow(`${TEXT.slice(0, 31)}e${TEXT.slice(31)}`)).toEqual({
      from: 16,
      to: 31,
      text: "Select a phrase",
    });
  });

  it("gives null for a change inside the range, its removal, or edits on both of its sides", () => {
    expect(follow(TEXT.replace("a phrase", "the phrase"))).toBeNull();
    expect(follow(TEXT.replace("Select a phrase", ""))).toBeNull();
    expect(follow(TEXT.replace("draft", "plan").replace("start", "begin"))).toBeNull();
  });

  it("keeps every range of an unchanged text", () => {
    expect(followChange(TEXT, TEXT)(3, 40)).toEqual({ from: 3, to: 40 });
  });
});
