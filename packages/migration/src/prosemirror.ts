import type { Block, Mark, TextSpan } from "@gotipe/core";
import {
  MigrationContext,
  type SourceNode,
  UnsupportedContent,
  append,
  attributes,
  children,
  metadata,
  node,
  readJSON,
} from "./context";
import type { MigrationOptions, MigrationResult } from "./types";

const blocks: Record<string, string> = {
  paragraph: "paragraph",
  heading: "heading",
  blockquote: "blockquote",
  image: "image",
  table: "table",
  bullet_list: "bulletList",
  bulletList: "bulletList",
  ordered_list: "orderedList",
  orderedList: "orderedList",
  list_item: "listItem",
  listItem: "listItem",
  code_block: "codeBlock",
  codeBlock: "codeBlock",
  horizontal_rule: "divider",
  horizontalRule: "divider",
  table_row: "tableRow",
  tableRow: "tableRow",
  table_cell: "tableCell",
  tableCell: "tableCell",
  table_header: "tableHeader",
  tableHeader: "tableHeader",
  taskList: "todoList",
  taskItem: "todoItem",
};
const marks: Record<string, string> = {
  bold: "bold",
  strong: "bold",
  italic: "italic",
  em: "italic",
  underline: "underline",
  strike: "strikethrough",
  strikethrough: "strikethrough",
  code: "code",
  link: "link",
  highlight: "highlight",
  subscript: "subscript",
  superscript: "superscript",
  textColor: "textColor",
};

/** Convert ProseMirror JSON, including Tiptap's camelCase extension names. */
export function convertProseMirrorToGoTipe(
  input: unknown,
  options: MigrationOptions = {},
): MigrationResult {
  const context = new MigrationContext("ProseMirror/Tiptap", options);
  const root = node(readJSON(input), "root");
  if (root.type !== "doc") throw new Error("ProseMirror root must have type doc");
  const blockMap = { ...blocks, ...options.blockTypeMap };
  const markMap = { ...marks, ...options.markTypeMap };

  function inline(value: SourceNode): TextSpan[] | null {
    if (value.type === "hard_break" || value.type === "hardBreak")
      return [{ text: "\n", marks: [] }];
    if (value.type !== "text") return null;
    if (typeof value.text !== "string") throw new Error("ProseMirror text node requires text");
    if (Object.keys(metadata(value, ["type", "text", "marks"])).length)
      throw new UnsupportedContent("Unsupported text node metadata");
    const styles: Mark[] = [];
    for (const mark of children(value, "marks", "text")) {
      if (typeof mark.type !== "string") throw new Error("ProseMirror mark requires type");
      if (mark.type === "textStyle" && !options.markTypeMap?.textStyle) {
        const attrs = attributes(mark);
        const unsupported = Object.keys(attrs).filter(
          (key) => !["color", "backgroundColor"].includes(key) && attrs[key] !== null,
        );
        if (unsupported.length)
          throw new UnsupportedContent(
            `Unsupported textStyle properties: ${unsupported.join(", ")}`,
          );
        if (typeof attrs.color === "string")
          styles.push({ type: "textColor", attrs: { color: attrs.color } });
        if (typeof attrs.backgroundColor === "string")
          styles.push({ type: "highlight", attrs: { color: attrs.backgroundColor } });
        continue;
      }
      const type = markMap[mark.type];
      if (!type) throw new UnsupportedContent(`Unknown mark ${mark.type}`);
      styles.push({ type, attrs: attributes(mark) });
    }
    return [{ text: value.text, marks: styles }];
  }

  function convert(value: SourceNode, path: string): Block {
    return context.recover(value, path, () => {
      const sourceType = typeof value.type === "string" ? value.type : "";
      const type = blockMap[sourceType];
      if (!type) throw new UnsupportedContent(`Unknown node ${sourceType}`);
      const attrs = attributes(value);
      const extra = metadata(value, ["type", "attrs", "content", "id"]);
      if (Object.keys(extra).length) attrs.migrationNodeMetadata = extra;
      if (type === "orderedList") attrs.start = attrs.start ?? attrs.order ?? 1;
      if (typeof attrs.textAlign === "string") attrs.align = attrs.textAlign;
      if (
        type === "heading" &&
        (typeof attrs.level !== "number" || attrs.level < 1 || attrs.level > 6)
      )
        throw new UnsupportedContent("Invalid heading level");
      const content: TextSpan[] = [];
      const descendants: Block[] = [];
      const items = children(value, "content", path);
      for (const [index, child] of items.entries()) {
        const spans = inline(child);
        if (spans) {
          if (descendants.length)
            throw new UnsupportedContent(
              "Interleaved text and child blocks require a custom mapping",
            );
          for (const span of spans) append(content, span.text, span.marks);
        } else {
          if (["paragraph", "heading", "codeBlock"].includes(type))
            throw new UnsupportedContent(`Inline node ${String(child.type)} cannot be represented`);
          descendants.push(convert(child, `${path}.content[${index}]`));
        }
      }
      return context.block(type, attrs, content, descendants, attrs.id ?? value.id);
    });
  }
  return context.result(
    children(root, "content", "root").map((child, index) => convert(child, `content[${index}]`)),
    metadata(root, ["type", "content"]),
  );
}
