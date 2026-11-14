import { afterEach, describe, expect, it, vi } from "vitest";
import { Bold, CodeBlock, FindReplace, Italic, Paragraph, getFindReplace } from "../src/extensions";
import { unsafePattern } from "../src/extensions/find-replace/guard";
import { compileSearch, scanTargets } from "../src/extensions/find-replace/search";
import type { Mark } from "../src/types/block";
import type { GoTipeEditor } from "../src/types/editor";
import { ENGINES, block, createOn, doc, paragraph } from "./engines";

/** Patterns that freeze a tab on 64 letters `a` when they run on the page. */
const BACKTRACKING = [
  "(a+){8}x",
  "a*a*a*a*a*a*x",
  "(.+){5}!",
  "(a+){20}x",
  "(a|aa){25}x",
  "(.*a){12}x",
  "(a{1,30}){1,30}x",
  ".*.*.*.*.*.*x",
  "(?:a+){2,}x",
  "(a+)+x",
  "(\\w+\\s?)*x",
];
const bold: Mark = { type: "bold", attrs: {} };
const italic: Mark = { type: "italic", attrs: {} };
const editors: GoTipeEditor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe.each(ENGINES)("%s find and replace", (engine) => {
  async function setup(...blocks: Parameters<typeof doc>) {
    const editor = await createOn(engine, {
      extensions: [Paragraph, Bold, Italic, CodeBlock, FindReplace],
      content: doc(...blocks),
    });
    editors.push(editor);
    return { editor, search: getFindReplace(editor)! };
  }

  it("finds Cyrillic case-insensitively across blocks, counts and wraps", async () => {
    const { editor, search } = await setup(
      paragraph("a", "Журнал и ЖУРНАЛ"),
      block("c", "codeBlock", "журнал в коде", { language: "" }),
      paragraph("b", "ёлка журнал"),
    );
    const changes = vi.fn();
    search.subscribe(changes);
    const state = search.setSearch({ query: "журнал" });
    expect(state.matches).toEqual([
      { blockId: "a", from: 0, to: 6 },
      { blockId: "a", from: 9, to: 15 },
      { blockId: "b", from: 5, to: 11 },
    ]);
    expect([state.position, state.total]).toEqual([1, 3]);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(search.previous()).toEqual({ blockId: "b", from: 5, to: 11 });
    expect(search.getState().position).toBe(3);
    expect(search.next()).toEqual({ blockId: "a", from: 0, to: 6 });
    expect(search.setSearch({ caseSensitive: true }).total).toBe(1);
    expect(search.setSearch({ query: "Ё", caseSensitive: false }).total).toBe(1);
    const layer = editor.getDecorations("search");
    expect(layer).toEqual([
      expect.objectContaining({
        type: "inline",
        blockId: "b",
        from: 0,
        to: 1,
        className: "gotipe-match is-current",
      }),
    ]);
  });

  it("searches raw blocks only when configured and keeps surrogate pairs whole", async () => {
    const editor = await createOn(engine, {
      extensions: [Paragraph, CodeBlock, FindReplace.configure({ includeRaw: true })],
      content: doc(paragraph("a", "😀x😀"), block("c", "codeBlock", "😀", { language: "" })),
    });
    editors.push(editor);
    const search = getFindReplace(editor)!;
    expect(search.setSearch({ query: "😀" }).matches).toEqual([
      { blockId: "a", from: 0, to: 2 },
      { blockId: "a", from: 3, to: 5 },
      { blockId: "c", from: 0, to: 2 },
    ]);
    // A regex dot is one code point, never half of an emoji; empty matches are skipped.
    expect(search.setSearch({ query: ".", regex: true }).matches.slice(0, 2)).toEqual([
      { blockId: "a", from: 0, to: 2 },
      { blockId: "a", from: 2, to: 3 },
    ]);
    expect(search.setSearch({ query: "x*" }).matches).toEqual([{ blockId: "a", from: 2, to: 3 }]);
  });

  it("matches whole words by Unicode letters", async () => {
    const { search } = await setup(paragraph("a", "кот котик кот_ (кот) кот́"));
    expect(search.setSearch({ query: "кот", wholeWord: true }).matches).toEqual([
      { blockId: "a", from: 0, to: 3 },
      { blockId: "a", from: 16, to: 19 },
    ]);
  });

  it("reports invalid and catastrophic patterns instead of running them", async () => {
    const { editor, search } = await setup(paragraph("a", "aaaa"));
    expect(search.setSearch({ query: "(", regex: true }).error?.code).toBe("INVALID_PATTERN");
    expect(search.setSearch({ query: "(a+)+$" }).error?.code).toBe("UNSAFE_PATTERN");
    expect(search.getState().total).toBe(0);
    expect(editor.getDecorations("search")).toEqual([]);
    expect(search.setSearch({ query: "a{2}" }).total).toBe(2);
  });

  it("refuses without a Worker every pattern that backtracks badly, in bounded time", async () => {
    const { search } = await setup(paragraph("a", "a".repeat(64)), paragraph("b", "cat dog"));
    const started = performance.now();
    for (const query of BACKTRACKING) {
      const state = search.setSearch({ query, regex: true });
      expect(state.error?.code, query).toBe("UNSAFE_PATTERN");
      expect(state.pending).toBe(false);
    }
    expect(performance.now() - started).toBeLessThan(500);
    expect(search.setSearch({ query: "(cat|dog)+", regex: true })).toMatchObject({
      total: 2,
      error: null,
    });
    expect(search.setSearch({ query: "(?:a|b)*" }).total).toBe(2);
  });

  it("checks patterns statically: ambiguous repeated groups and trading repetitions", () => {
    for (const pattern of [
      ...BACKTRACKING,
      "(a|aa)*",
      "(?:\\w+\\s?)*x",
      "((a+)b)+",
      "(?<n>a*)+",
      "(a{1,})+",
      "(a?){25}a{25}",
      "(?:a+){2,}",
      "(\\w+\\s?)*",
      "a{0,30}a{0,30}a{0,30}x",
      "(a|a)(a|a)(a|a)x",
      "\\w+\\s?\\w+x",
      ".*a.*x",
      "a*(?:b?a*)x",
      "(?:a|b)*a*",
      "(ab|abab)+",
      "\\d+(?:\\.\\d+)?\\d+",
      "[\\x61]+a+",
      "A*(?i:a*)",
    ])
      expect(unsafePattern(pattern), pattern).toBe(true);
    expect(unsafePattern("A*a*")).toBe(false);
    expect(unsafePattern("A*a*", true)).toBe(true);
    for (const pattern of [
      "(cat|dog)+",
      "(cat|car)+",
      "(?:a|b)*",
      "\\d+-\\d+",
      "(ab)+",
      "(\\d{3}){2}",
      "[(+)]+",
      "a\\(b+\\)+",
      "(?:x)?",
      "colou?r",
      "https?://\\S+",
      "\\w+\\s+\\w+",
      "-?\\d+(?:\\.\\d+)?",
      '".*?"',
      "^\\s+|\\s+$",
    ])
      expect(unsafePattern(pattern), pattern).toBe(false);
  });

  it("stops a search over its time budget", () => {
    const compiled = compileSearch({
      query: "a",
      caseSensitive: true,
      wholeWord: false,
      regex: false,
    });
    if (!compiled || "code" in compiled) throw new Error("compiled");
    const targets = Array.from({ length: 50 }, (_, index) => ({
      blockId: `b${index}`,
      content: [{ text: "a".repeat(2000) }],
    }));
    const cache = new Map();
    expect(scanTargets(targets, compiled, cache, -1)).toBe(false);
    expect(cache.size).toBeLessThan(50);
  });

  it("follows document changes, undo and remote replacement", async () => {
    const { editor, search } = await setup(paragraph("a", "one two one"));
    search.setSearch({ query: "one" });
    search.next();
    expect(search.getState().matches[search.getState().index]).toEqual({
      blockId: "a",
      from: 8,
      to: 11,
    });
    editor.dispatch({
      steps: [{ type: "insertText", blockId: "a", offset: 0, text: "one ", marks: [] }],
    });
    expect(search.getState().total).toBe(3);
    // The current match moves with its text.
    expect(search.getState().matches[search.getState().index]).toEqual({
      blockId: "a",
      from: 12,
      to: 15,
    });
    editor.undo();
    expect(search.getState().total).toBe(2);
    editor.setContent(doc(paragraph("x", "nothing")));
    expect(search.getState()).toMatchObject({ total: 0, index: -1, position: 0 });
    expect(editor.getDecorations("search")).toEqual([]);
  });

  it("replaces the current match with its marks in one undo step and moves on", async () => {
    const { editor, search } = await setup(
      paragraph("a", [
        { text: "Cat", marks: [bold] },
        { text: " and ", marks: [] },
        { text: "cat", marks: [italic] },
      ]),
    );
    search.setSearch({ query: "cat" });
    expect(await search.replace("Пёс🐕")).toBe(true);
    expect(editor.getJSON().blocks[0]!.content).toEqual([
      { text: "Пёс🐕", marks: [bold] },
      { text: " and ", marks: [] },
      { text: "cat", marks: [italic] },
    ]);
    expect(search.getState()).toMatchObject({ total: 1, position: 1 });
    expect(search.getState().matches[0]).toEqual({ blockId: "a", from: 10, to: 13 });
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("Cat and cat");
    expect(editor.undo()).toBe(false);
  });

  it("replaces all matches, beyond the highlight limit, as one undo step", async () => {
    const editor = await createOn(engine, {
      extensions: [Paragraph, Bold, FindReplace.configure({ maxMatches: 2 })],
      content: doc(paragraph("a", "x x x"), paragraph("b", [{ text: "x", marks: [bold] }])),
    });
    editors.push(editor);
    const search = getFindReplace(editor)!;
    expect(search.setSearch({ query: "x" })).toMatchObject({ total: 2, truncated: true });
    expect(await search.replaceAll("yy")).toBe(4);
    expect(editor.getText()).toBe("yy yy yy\nyy");
    expect(editor.getJSON().blocks[1]!.content).toEqual([{ text: "yy", marks: [bold] }]);
    expect(search.getState().total).toBe(0);
    expect(editor.undo()).toBe(true);
    expect(editor.getText()).toBe("x x x\nx");
  });

  it("expands regex groups in replacements", async () => {
    const { editor, search } = await setup(paragraph("a", "2026-11-13 and 1999-01-02"));
    search.setSearch({ query: "(\\d{4})-(?<m>\\d\\d)-(\\d\\d)", regex: true });
    expect(await search.replace("$3.$<m>.$1")).toBe(true);
    expect(editor.getText()).toBe("13.11.2026 and 1999-01-02");
    expect(await search.replaceAll("[$&]")).toBe(1);
    expect(editor.getText()).toBe("13.11.2026 and [1999-01-02]");
  });

  it("does not replace in a read-only editor and releases its layer on destroy", async () => {
    const { editor, search } = await setup(paragraph("a", "abc"));
    search.setSearch({ query: "b" });
    editor.setEditable(false);
    expect(await search.replace("x")).toBe(false);
    expect(await search.replaceAll("x")).toBe(0);
    expect(editor.getText()).toBe("abc");
    expect(editor.getDecorations("search")).toHaveLength(1);
    editor.destroy();
    expect(getFindReplace(editor)).toBeNull();
  });
});

