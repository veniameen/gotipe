import { parseMarkdown } from "@gotipe/markdown";
import { describe, expect, it } from "vitest";
import { settleLiveMarkdown } from "./live-markdown";

type Block = {
  type: string;
  attrs: Record<string, unknown>;
  content: { text: string; marks: { type: string }[] }[] | string | null;
  children: Block[];
};

const parse = (text: string) => parseMarkdown(text).doc.blocks as unknown as Block[];
/** A block as its type and its text with the marks of each piece: `paragraph: a|bold:b`. */
const look = (block: Block): string => {
  const text = Array.isArray(block.content)
    ? block.content
        .map((span) => [...span.marks.map((mark) => mark.type), span.text].join(":"))
        .join("|")
    : (block.content ?? "");
  const children = block.children.map(look).join(", ");
  return `${block.type}: ${text}${children ? ` [${children}]` : ""}`;
};
const shown = (text: string) => parse(settleLiveMarkdown(text)).map(look);
/** Every length of `text` as it grows by a character. */
const growing = (text: string) =>
  Array.from({ length: text.length + 1 }, (_, n) => text.slice(0, n));

describe("settleLiveMarkdown: what is finished is Markdown", () => {
  it.each([
    "A paragraph with **bold**, *italic*, `code`, ~~gone~~ and [a link](https://example.com).\n",
    "# Title\n\n- one\n- two\n  - deep\n\n1. first\n2. second\n\n- [ ] task\n- [x] done\n",
    "| a | b |\n| --- | :-: |\n| 1 | 2 |\n\n> quote\n\n---\n\nText_with_underscores and 2 * 3 * 4.\n",
    "```ts\nconst a = `b`;\n```\n\nAfter the code: a < b and c > d, [^1] and <br>.\n",
    "Setext title\n============\n\nA line\nbroken softly.\\\nAnd hard.\n",
  ])("leaves a finished text as it is: %#", (text) => {
    expect(settleLiveMarkdown(text)).toBe(text);
  });

  it("leaves an empty text and a text of line breaks alone", () => {
    for (const text of ["", "\n", "\n\n", "\n\nText.\n\n"])
      expect(settleLiveMarkdown(text)).toBe(text);
  });
});

