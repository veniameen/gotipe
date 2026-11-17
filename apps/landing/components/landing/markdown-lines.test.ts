import { describe, expect, it } from "vitest";
import { SIGNATURE_MARKDOWN } from "./demo-content";
import {
  fieldOf,
  fileOf,
  lineAt,
  lineSummary,
  linesOf,
  piecesOf,
  rewrittenLines,
} from "./markdown-lines";

describe("linesOf", () => {
  it("ends the last line at a final line break instead of starting another", () => {
    expect(linesOf("a\nb\n")).toEqual(["a", "b"]);
    expect(linesOf("a\nb")).toEqual(["a", "b"]);
    expect(linesOf("a\r\nb\r\n")).toEqual(["a", "b"]);
    expect(linesOf("")).toEqual([""]);
    expect(linesOf("\n")).toEqual([""]);
  });

  it("counts the signature file as the frame does", () => {
    expect(linesOf(SIGNATURE_MARKDOWN)).toHaveLength(12);
  });
});

describe("fieldOf and fileOf", () => {
  it("shows a field as many lines as the pane numbers", () => {
    for (const file of [SIGNATURE_MARKDOWN, "a\nb\n", "a\nb\n\n", "\n", "a"]) {
      expect(fieldOf(file).split("\n")).toHaveLength(linesOf(file).length);
    }
  });

  it("gives the file back from its field", () => {
    expect(fileOf(fieldOf(SIGNATURE_MARKDOWN))).toBe(SIGNATURE_MARKDOWN);
    expect(fileOf(fieldOf("a\r\n"))).toBe("a\n");
    expect(fileOf("")).toBe("\n");
  });

  it("keeps a line the person added at the end", () => {
    expect(linesOf(fileOf("a\n"))).toEqual(["a", ""]);
  });
});

describe("lineAt", () => {
  it("finds the line of an offset", () => {
    expect(lineAt("a\nbc\nd", 0)).toBe(0);
    expect(lineAt("a\nbc\nd", 1)).toBe(0);
    expect(lineAt("a\nbc\nd", 2)).toBe(1);
    expect(lineAt("a\nbc\nd", 5)).toBe(2);
    expect(lineAt("a\r\nb", 3)).toBe(1);
  });
});

describe("rewrittenLines", () => {
  const source = linesOf(SIGNATURE_MARKDOWN);

  it("finds nothing when the writer gave the file back byte for byte", () => {
    expect(rewrittenLines(source, [...source]).size).toBe(0);
  });

  it("marks only the line of the edited block", () => {
    const after = [...source];
    after[3] = "replays. Two cursors, one document. Привет 👋";
    expect([...rewrittenLines(source, after)]).toEqual([3]);
  });

  it("marks inserted lines and keeps the lines after them", () => {
    const after = [...source.slice(0, 10), "- [ ] Tag the release", ...source.slice(10)];
    expect([...rewrittenLines(source, after)]).toEqual([10]);
  });

  it("marks nothing for a deleted line, the rest is kept", () => {
    const after = source.filter((_, index) => index !== 9);
    expect(rewrittenLines(source, after).size).toBe(0);
  });

  it("treats a changed task mark as a rewritten line", () => {
    const after = source.map((line) =>
      line === "- [ ] Cut the release note" ? "- [x] Cut the release note" : line,
    );
    expect([...rewrittenLines(source, after)]).toEqual([9]);
  });

  it("compares bytes: trailing spaces count", () => {
    expect([...rewrittenLines(["a", "b"], ["a", "b "])]).toEqual([1]);
  });

  it("handles empty sides", () => {
    expect(rewrittenLines([], ["a"]).size).toBe(1);
    expect(rewrittenLines(["a"], []).size).toBe(0);
  });
});

describe("piecesOf", () => {
  it("colours a heading line whole", () => {
    expect(piecesOf("### Launch checklist")).toEqual([
      { text: "### Launch checklist", mark: true },
    ]);
  });

  it("colours strong runs and keeps the text around them", () => {
    expect(piecesOf("**Every block** the engine")).toEqual([
      { text: "**Every block**", mark: true },
      { text: " the engine", mark: false },
    ]);
  });

  it("leaves plain lines plain", () => {
    expect(piecesOf("- [x] Docs run on 0.1")).toEqual([
      { text: "- [x] Docs run on 0.1", mark: false },
    ]);
  });
});

describe("lineSummary", () => {
  it("joins number and word with no-break spaces", () => {
    expect(lineSummary(12, 13, 1).replaceAll("\u00a0", " ")).toBe(
      "12 lines in · 13 lines out · 1 rewritten",
    );
    expect(lineSummary(1, 1, 0).replaceAll("\u00a0", " ")).toBe(
      "1 line in · 1 line out · 0 rewritten",
    );
  });

  it("breaks only before a dot", () => {
    expect(lineSummary(12, 12, 0).split(" ")).toEqual([
      "12\u00a0lines\u00a0in",
      "·\u00a012\u00a0lines\u00a0out",
      "·\u00a00\u00a0rewritten",
    ]);
  });
});