describe.each(ENGINES)("%s find over inline atoms", (engine) => {
  it("draws, selects and passes over a match inside a mention or a formula whole", async () => {
    const { InlineMath, Mention, insertInlineMath, insertMention } = await import(
      "../src/extensions"
    );
    const editor = await createOn(engine, {
      extensions: [Paragraph, Mention, InlineMath, FindReplace],
      content: doc(paragraph("p", "Анна и ")),
    });
    editors.push(editor);
    editor.setSelection({ anchor: { blockId: "p", offset: 7 }, head: { blockId: "p", offset: 7 } });
    insertMention(editor, { id: "u1", label: "Анна" });
    insertInlineMath(editor, "x^2+x");
    // "Анна и @Аннаx^2+x": the mention is [7, 12), the formula [12, 17).
    const search = getFindReplace(editor)!;
    expect(search.setSearch({ query: "нн" }).total).toBe(2);
    const drawn = () =>
      editor
        .getDecorations("search")
        .map((d) => [(d as { from: number }).from, (d as { to: number }).to]);
    expect(drawn()).toEqual([
      [1, 3],
      [7, 12],
    ]);
    search.next();
    search.selectCurrent();
    expect(editor.getViewState().selection.anchor.offset).toBe(7);
    expect(editor.getViewState().selection.head.offset).toBe(12);

    // Two matches in one formula: counted twice, drawn once, as the whole formula.
    expect(search.setSearch({ query: "x" }).total).toBe(2);
    expect(drawn()).toEqual([[12, 17]]);
    expect(await search.replace("y")).toBe(false);
    expect(await search.replaceAll("y")).toBe(0);
    expect(editor.getText()).toBe("Анна и @Аннаx^2+x");

    // Plain matches are replaced, atoms are kept.
    search.setSearch({ query: "Анна" });
    expect(await search.replaceAll("Мария")).toBe(1);
    expect(editor.getText()).toBe("Мария и @Аннаx^2+x");
  });
});
