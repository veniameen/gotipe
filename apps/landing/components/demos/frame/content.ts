import type { AttrValue, Block, Document, Mark, TextSpan } from "@gotipe/core";

/**
 * Small builders for the demos' documents. Ids are stable per document (a prefix and a counter),
 * so a reset builds the same document again.
 */
type Span = TextSpan;
type Attrs = Record<string, AttrValue>;

export const text = (value: string, ...marks: Mark[]): Span => ({ text: value, marks });
export const mark = (type: string, attrs: Attrs = {}): Mark => ({ type, attrs });
export const bold = mark("bold");
export const italic = mark("italic");
export const code = mark("code");
export const link = (href: string): Mark => mark("link", { href });

export function documentOf(prefix: string, build: (b: Builders) => Block[]): Document {
  let next = 0;
  const id = () => `${prefix}-${++next}`;
  const block = (
    type: string,
    content: Span[] | string | null,
    attrs: Attrs = {},
    children: Block[] = [],
  ): Block => ({ id: id(), type, attrs, content, children });
  const builders: Builders = {
    block,
    paragraph: (...spans) => block("paragraph", spans),
    heading: (level, value) => block("heading", [text(value)], { level }),
    item: (spans, children = []) =>
      block("listItem", typeof spans === "string" ? [text(spans)] : spans, {}, children),
    list: (type, items) => block(type, null, {}, items),
    task: (value, checked) => block("todoItem", [text(value)], { checked }),
    codeBlock: (language, source) => block("codeBlock", source, { language }),
    table: (rows, attrs = {}) => block("table", null, attrs, rows),
    row: (cells) => block("tableRow", null, {}, cells),
    cell: (value, attrs = {}, header = false) =>
      block(
        header ? "tableHeader" : "tableCell",
        typeof value === "string" ? [text(value)] : value,
        attrs,
      ),
  };
  return { version: 1, blocks: build(builders) };
}

export interface Builders {
  block(type: string, content: Span[] | string | null, attrs?: Attrs, children?: Block[]): Block;
  paragraph(...spans: Span[]): Block;
  heading(level: number, value: string): Block;
  item(spans: string | Span[], children?: Block[]): Block;
  list(type: "bulletList" | "orderedList" | "todoList", items: Block[]): Block;
  task(value: string, checked: boolean): Block;
  codeBlock(language: string, source: string): Block;
  table(rows: Block[], attrs?: Attrs): Block;
  row(cells: Block[]): Block;
  cell(value: string | Span[], attrs?: Attrs, header?: boolean): Block;
}
