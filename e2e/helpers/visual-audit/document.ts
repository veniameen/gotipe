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

const LONG = "длинная строка, которая переносится на узком экране и проверяет первую строку блока";
/** An inline picture, so the audit loads nothing from the network. */
const IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#8aa"/></svg>',
)}`;
/** A paragraph that runs from the right: its handle stands in the right gutter (Atlas frame 28). */
const RTL = "פסקה מימין לשמאל: הידית עומדת בשוליים הימניים של הטקסט";
const CODE =
  'const message = "Привет, мир"; // длинная строка кода не помещается и листается внутри блока';

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
    block("heading", text("Заголовок первого уровня"), { level: 1 }),
    block("paragraph", text(`Абзац: ${LONG}.`)),
    block("heading", text("Заголовок второго уровня"), { level: 2 }),
    block("heading", text("Заголовок третьего уровня"), { level: 3 }),
    block("bulletList", null, {}, [
      item("Пункт маркированного списка"),
      item("Пункт со вложенным списком", [
        block("bulletList", null, {}, [
          item("Вложенный пункт", [block("bulletList", null, {}, [item("Третий уровень")])]),
        ]),
      ]),
    ]),
    block("orderedList", null, {}, [
      item("Первый пункт нумерованного списка"),
      item("Второй пункт со вложенным", [
        block("orderedList", null, {}, [item("Вложенный нумерованный")]),
      ]),
    ]),
    block("orderedList", null, { start: 99 }, [item("Девяносто девятый"), item("Сотый пункт")]),
    block("todoList", null, {}, [
      task("Cut the release note", true),
      task("Задача со вложенной", false, [
        block("todoList", null, {}, [task("Вложенная задача", false)]),
      ]),
      task("", false),
    ]),
    block("blockquote", text(`Цитата: ${LONG}`)),
    block("callout", text(`Выноска: ${LONG}`), { type: "info", emoji: "" }),
    block("codeBlock", CODE, { language: "typescript" }),
    block("math", "E = mc^2", { display: "block" }),
    block("table", null, {}, [
      cells("tableHeader", ["Ситуация", "Что видит автор", "Что сохраняется", "Примечание"]),
      cells("tableCell", ["Блок изменён у вас", "Ничего", "Ваша версия", "Примечание в ячейке"]),
    ]),
    block("image", null, { src: IMAGE, alt: "Картинка", caption: "Подпись к картинке" }),
    block("image", null, { src: "", alt: "" }),
    block("file", null, {
      url: "https://example.com/report.pdf",
      name: "report.pdf",
      size: 12345,
      mime_type: "application/pdf",
    }),
    block("embed", null, { url: "https://example.com/page", type: "generic" }),
    block("embed", null, { url: "", type: "generic" }),
    block("toggle", text("Переключатель"), { open: true }, [
      block("paragraph", text("Текст внутри переключателя")),
      block("bulletList", null, {}, [item("Пункт внутри переключателя")]),
    ]),
    block("columns", null, { count: 2 }, [
      block("column", null, {}, [block("paragraph", text(`Левая колонка: ${LONG}`))]),
      block("column", null, {}, [block("paragraph", text(`Правая колонка: ${LONG}`))]),
    ]),
    block("divider", null),
    block("paragraph", text(RTL)),
    block("paragraph", text("Последний абзац.")),
  ],
};

/** The same blocks as Markdown for PageEditor; its first «#» is the page title. */
export const AUDIT_MARKDOWN = `# Документ проверки

Абзац: ${LONG}.

# Заголовок первого уровня

## Заголовок второго уровня

### Заголовок третьего уровня

- Пункт маркированного списка
- Пункт со вложенным списком
  - Вложенный пункт
    - Третий уровень

1. Первый пункт нумерованного списка
2. Второй пункт со вложенным
   1. Вложенный нумерованный

Номера в три знака:

99. Девяносто девятый
100. Сотый пункт