describe("settleLiveMarkdown: what the end leaves open", () => {
  it("shows a mark without its pair as text until it is closed", () => {
    expect(shown("Some **bold tex")).toEqual(["paragraph: Some **bold tex"]);
    expect(shown("Some **bold text**")).toEqual(["paragraph: Some |bold:bold text"]);
    expect(shown("Call `fn(")).toEqual(["paragraph: Call `fn("]);
    expect(shown("Call `fn()`")).toEqual(["paragraph: Call |code:fn()"]);
    expect(shown("It is ~~gon")).toEqual(["paragraph: It is ~~gon"]);
    expect(shown("An _open")).toEqual(["paragraph: An _open"]);
  });

  it("shows an unfinished link as text, with nothing in it linked", () => {
    for (const text of [
      "See [the",
      "See [the docs]",
      "See [the docs](",
      "See [the docs](https://exa",
    ])
      expect(shown(text).join()).not.toMatch(/link:/);
    expect(shown("See [the docs](https://example.com)")).toEqual(["paragraph: See |link:the docs"]);
    expect(shown("See ![a pic](pic.p")[0]).toMatch(/^paragraph: See !\[a pic\]\(pic\.p/);
  });

  it("grows a table by whole rows: its head and delimiter rows are text until both are whole", () => {
    const text = (block: Block): string =>
      Array.isArray(block.content) ? block.content.map((span) => span.text).join("") : "";
    /** The table a text shows first, as rows of cell texts, and what stands under it. */
    const table = (source: string) => {
      const [first, ...rest] = parse(settleLiveMarkdown(source));
      expect(first?.type).toBe("table");
      return {
        rows: first!.children.map((row) => row.children.map(text)),
        below: rest.map(look),
      };
    };
    // the head row, then the delimiter row as it is written: lines of text
    for (const source of [
      "| a | b |",
      "| a | b |\n",
      "| a | b |\n|",
      "| a | b |\n| --- |",
      "| a | b |\n| --- | -",
      "| a | b |\n| --- | --- |",
    ])
      expect(shown(source).every((block) => block.startsWith("paragraph: "))).toBe(true);
    expect(shown("| a | b |\n| --- | -")).toEqual(["paragraph: | a | b |", "paragraph: | --- | -"]);
    // both whole: the table stands with all its columns at once
    expect(table("| a | b |\n| --- | --- |\n")).toEqual({ rows: [["a", "b"]], below: [] });
    // a row being written is a line of text under the table, code in it too
    expect(table("| a | b |\n| --- | --- |\n| 1")).toEqual({
      rows: [["a", "b"]],
      below: ["paragraph: | 1"],
    });
    expect(table("| a | b |\n| --- | --- |\n| 1 | `co")).toEqual({
      rows: [["a", "b"]],
      below: ["paragraph: | 1 | `co"],
    });
    expect(table("| a | b |\n| --- | --- |\n| 1 | `code` |").below).toEqual([
      "paragraph: | 1 | |code:code| |",
    ]);
    // finished by its line break: a row of the table, and the next one starts under it
    expect(table("| a | b |\n| --- | --- |\n| 1 | `code` |\n")).toEqual({
      rows: [
        ["a", "b"],
        ["1", "code"],
      ],
      below: [],
    });
    expect(table("| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | **4")).toEqual({
      rows: [
        ["a", "b"],
        ["1", "2"],
      ],
      below: ["paragraph: | 3 | **4"],
    });
    // text after an empty line is no row of it
    expect(table("| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter").below).toEqual([
      "paragraph: After",
    ]);
  });

  it("closes an open code block: its code is shown as code and takes nothing after it", () => {
    expect(settleLiveMarkdown("Text.\n\n```js\nconst a = 1;")).toBe(
      "Text.\n\n```js\nconst a = 1;\n```",
    );
    expect(settleLiveMarkdown("```js\nconst a = 1;\n")).toBe("```js\nconst a = 1;\n```");
    // half of the closing fence is not code
    expect(settleLiveMarkdown("```js\nconst a = 1;\n``")).toBe("```js\nconst a = 1;\n```");
    expect(settleLiveMarkdown("~~~~\ncode\n~~~")).toBe("~~~~\ncode\n~~~~");
    // inside a list item and a quote the fence closes at their depth
    expect(settleLiveMarkdown("- item\n\n  ```sh\n  ls")).toBe("- item\n\n  ```sh\n  ls\n  ```");
    expect(settleLiveMarkdown("> ```\n> quoted")).toBe("> ```\n> quoted\n> ```");
    expect(settleLiveMarkdown("1. ```\n   one")).toBe("1. ```\n   one\n   ```");
    expect(shown("Text.\n\n```js\nconst a = `1")).toEqual([
      "paragraph: Text.",
      "codeBlock: const a = `1",
    ]);
    // marks inside the code are code, not marks to settle
    expect(settleLiveMarkdown("```\n**not bold")).toBe("```\n**not bold\n```");
  });

  it("reads a text written with CRLF line ends as one with LF, and keeps its line ends", () => {
    // finished: as it is, and no empty code block after the closed one
    const done = "Text.\r\n\r\n```js\r\nconst a = 1;\r\n```\r\n\r\nAfter";
    expect(settleLiveMarkdown(done)).toBe(done);
    expect(shown(done)).toEqual(shown(done.replaceAll("\r\n", "\n")));
    // an open code block is closed with the text's own line end
    expect(settleLiveMarkdown("```js\r\nconst a = 1;")).toBe("```js\r\nconst a = 1;\r\n```");
    expect(settleLiveMarkdown("```js\r\nconst a = 1;\r\n``")).toBe("```js\r\nconst a = 1;\r\n```");
    // a row being written stands under its table, an underline is text until its line is done
    expect(settleLiveMarkdown("| a | b |\r\n| --- | --- |\r\n| 1")).toBe(
      "| a | b |\r\n| --- | --- |\r\n\r\n| 1",
    );
    expect(shown("Title\r\n--")).toEqual(shown("Title\n--"));
  });

  it("takes a fence in an indented code block for code, and one in a list item for a fence", () => {
    // four spaces in: a line of an indented code block, finished as it is
    for (const text of [
      "Para.\n\n    ```\n    x = 1\n",
      "Para.\n\n\t```\n\tx = 1",
      "- item\n\n      ```\n      x = 1\n",
    ])
      expect(settleLiveMarkdown(text), JSON.stringify(text)).toBe(text);
    // in a list item, its content is where the fence is measured from: an item in an item too
    expect(settleLiveMarkdown("- a\n  - b\n\n    ```sh\n    ls")).toBe(
      "- a\n  - b\n\n    ```sh\n    ls\n    ```",
    );
    expect(settleLiveMarkdown("1. a\n\n   ```\n   one")).toBe("1. a\n\n   ```\n   one\n   ```");
    // a line of backticks four columns in is code of the open block, which stays open
    expect(settleLiveMarkdown("```\ncode\n    ```\nmore")).toBe("```\ncode\n    ```\nmore\n```");
    expect(shown("```\ncode\n    ```\nmore")).toEqual(["codeBlock: code\n    ```\nmore"]);
    // no space after a dash: no list item and no fence, a paragraph
    expect(shown("-```\ncode").map((block) => block.slice(0, block.indexOf(":")))).toEqual([
      "paragraph",
    ]);
  });

  it("does not turn the line above into a heading before the underline's line is done", () => {
    expect(shown("Title\n-")).toEqual(["paragraph: Title -"]);
    expect(shown("Title\n--")).toEqual(["paragraph: Title --"]);
    expect(shown("Title\n==")).toEqual(["paragraph: Title =="]);
    expect(shown("Title\n---\n")).toEqual(["heading: Title"]);
    expect(shown("Title\n- item")).toEqual(["paragraph: Title", "bulletList:  [listItem: item]"]);
    // after an empty line it is a list or a rule of its own
    expect(shown("Title\n\n---")).toEqual(["paragraph: Title", "divider: "]);
    // the first line may stand under a line of the page
    expect(settleLiveMarkdown("-")).toBe("\\-");
  });

  it("keeps the spaces at the end of the text being written, so its end stands after them", () => {
    // a paragraph, a heading, a list item and a row under its table keep what the next word follows
    expect(shown("Some word ")).toEqual(["paragraph: Some word "]);
    expect(shown("## Title ")).toEqual(["heading: Title "]);
    expect(shown("- item  ")).toEqual(["bulletList:  [listItem: item  ]"]);
    expect(shown("| a | b |\n| --- | --- |\n| `npm run ").at(-1)).toBe("paragraph: | `npm run ");
    expect(shown("Some **bold ")).toEqual(["paragraph: Some **bold "]);
    expect(shown("word\t")).toEqual(["paragraph: word\t"]);
    // a line break at the end, a line of markers alone, a thematic break, a backslash before the
    // space, a block of raw text: as they were
    for (const text of [
      "word \n",
      "word\n  ",
      "## ",
      "- [ ] ",
      "> ",
      "1. ",
      "*** ",
      "path\\ ",
      "<div>\n<p>text ",
      "$$\nx + y ",
    ])
      expect(settleLiveMarkdown(text), JSON.stringify(text)).toBe(text);
    // code keeps its own spaces
    expect(settleLiveMarkdown("```\ncode ")).toBe("```\ncode \n```");
    expect(settleLiveMarkdown("Para.\n\n    code ")).toBe("Para.\n\n    code ");
  });

  it("keeps a backslash at the very end as text", () => {
    expect(settleLiveMarkdown("A path C:\\")).toBe("A path C:\\\\");
    expect(settleLiveMarkdown("Done \\\\")).toBe("Done \\\\");
  });

  it("leaves task boxes, footnotes, rules and list markers to Markdown", () => {
    expect(shown("- [ ] task\n- [x] done **now")).toEqual([
      "todoList:  [todoItem: task, todoItem: done **now]",
    ]);
    expect(settleLiveMarkdown("* item\n* **bold** item\n")).toBe("* item\n* **bold** item\n");
    expect(settleLiveMarkdown("Text.\n\n***\n")).toBe("Text.\n\n***\n");
    expect(settleLiveMarkdown("A note[^1] here")).toBe("A note[^1] here");
  });
});

describe("settleLiveMarkdown: a long text of unfinished marks", () => {
  it("settles every one of many unfinished tags and links, the page's text after them unharmed", () => {
    const tags = "x <a ".repeat(2000);
    const settled = settleLiveMarkdown(tags);
    expect(settled.split("\\<a").length - 1).toBe(2000);
    expect(parse(`${settled}<b>after</b>`).map(look)).toEqual(
      parse(`${tags.replaceAll("<", "\\<")}<b>after</b>`).map(look),
    );
    const links = "[a](b ".repeat(2000);
    // the space it ends with stays, as a reference
    expect(settleLiveMarkdown(links)).toBe(`${links.replaceAll("[a]", "\\[a]").slice(0, -1)}&#32;`);
    // one closed link among them is a link
    expect(shown(`${links}[c](d)`).join()).toMatch(/link:c/);
    // a finished destination after many unfinished ones closes only its own
    expect(shown("[a](b [c](d) e").join()).toMatch(/link:c/);
  });
});

describe("settleLiveMarkdown: a text that grows character by character", () => {
  const SECTION = [
    "## A new section",
    "",
    "The **first** paragraph has `code`, a [link](https://example.com/a_b) and *more*.",
    "",
    "- one **bold** item",
    "- two with `ticks`",
    "  - nested ~~gone~~",
    "",
    "| name | value |",
    "| --- | ---: |",
    "| `a` | **1** |",
    "",
    "```ts",
    "const text = `**not bold**`;",
    "```",
    "",
    "The end, with a_snake_name and 2 * 3.",
    "",
  ].join("\n");

  it("never changes the blocks before the one being written, a table's head row aside", () => {
    let before: string[] = [];
    for (const text of growing(SECTION)) {
      const now = shown(text);
      // every block but the last two stays as it was (a table takes its head row, the paragraph before it)
      const settled = before.slice(0, -2);
      expect(now.slice(0, settled.length), JSON.stringify(text)).toEqual(settled);
      before = now;
    }
    expect(before).toEqual(parse(SECTION).map(look));
  });

  it("never changes the marks of the text after it in the same paragraph", () => {
    const rest = " and then **bold**, `code`, _em_, [a link](https://example.com) and ~~gone~~.";
    const tail = (text: string) => {
      const blocks = parse(`Start ${settleLiveMarkdown(text)}${rest}`);
      const last = look(blocks[blocks.length - 1]!);
      return last.slice(last.indexOf(" and then "));
    };
    const untouched = tail("");
    const inserted = "new **bold** `code` [link](https://example.com) _em_ ~~x~~ a*b c_d <b> [x] !";
    for (const text of growing(inserted)) expect(tail(text), JSON.stringify(text)).toBe(untouched);
    // every unfinished mark alone, right before the page's own text
    for (const open of [
      "**",
      "*",
      "_",
      "__",
      "~~",
      "`",
      "``",
      "[",
      "[a]",
      "[a](",
      "![",
      "<a",
      "\\",
    ])
      expect(tail(`x ${open}`), open).toBe(untouched);
  });

  it("never changes the blocks after it: an open code block or mark takes nothing of the page", () => {
    const page = "\n\n## Next\n\nThe page's **own** text.\n";
    const after = (text: string) =>
      parse(`${settleLiveMarkdown(text)}${page}`)
        .map(look)
        .slice(-2);
    const untouched = ["heading: Next", "paragraph: The page's |bold:own| text."];
    for (const text of growing("Intro **bold\n\n```js\nconst a = 1;\n```\n\n- item `x")) {
      expect(after(text), JSON.stringify(text)).toEqual(untouched);
    }
  });
});
