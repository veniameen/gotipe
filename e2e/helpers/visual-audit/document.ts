/**
 * The document of the visual audit: every block kind the views draw, nested lists and tasks
 * included, with text long enough to wrap on a phone. BlockEditor gets it as JSON; PageEditor
 * reads Markdown, so it gets the same blocks Markdown can hold.
 */

export type Mode = "page" | "block" | "views";

interface Span {
  text: string;
  marks: never[];
}
interface Block {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  content: Span[] | string | null;
  children: Block[];
}

const LONG = "a long line that wraps on a narrow screen and checks the first line of the block";
/** An inline picture, so the audit loads nothing from the network. */
const IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#8aa"/></svg>',
)}`;
/** A paragraph that runs from the right: its handle stands in the right gutter (Atlas frame 28). */
const RTL = "פסקה מימין לשמאל: הידית עומדת בשוליים הימניים של הטקסט";
const CODE =
  'const message = "Hello, world"; // a long line of code does not fit and scrolls inside the block';

let next = 0;
const text = (value: string): Span[] => [{ text: value, marks: [] }];
const block = (
  type: string,
  content: Span[] | string | null,
  attrs: Record<string, unknown> = {},
  children: Block[] = [],
): Block => ({ id: `audit-${++next}`, type, attrs, content, children });
const item = (value: string, children: Block[] = []) =>
  block("listItem", text(value), {}, children);
const task = (value: string, checked: boolean, children: Block[] = []) =>
  block("todoItem", text(value), { checked }, children);
const cells = (type: "tableHeader" | "tableCell", values: string[]) =>
  block(
    "tableRow",
    null,
    {},
    values.map((value) => block(type, text(value))),
  );

export const AUDIT_DOCUMENT = {
  version: 1,
  blocks: [
    block("heading", text("First-level heading"), { level: 1 }),
    block("paragraph", text(`Paragraph: ${LONG}.`)),
    block("heading", text("Second-level heading"), { level: 2 }),
    block("heading", text("Third-level heading"), { level: 3 }),
    block("bulletList", null, {}, [
      item("Bulleted list item"),
      item("Item with a nested list", [
        block("bulletList", null, {}, [
          item("Nested item", [block("bulletList", null, {}, [item("Third level")])]),
        ]),
      ]),
    ]),
    block("orderedList", null, {}, [
      item("First item of the numbered list"),
      item("Second item with a nested one", [
        block("orderedList", null, {}, [item("Nested numbered item")]),
      ]),
    ]),
    block("orderedList", null, { start: 99 }, [item("Ninety-ninth item"), item("Hundredth item")]),
    block("todoList", null, {}, [
      task("Cut the release note", true),
      task("Task with a nested one", false, [
        block("todoList", null, {}, [task("Nested task", false)]),
      ]),
      task("", false),
    ]),
    block("blockquote", text(`Quote: ${LONG}`)),
    block("callout", text(`Callout: ${LONG}`), { type: "info", emoji: "" }),
    block("codeBlock", CODE, { language: "typescript" }),
    block("math", "E = mc^2", { display: "block" }),
    block("table", null, {}, [
      cells("tableHeader", ["Situation", "What the author sees", "What is kept", "Note"]),
      cells("tableCell", ["Block changed on your side", "Nothing", "Your version", "A note in a cell"]),
    ]),
    block("image", null, { src: IMAGE, alt: "Picture", caption: "A caption for the picture" }),
    block("image", null, { src: "", alt: "" }),
    block("file", null, {
      url: "https://example.com/report.pdf",
      name: "report.pdf",
      size: 12345,
      mime_type: "application/pdf",
    }),
    block("embed", null, { url: "https://example.com/page", type: "generic" }),
    block("embed", null, { url: "", type: "generic" }),
    block("toggle", text("Toggle"), { open: true }, [
      block("paragraph", text("Text inside the toggle")),
      block("bulletList", null, {}, [item("Item inside the toggle")]),
    ]),
    block("columns", null, { count: 2 }, [
      block("column", null, {}, [block("paragraph", text(`Left column: ${LONG}`))]),
      block("column", null, {}, [block("paragraph", text(`Right column: ${LONG}`))]),
    ]),
    block("divider", null),
    block("paragraph", text(RTL)),
    block("paragraph", text("Last paragraph.")),
  ],
};

/** The same blocks as Markdown for PageEditor; its first “#” is the page title. */
export const AUDIT_MARKDOWN = `# Audit document

Paragraph: ${LONG}.

# First-level heading

## Second-level heading

### Third-level heading

- Bulleted list item
- Item with a nested list
  - Nested item
    - Third level

1. First item of the numbered list
2. Second item with a nested one
   1. Nested numbered item

Three-digit numbers:

99. Ninety-ninth item
100. Hundredth item

