import { describe, expect, it } from "vitest";
import { LENS_FILES, LENS_TYPING, approach, readLines, runsOf, syntaxOf } from "./lens-content";
import { fieldLeftAt } from "./lens-paint";

describe("the lens's Markdown", () => {
  it("reads inline marks as runs", () => {
    expect(runsOf("Everything here **syncs live** across tabs.")).toEqual([
      { text: "Everything here " },
      { text: "syncs live", bold: true },
      { text: " across tabs." },
    ]);
    expect(runsOf("- ~~old~~ new `code` _now_")).toEqual([
      { text: "- " },
      { text: "old", strike: true },
      { text: " new " },
      { text: "code", code: true },
      { text: " " },
      { text: "now", italic: true },
    ]);
  });

  it("reads each line as the block it becomes", () => {
    const read = readLines([
      "# Title",
      "## Part",
      "- [x] Done",
      "- [ ] To do",
      "- Item",
      "2. Second",
      "> Quote",
      "> [!TIP]",
      "```ts",
      "const a = 1",
      "```",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "Plain **text**",
    ]);
    expect(read.map((line) => line.kind)).toEqual([
      "h1",
      "h2",
      "done",
      "todo",
      "bullet",
      "ordered",
      "quote",
      "callout",
      "fence",
      "code",
      "fence",
      "table",
      "rule",
      "table",
      "blank",
      "para",
    ]);
    expect(read[5]?.marker).toBe("2.");
    expect(read[7]?.marker).toBe("Tip");
    expect(read[11]?.header).toBe(true);
    expect(read[13]?.header).toBe(false);
    expect(read[13]?.cells?.map((cell) => cell[0]?.text)).toEqual(["1", "2"]);
  });

  it("marks only the syntax of a source line", () => {
    const line = "- [x] **Bold** and `code`";
    const marked = syntaxOf(line, false).map(([from, to]) => line.slice(from, to));
    expect(marked).toEqual(["- [x] ", "**", "**", "`", "`"]);
    expect(syntaxOf("const a = b_c", true)).toEqual([]);
    expect(syntaxOf("snake_case stays", false)).toEqual([]);
  });

  it("keeps every line within a column", () => {
    for (const line of [...LENS_FILES.flat(), ...LENS_TYPING])
      expect(line.length).toBeLessThanOrEqual(60);
  });

  it("eases toward a target without passing it", () => {
    expect(approach(0, 1, 0, 5)).toBe(0);
    const next = approach(0, 1, 0.1, 5);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  it("calms the field over the copy and under the head, not at the sides", () => {
    expect(fieldLeftAt(720, 342, 1440, 1400)).toBeLessThan(0.1);
    expect(fieldLeftAt(40, 400, 1440, 1400)).toBe(1);
    expect(fieldLeftAt(40, 0, 1440, 1400)).toBe(0);
  });
});
