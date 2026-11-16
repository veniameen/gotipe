/**
 * The Markdown lens of the first stage: the files whose source fills the stage, and how a line of
 * them reads — as source (which characters are syntax) and as the document it becomes (its kind and
 * its styled runs). Pure functions over strings, no DOM; the lens paints them (lens-paint.ts).
 */

/** Three small files, each a column of the field. Lines stay within a column's 60 characters. */
export const LENS_FILES: readonly (readonly string[])[] = [
  [
    "# Launch notes",
    "Everything here **syncs live** across tabs.",
    "",
    "## Checklist",
    "- [x] Engine compiles to WASM",
    "- [x] Docs run on 0.1",
    "- [ ] Cut the release note",
    "",
    "> Paste a link — Markdown stays intact.",
    "",
    "```ts",
    "const editor = await createEditor({ extensions })",
    "editor.chain().focus().toggleBold().run()",
    "```",
    "",
    "| Area | Owner | Status |",
    "| --- | --- | --- |",
    "| Docs | Ana | done |",
    "| Engine | Lev | review |",
    "",
    "1. Write the page in **Markdown**",
    "2. Open it in the `PageEditor`",
    "3. Save — untouched blocks stay byte for byte",
    "",
  ],
  [
    "# Offline drafts",
    "A draft is kept on the device and sent later.",
    "- [x] Saved every second",
    "- [ ] Encrypted at rest",
    "",
    "## Together",
    "**Two people**, one paragraph. _No conflict._",
    "- Cursors and selections sync",
    "- Offline edits merge on reconnect",
    "",
    "> [!TIP]",
    "> Comments stay anchored to their text.",
    "",
    "`editor.getMarkdown()` returns the same file.",
    "",
    "### Review",
    "- ~~old wording~~ new wording",
    "- [ ] Accept all suggestions",
    "",
  ],
  [
    "# Your editor",
    "Your engine. Your rules. **No wrapper.**",
    "",
    "## Views",
    "- notion — familiar and focused",
    "- docs — reference pages with an outline",
    "- modern — a fixed toolbar and more room",
    "- minimal — just the words",
    "",
    "```css",
    '[data-gt-view="docs"] { --gt-page-width: 680px; }',
    "```",
    "",
    "## Export",
    "- [x] PDF and DOCX writers",
    "- [x] Markdown, HTML and JSON",
    "",
    "> One document model, wherever you need it.",
    "",
  ],
];

/** Sentences the field types and erases in turn, in one of its lines: the file is alive. */
export const LENS_TYPING: readonly string[] = [
  "Type / for blocks, **bold** stays bold.",
  "- [ ] Ship the lens with `0.1`",
  "> Markdown in, the same Markdown out.",
];

export type LineKind =
  | "blank"
  | "h1"
  | "h2"
  | "h3"
  | "para"
  | "bullet"
  | "ordered"
  | "todo"
  | "done"
  | "quote"
  | "callout"
  | "fence"
  | "code"
  | "table"
  | "rule";

/** A run of a rendered line and how it is styled. */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
}

export interface ReadLine {
  kind: LineKind;
  /** The marker the document draws in its own way: «1.» of a list, a callout's kind. */
  marker?: string;
  /** The line's text as runs, without its block syntax. */
  runs: Run[];
  /** A table row's cells, each as runs. */
  cells?: Run[][];
  /** A table's header row. */
  header?: boolean;
}

const INLINE = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|_[^_]+_)/g;

/** `**bold**`, `_italic_`, `` `code` `` and `~~struck~~` as runs; the rest is plain text. */
export function runsOf(text: string): Run[] {
  const runs: Run[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) runs.push({ text: text.slice(last, at) });
    const token = match[0];
    if (token.startsWith("**")) runs.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith("~~")) runs.push({ text: token.slice(2, -2), strike: true });
    else if (token.startsWith("`")) runs.push({ text: token.slice(1, -1), code: true });
    else runs.push({ text: token.slice(1, -1), italic: true });
    last = at + token.length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}

/**
 * How the document reads each line of a file: the kind of block it belongs to and its runs. The
 * lines inside a code fence are code, a table's second row is its rule.
 */
export function readLines(lines: readonly string[]): ReadLine[] {
  let code = false;
  let tableRow = 0;
  return lines.map((line): ReadLine => {
    if (line.startsWith("```")) {
      code = !code;
      tableRow = 0;
      return { kind: "fence", runs: [] };
    }
    if (code) return { kind: "code", runs: [{ text: line, code: true }] };
    if (line.startsWith("|")) {
      tableRow += 1;
      if (/^\|[\s|:-]+\|$/.test(line)) return { kind: "rule", runs: [] };
      const cells = line
        .slice(1, -1)
        .split("|")
        .map((cell) => runsOf(cell.trim()));
      return { kind: "table", runs: [], cells, header: tableRow === 1 };
    }
    tableRow = 0;
    if (!line.trim()) return { kind: "blank", runs: [] };
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const kind: LineKind = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      return { kind, runs: runsOf(heading[2] ?? "") };
    }
    const task = /^- \[( |x)\] (.*)$/.exec(line);
    if (task) return { kind: task[1] === "x" ? "done" : "todo", runs: runsOf(task[2] ?? "") };
    const callout = /^> \[!(\w+)\]$/.exec(line);
    if (callout) {
      const name = (callout[1] ?? "").toLowerCase();
      return { kind: "callout", marker: name[0]?.toUpperCase() + name.slice(1), runs: [] };
    }
    if (line.startsWith("> ")) return { kind: "quote", runs: runsOf(line.slice(2)) };
    const ordered = /^(\d+)\. (.*)$/.exec(line);
    if (ordered)
      return { kind: "ordered", marker: `${ordered[1]}.`, runs: runsOf(ordered[2] ?? "") };
    if (line.startsWith("- ")) return { kind: "bullet", runs: runsOf(line.slice(2)) };
    return { kind: "para", runs: runsOf(line) };
  });
}

/** The syntax of a source line — markers, delimiters, pipes — as [from, to) character ranges. */
export function syntaxOf(line: string, inCode: boolean): [number, number][] {
  if (line.startsWith("```")) return [[0, line.length]];
  if (inCode) return [];
  const ranges: [number, number][] = [];
  const lead = /^(#{1,6} |- \[[ x]\] |- |\d+\. |> (?:\[!\w+\])?)/.exec(line);
  if (lead) ranges.push([0, lead[0].length]);
  for (const match of line.matchAll(/\*\*|~~|`|(?<![\w])_|_(?![\w])|\|/g)) {
    const at = match.index ?? 0;
    if (lead && at < lead[0].length) continue;
    ranges.push([at, at + match[0].length]);
  }
  return ranges;
}

/** Moves `from` toward `to` by the share of the way a spring covers in `dt` seconds. */
export function approach(from: number, to: number, dt: number, rate: number): number {
  return to + (from - to) * Math.exp(-rate * dt);
}