- [x] Cut the release note
- [ ] Task with a nested one
  - [ ] Nested task

> Quote: ${LONG}

> [!NOTE]
> Callout: ${LONG}

\`\`\`typescript
${CODE}
\`\`\`

| Situation | What the author sees | What is kept | Note |
| --- | --- | --- | --- |
| Block changed on your side | Nothing | Your version | A note in a cell |

![Picture](${IMAGE} "A caption for the picture")

[report.pdf](attachments/report.pdf)

<details>
<summary>Raw Markdown</summary>

Stays as it is.
</details>

---

${RTL}

Last paragraph.
`;

/** A block the pointer rests on, and what its handle must act on and line up with. */
export interface AuditTarget {
  /** The name in the report and in the names of snapshots. */
  name: string;
  /** `data-block-type` of the block under the pointer. */
  type: string;
  /** The start of the block's own text; without it, the block of the type at `index`. */
  text?: string;
  index?: number;
  /** A block without text: the first such block of the type. */
  empty?: boolean;
  /** Where the pointer rests: at the start of the block's text (default) or at its edge. */
  at?: "text" | "edge";
  /** What the grip moves: the block itself, or the table, columns or toggle it stands in. */
  unit?: "self" | "table" | "columns" | "toggle";
  /** Whose first line the handle stands at: the block's own, or its table's (Atlas frame 9). */
  line?: "self" | "table";
  /** Modes whose editor has this block; all three without it. */
  modes?: Mode[];
}

const BLOCK_MODES: Mode[] = ["block", "views"];

export const AUDIT_TARGETS: AuditTarget[] = [
  { name: "title", type: "heading", text: "Audit document", modes: ["page"] },
  { name: "heading-1", type: "heading", text: "First-level heading" },
  { name: "paragraph", type: "paragraph", text: "Paragraph:" },
  { name: "heading-2", type: "heading", text: "Second-level heading" },
  { name: "heading-3", type: "heading", text: "Third-level heading" },
  { name: "bullet", type: "listItem", text: "Bulleted list item" },
  { name: "bullet-nested", type: "listItem", text: "Nested item" },
  { name: "bullet-deep", type: "listItem", text: "Third level" },
  { name: "ordered", type: "listItem", text: "First item of the numbered" },
  { name: "ordered-nested", type: "listItem", text: "Nested numbered item" },
  { name: "ordered-wide", type: "listItem", text: "Hundredth item" },
  { name: "todo", type: "todoItem", text: "Cut the release note" },
  { name: "todo-parent", type: "todoItem", text: "Task with a nested one" },
  { name: "todo-nested", type: "todoItem", text: "Nested task" },
  { name: "todo-empty", type: "todoItem", empty: true, modes: BLOCK_MODES },
  { name: "quote", type: "blockquote", text: "Quote:" },
  { name: "callout", type: "callout", text: "Callout:" },
  { name: "code", type: "codeBlock" },
  { name: "math", type: "math", modes: BLOCK_MODES },
  // the pointer at the formula's left: its TeX is centred, its handle is reached from its edge
  { name: "math-edge", type: "math", at: "edge", modes: BLOCK_MODES },
  { name: "table-header", type: "tableHeader", text: "Situation", unit: "table", line: "table" },
  { name: "table-cell", type: "tableCell", text: "Block changed", unit: "table", line: "table" },
  { name: "image", type: "image" },
  { name: "image-empty", type: "image", index: 1, modes: BLOCK_MODES },
  { name: "file", type: "file" },
  { name: "embed", type: "embed", modes: BLOCK_MODES },
  { name: "embed-empty", type: "embed", index: 1, modes: BLOCK_MODES },
  { name: "toggle", type: "toggle", text: "Toggle", modes: BLOCK_MODES },
  {
    name: "toggle-child",
    type: "paragraph",
    text: "Text inside the toggle",
    unit: "toggle",
    modes: BLOCK_MODES,
  },
  {
    name: "toggle-list",
    type: "listItem",
    text: "Item inside the toggle",
    modes: BLOCK_MODES,
  },
  {
    name: "column-left",
    type: "paragraph",
    text: "Left column",
    unit: "columns",
    modes: BLOCK_MODES,
  },
  {
    name: "column-right",
    type: "paragraph",
    text: "Right column",
    unit: "columns",
    modes: BLOCK_MODES,
  },
  { name: "raw", type: "markdownRaw", modes: ["page"] },
  { name: "divider", type: "divider" },
  { name: "rtl", type: "paragraph", text: "פסקה" },
  { name: "last", type: "paragraph", text: "Last paragraph" },
];

export const targetsFor = (mode: Mode) =>
  AUDIT_TARGETS.filter((target) => !target.modes || target.modes.includes(mode));
