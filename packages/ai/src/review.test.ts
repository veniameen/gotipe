// @vitest-environment node
import { describe, expect, it } from "vitest";
import { followQuote } from "./review";
import type { AiComment } from "./types";

const on = (text: string, quote: string, from = text.indexOf(quote)): AiComment => ({
  id: "c",
  blockId: "a",
  from,
  to: from + quote.length,
  quotedText: quote,
  body: "Say it better",
});
const quoteIn = (text: string, comment: AiComment | null) =>
  comment && text.slice(comment.from, comment.to);

describe("followQuote (D-181)", () => {
  it("keeps the offsets when the text changed after the quote", () => {
    const comment = on("bad one", "bad");
    expect(followQuote(comment, "bad one", "bad one!")).toBe(comment);
    expect(followQuote(comment, "bad one", "badly one")).toBe(comment);
  });

  it("shifts the quote when the text changed before it", () => {
    const after = "peer bad one";
    const moved = followQuote(on("bad one", "bad"), "bad one", after);
    expect(moved).toMatchObject({ from: 5, to: 8 });
    expect(quoteIn(after, moved)).toBe("bad");
    const shorter = followQuote(on("so bad one", "bad"), "so bad one", "bad one");
    expect(quoteIn("bad one", shorter)).toBe("bad");
  });

  it("lets the comment go when the edit touched its quote", () => {
    expect(followQuote(on("bad one", "bad"), "bad one", "bXad one")).toBeNull();
    expect(followQuote(on("bad one", "bad"), "bad one", "ad one")).toBeNull();
    expect(followQuote(on("a bad one", "bad"), "a bad one", "a b")).toBeNull();
  });

  it("reads repeated characters either way, so a quote kept whole stays", () => {
    const moved = followQuote(on("xab", "ab"), "xab", "xaab");
    expect(quoteIn("xaab", moved)).toBe("ab");
    expect(quoteIn("😀😀 ab", followQuote(on("😀 ab", "ab"), "😀 ab", "😀😀 ab"))).toBe("ab");
  });
});
