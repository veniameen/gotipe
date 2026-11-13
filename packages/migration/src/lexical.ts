import type { Block, Mark, TextSpan } from "@gotipe/core";
import { MigrationContext, type Note } from "./context";
import type { Quiet } from "./report";
import { holdsBlocks } from "./schema";
import { type SourceNode, children, drop, metadata, node, readJSON, rename, take } from "./source";
import { append } from "./text";
import type { MigrationOptions, MigrationResult } from "./types";
import { UnsupportedContent } from "./unsupported";

const blocks: Record<string, string> = {
  paragraph: "paragraph",
  heading: "heading",
  list: "bulletList",
  listitem: "listItem",
  code: "codeBlock",
  quote: "blockquote",
  horizontalrule: "divider",
  image: "image",
  table: "table",
  tablecell: "tableCell",
  tablerow: "tableRow",
};
const formats: [number, string][] = [
  [1, "bold"],
  [2, "italic"],
  [4, "strikethrough"],
  [8, "underline"],
  [16, "code"],
  [32, "subscript"],
  [64, "superscript"],
  [128, "highlight"],
];
/** Fields every Lexical element serializes; GoTipe has no direction or indentation. */
const ELEMENT_FIELDS = ["direction", "format", "indent", "version", "textFormat", "textStyle"];

/** Lexical's defaults: reported in `unmapped`, but they change nothing a reader sees. */
const quiet: Quiet = (type, field, value) => {
  switch (field) {
    case "version":
    case "textFormat":
    case "textStyle":
      return true;
    case "direction":
      return value === "ltr";
    case "format":
      return value === "" || value === "left" || value === "start";
    case "indent":
      // A list item's indentation is its nesting, which the document keeps.
      return value === 0 || type === "listitem";
    case "value":
      return type === "listitem";
    case "start":
      return type === "list" && value === 1;
    case "headerState":
      return type === "tablecell";
    case "width":
    case "height":
      return type === "image" && value === 0;
    case "maxWidth":
      return type === "image";
    case "showCaption":
      return type === "image" && value === false;
    default:
      return false;
  }
};