- [x] Cut the release note
- [ ] Задача со вложенной
  - [ ] Вложенная задача

> Цитата: ${LONG}

> [!NOTE]
> Выноска: ${LONG}

\`\`\`typescript
${CODE}
\`\`\`

| Ситуация | Что видит автор | Что сохраняется | Примечание |
| --- | --- | --- | --- |
| Блок изменён у вас | Ничего | Ваша версия | Примечание в ячейке |

![Картинка](${IMAGE} "Подпись к картинке")

[report.pdf](attachments/report.pdf)

<details>
<summary>Сырой Markdown</summary>

Остаётся как есть.
</details>

---

${RTL}

Последний абзац.
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
  { name: "title", type: "heading", text: "Документ проверки", modes: ["page"] },
  { name: "heading-1", type: "heading", text: "Заголовок первого уровня" },
  { name: "paragraph", type: "paragraph", text: "Абзац:" },
  { name: "heading-2", type: "heading", text: "Заголовок второго уровня" },
  { name: "heading-3", type: "heading", text: "Заголовок третьего уровня" },
  { name: "bullet", type: "listItem", text: "Пункт маркированного списка" },
  { name: "bullet-nested", type: "listItem", text: "Вложенный пункт" },
  { name: "bullet-deep", type: "listItem", text: "Третий уровень" },
  { name: "ordered", type: "listItem", text: "Первый пункт нумерованного" },
  { name: "ordered-nested", type: "listItem", text: "Вложенный нумерованный" },
  { name: "ordered-wide", type: "listItem", text: "Сотый пункт" },
  { name: "todo", type: "todoItem", text: "Cut the release note" },
  { name: "todo-parent", type: "todoItem", text: "Задача со вложенной" },
  { name: "todo-nested", type: "todoItem", text: "Вложенная задача" },
  { name: "todo-empty", type: "todoItem", empty: true, modes: BLOCK_MODES },
  { name: "quote", type: "blockquote", text: "Цитата:" },
  { name: "callout", type: "callout", text: "Выноска:" },
  { name: "code", type: "codeBlock" },
  { name: "math", type: "math", modes: BLOCK_MODES },
  // the pointer at the formula's left: its TeX is centred, its handle is reached from its edge
  { name: "math-edge", type: "math", at: "edge", modes: BLOCK_MODES },
  { name: "table-header", type: "tableHeader", text: "Ситуация", unit: "table", line: "table" },
  { name: "table-cell", type: "tableCell", text: "Блок изменён", unit: "table", line: "table" },
  { name: "image", type: "image" },
  { name: "image-empty", type: "image", index: 1, modes: BLOCK_MODES },
  { name: "file", type: "file" },
  { name: "embed", type: "embed", modes: BLOCK_MODES },
  { name: "embed-empty", type: "embed", index: 1, modes: BLOCK_MODES },
  { name: "toggle", type: "toggle", text: "Переключатель", modes: BLOCK_MODES },
  {
    name: "toggle-child",
    type: "paragraph",
    text: "Текст внутри переключателя",
    unit: "toggle",
    modes: BLOCK_MODES,
  },
  {
    name: "toggle-list",
    type: "listItem",
    text: "Пункт внутри переключателя",
    modes: BLOCK_MODES,
  },
  {
    name: "column-left",
    type: "paragraph",
    text: "Левая колонка",
    unit: "columns",
    modes: BLOCK_MODES,
  },
  {
    name: "column-right",
    type: "paragraph",
    text: "Правая колонка",
    unit: "columns",
    modes: BLOCK_MODES,
  },
  { name: "raw", type: "markdownRaw", modes: ["page"] },
  { name: "divider", type: "divider" },
  { name: "rtl", type: "paragraph", text: "פסקה" },
  { name: "last", type: "paragraph", text: "Последний абзац" },
];

export const targetsFor = (mode: Mode) =>
  AUDIT_TARGETS.filter((target) => !target.modes || target.modes.includes(mode));
