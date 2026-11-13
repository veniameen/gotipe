import type { AttrValue, Block, Mark, TextSpan } from "@gotipe/core";
import { MigrationContext, type Note } from "./context";
import type { Quiet } from "./report";
import { holdsBlocks } from "./schema";
import {
  type SourceNode,
  attributes,
  children,
  drop,
  metadata,
  node,
  object,
  readJSON,
  rename,
} from "./source";
import { append } from "./text";
import type { MigrationOptions, MigrationResult } from "./types";
import { UnsupportedContent } from "./unsupported";

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

/** Tiptap's TextAlign writes `left` by default; GoTipe aligns only table cells. */
const quiet: Quiet = (_type, field, value) => field === "textAlign" && value === "left";

function idOf(value: SourceNode): AttrValue | undefined {
  return object(value.attrs) && value.attrs.id !== undefined ? value.attrs.id : value.id;
}

/** Splits a prosemirror-markdown info string (`params`) into `language` and `meta`. */
function codeInfo(attrs: SourceNode): void {
  if (typeof attrs.params !== "string" || attrs.language != null) return;
  const [, language = "", meta = ""] = /^(\S*)\s*(.*)$/s.exec(attrs.params.trim()) ?? [];
  drop(attrs, ["params"]);
  if (language) attrs.language = language;
  if (meta) attrs.meta = meta;
}

/** Convert ProseMirror JSON, including Tiptap's camelCase extension names. */
export function convertProseMirrorToGoTipe(
  input: unknown,
  options: MigrationOptions = {},
): MigrationResult {
  const context = new MigrationContext("ProseMirror/Tiptap", options, { quiet, idOf });
  const root = node(readJSON(input), "root");
  if (root.type !== "doc") throw new Error("ProseMirror root must have type doc");
  const blockMap = { ...blocks, ...options.blockTypeMap };
  const markMap = { ...marks, ...options.markTypeMap };

  function mark(value: SourceNode, path: string, notes: Note[]): Mark[] {
    if (typeof value.type !== "string") throw new Error("ProseMirror mark requires type");
    notes.push({ path, sourceType: value.type, fields: metadata(value, ["type", "attrs"]) });
    const attrs = attributes(value);
    if (value.type === "textStyle" && !options.markTypeMap?.textStyle) {
      // Tiptap's TextStyle carries colors with other text styles; only the colors are marks.
      const result: Mark[] = [];
      if (typeof attrs.color === "string") {
        result.push(context.mark("textColor", { color: attrs.color }, path, "textStyle", notes));
        drop(attrs, ["color"]);
      }
      if (typeof attrs.backgroundColor === "string") {
        const color = attrs.backgroundColor;
        result.push(context.mark("highlight", { color }, path, "textStyle", notes));
        drop(attrs, ["backgroundColor"]);
      }
      notes.push({ path: `${path}.attrs`, sourceType: "textStyle", fields: attrs });
      return result;
    }
    const type = markMap[value.type];
    if (!type) throw new UnsupportedContent(`Unknown mark ${value.type}`);
    return [context.mark(type, attrs, `${path}.attrs`, value.type, notes)];
  }

  function inline(value: SourceNode, path: string, notes: Note[]): TextSpan[] | null {
    if (value.type === "hard_break" || value.type === "hardBreak")
      return [{ text: "\n", marks: [] }];
    if (value.type !== "text") return null;
    if (typeof value.text !== "string") throw new Error("ProseMirror text node requires text");
    if (Object.keys(metadata(value, ["type", "text", "marks"])).length)
      throw new UnsupportedContent("Unsupported text node metadata");
    const styles = children(value, "marks", path).flatMap((item, index) =>
      mark(item, `${path}.marks[${index}]`, notes),
    );
    return [{ text: value.text, marks: styles }];
  }

  function convert(value: SourceNode, path: string, parent: string | null): Block {
    return context.recover(value, path, parent, () => {
      const sourceType = typeof value.type === "string" ? value.type : "";
      const type = blockMap[sourceType];
      if (!type) throw new UnsupportedContent(`Unknown node ${sourceType}`);
      const items = children(value, "content", path);
      const only = items.length === 1 ? items[0] : undefined;
      if (type === "paragraph" && only && blockMap[String(only.type)] === "image") {
        // ProseMirror's basic schema keeps images inline: a paragraph of one image is the image.
        const image = convert(only, `${path}.content[0]`, parent);
        context.attach(image, `${path}.attrs`, sourceType, attributes(value));
        context.attach(image, path, sourceType, metadata(value, ["type", "attrs", "content"]));
        return image;
      }
      const attrs = attributes(value);
      const ownId = "id" in attrs;
      const id = ownId ? attrs.id : value.id;
      drop(attrs, ["id"]);
      const notes: Note[] = [
        { path, sourceType, fields: metadata(value, ["type", "attrs", "content", "id"]) },
      ];
      if (ownId && value.id !== undefined)
        notes.push({ path, sourceType, fields: { id: value.id } });
      if (type === "orderedList") {
        rename(attrs, "order", "start");
        attrs.start ??= 1;
      }
      if (type === "codeBlock") codeInfo(attrs);
      if (type === "tableCell" || type === "tableHeader") rename(attrs, "textAlign", "align");
      const level = attrs.level;
      if (
        type === "heading" &&
        !(typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 6)
      )
        throw new UnsupportedContent("Invalid heading level");
      const content: TextSpan[] = [];
      const descendants: Block[] = [];
      for (const [index, child] of items.entries()) {
        const childPath = `${path}.content[${index}]`;
        const spans = inline(child, childPath, notes);
        if (spans) {
          if (descendants.length)
            throw new UnsupportedContent(
              "Interleaved text and child blocks require a custom mapping",
            );
          for (const span of spans) append(content, span.text, span.marks);
        } else {
          if (!holdsBlocks(type))
            throw new UnsupportedContent(`Inline node ${String(child.type)} cannot be represented`);
          descendants.push(convert(child, childPath, type));
        }
      }
      return context.block({
        type,
        sourceType,
        path,
        attrs,
        attrsPath: `${path}.attrs`,
        content,
        children: descendants,
        id,
        idPath: ownId ? `${path}.attrs` : path,
        notes,
      });
    });
  }
  const top = children(root, "content", "root").map((child, index) =>
    convert(child, `content[${index}]`, null),
  );
  return context.result(top, [
    { path: "root", sourceType: "doc", fields: metadata(root, ["type", "content"]) },
  ]);
}