/** Convert serialized Lexical editor state without depending on its runtime. */
export function convertLexicalToGoTipe(
  input: unknown,
  options: MigrationOptions = {},
): MigrationResult {
  const context = new MigrationContext("Lexical", options, { quiet, idOf: (value) => value.id });
  const state = node(readJSON(input), "state");
  const root = node(state.root ?? null, "root");
  if (root.type !== "root") throw new Error("Lexical root must have type root");
  const blockMap = { ...blocks, ...options.blockTypeMap };

  function link(value: SourceNode, path: string, notes: Note[]): Mark {
    if (typeof value.url !== "string") throw new Error("Lexical link requires url");
    const attrs = metadata(value, ["type", "children", "url"]);
    const own: SourceNode = {};
    take(attrs, ELEMENT_FIELDS, own);
    notes.push({ path, sourceType: String(value.type), fields: own });
    return context.mark("link", { ...attrs, href: value.url }, path, String(value.type), notes);
  }

  /** Colors become marks; other CSS declarations are reported. */
  function style(value: SourceNode, path: string, notes: Note[], marks: Mark[]): void {
    if (typeof value.style !== "string" || !value.style.trim()) return;
    const other: string[] = [];
    for (const declaration of value.style.split(";")) {
      if (!declaration.trim()) continue;
      const separator = declaration.indexOf(":");
      const property = declaration.slice(0, Math.max(separator, 0)).trim().toLowerCase();
      const color = declaration.slice(separator + 1).trim();
      if (separator >= 0 && color && (property === "color" || property === "background-color"))
        marks.push({ type: property === "color" ? "textColor" : "highlight", attrs: { color } });
      else other.push(declaration.trim());
    }
    notes.push({
      path,
      sourceType: String(value.type),
      fields: { style: other.join("; ") || null },
    });
  }

  function inline(
    value: SourceNode,
    path: string,
    notes: Note[],
    inherited: Mark[] = [],
    code = false,
  ): TextSpan[] | null {
    if (value.type === "linebreak") return [{ text: "\n", marks: inherited }];
    if (value.type === "tab") return [{ text: "\t", marks: inherited }];
    if (value.type === "link" || value.type === "autolink") {
      const marks = [...inherited, link(value, path, notes)];
      const spans: TextSpan[] = [];
      for (const [index, child] of children(value, "children", path).entries()) {
        const converted = inline(child, `${path}.children[${index}]`, notes, marks, code);
        if (!converted) throw new UnsupportedContent("Block nested inside a link");
        for (const span of converted) append(spans, span.text, span.marks);
      }
      return spans;
    }
    if (value.type !== "text" && !(code && value.type === "code-highlight")) return null;
    if (typeof value.text !== "string") throw new Error("Lexical text node requires text");
    const format = value.format ?? 0;
    if (typeof format !== "number" || !Number.isInteger(format) || format < 0 || format > 255) {
      throw new UnsupportedContent("Unsupported Lexical text format flags");
    }
    if (
      (value.mode !== undefined && value.mode !== "normal") ||
      (value.detail !== undefined && value.detail !== 0)
    ) {
      throw new UnsupportedContent("Lexical token/segmented text requires a custom representation");
    }
    const marks = [...inherited];
    for (const [flag, type] of formats)
      if (format & flag) marks.push({ type: options.markTypeMap?.[type] ?? type, attrs: {} });
    style(value, path, notes, marks);
    const known = ["type", "text", "format", "style", "mode", "detail", "version", "highlightType"];
    const unknown = Object.keys(metadata(value, known));
    if (unknown.length)
      throw new UnsupportedContent(`Unsupported Lexical text properties: ${unknown.join(", ")}`);
    return [{ text: value.text, marks }];
  }

  /** Renames Lexical fields to GoTipe attributes; fields known to have none go to `unmapped`. */
  function fields(value: SourceNode, sourceType: string, type: string) {
    const attrs = metadata(value, ["type", "children", "id"]);
    const unmapped: SourceNode = {};
    if (sourceType === "list" && !options.blockTypeMap?.list) {
      drop(attrs, ["listType", "tag"]);
      if (type === "orderedList") attrs.start = value.start ?? 1;
    }
    if (sourceType === "heading") {
      attrs.level = Number(String(value.tag)[1]);
      drop(attrs, ["tag"]);
    }
    if (sourceType === "tablecell") {
      take(attrs, ["headerState"], unmapped);
      rename(attrs, "colSpan", "colspan");
      rename(attrs, "rowSpan", "rowspan");
      if (typeof attrs.format === "string" && attrs.format) rename(attrs, "format", "align");
    }
    if (sourceType === "image") {
      rename(attrs, "altText", "alt");
      // Lexical writes 0 for a size that follows the content ("inherit").
      for (const side of ["width", "height"]) {
        const size = attrs[side];
        if (!(typeof size === "number" && size > 0)) take(attrs, [side], unmapped);
      }
    }
    take(attrs, ELEMENT_FIELDS, unmapped);
    return { attrs, unmapped };
  }

  function convert(value: SourceNode, path: string, parent: string | null): Block {
    return context.recover(value, path, parent, () => {
      const sourceType = typeof value.type === "string" ? value.type : "";
      let type = blockMap[sourceType];
      if (!type) throw new UnsupportedContent(`Unknown node ${sourceType}`);
      const items = children(value, "children", path);
      const only = items.length === 1 ? items[0] : undefined;
      if (type === "paragraph" && only && blockMap[String(only.type)] === "image") {
        // Lexical's image is inline: a paragraph of one image is the image.
        const image = convert(only, `${path}.children[0]`, parent);
        context.attach(image, path, sourceType, metadata(value, ["type", "children"]));
        return image;
      }
      if (sourceType === "list" && !options.blockTypeMap?.list) {
        const kind = value.listType ?? (value.tag === "ol" ? "number" : "bullet");
        if (!["number", "bullet", "check"].includes(String(kind)))
          throw new UnsupportedContent(`Unknown list type ${String(kind)}`);
        type = kind === "number" ? "orderedList" : kind === "check" ? "todoList" : "bulletList";
      }
      if (sourceType === "listitem" && parent === "todoList") type = "todoItem";
      if (sourceType === "tablecell" && typeof value.headerState === "number" && value.headerState)
        type = "tableHeader";
      if (
        sourceType === "heading" &&
        !(typeof value.tag === "string" && /^h[1-6]$/.test(value.tag))
      )
        throw new UnsupportedContent("Invalid heading tag");
      const { attrs, unmapped } = fields(value, sourceType, type);
      const spans: TextSpan[] = [];
      const descendants: Block[] = [];
      const notes: Note[] = [];
      for (const [index, child] of items.entries()) {
        const childPath = `${path}.children[${index}]`;
        const converted = inline(child, childPath, notes, [], type === "codeBlock");
        if (converted) {
          if (descendants.length)
            throw new UnsupportedContent(
              "Interleaved text and child blocks require a custom mapping",
            );
          for (const span of converted) append(spans, span.text, span.marks);
        } else {
          if (!holdsBlocks(type))
            throw new UnsupportedContent(`Unknown inline node ${String(child.type)}`);
          descendants.push(convert(child, childPath, type));
        }
      }
      return context.block({
        type,
        sourceType,
        path,
        attrs,
        content: spans,
        children: descendants,
        id: value.id,
        unmapped,
        notes,
      });
    });
  }
  const top = children(root, "children", "root").map((child, index) =>
    convert(child, `root.children[${index}]`, null),
  );
  return context.result(top, [
    { path: "root", sourceType: "root", fields: metadata(root, ["type", "children"]) },
    { path: "state", sourceType: "editorState", fields: metadata(state, ["root"]) },
  ]);
}
