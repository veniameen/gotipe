import type { Block, Mark, TextSpan } from "@gotipe/core";
import {
  MigrationContext,
  type SourceNode,
  UnsupportedContent,
  append,
  children,
  metadata,
  node,
  readJSON,
} from "./context";
import type { MigrationOptions, MigrationResult } from "./types";

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

/** Convert serialized Lexical editor state without depending on its runtime. */
export function convertLexicalToGoTipe(
  input: unknown,
  options: MigrationOptions = {},
): MigrationResult {
  const context = new MigrationContext("Lexical", options);
  const state = node(readJSON(input), "state");
  const root = node(state.root ?? null, "root");
  if (root.type !== "root") throw new Error("Lexical root must have type root");
  const blockMap = { ...blocks, ...options.blockTypeMap };

  function inline(value: SourceNode, inherited: Mark[] = [], code = false): TextSpan[] | null {
    if (value.type === "linebreak") return [{ text: "\n", marks: inherited }];
    if (value.type === "tab") return [{ text: "\t", marks: inherited }];
    if (value.type === "link" || value.type === "autolink") {
      if (typeof value.url !== "string") throw new Error("Lexical link requires url");
      const mark = {
        type: "link",
        attrs: { ...metadata(value, ["type", "children"]), href: value.url },
      };
      const spans: TextSpan[] = [];
      for (const child of children(value, "children", "link")) {
        const converted = inline(child, [...inherited, mark], code);
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
    if (typeof value.style === "string" && value.style.trim()) {
      for (const declaration of value.style.split(";")) {
        if (!declaration.trim()) continue;
        const separator = declaration.indexOf(":");
        const property = declaration.slice(0, separator).trim().toLowerCase();
        const color = declaration.slice(separator + 1).trim();
        if (separator < 0 || !color || !["color", "background-color"].includes(property)) {
          throw new UnsupportedContent(`Unsupported Lexical text style ${property}`);
        }
        marks.push({ type: property === "color" ? "textColor" : "highlight", attrs: { color } });
      }
    }
    const unknown = Object.keys(
      metadata(value, [
        "type",
        "text",
        "format",
        "style",
        "mode",
        "detail",
        "version",
        "highlightType",
      ]),
    );
    if (unknown.length)
      throw new UnsupportedContent(`Unsupported Lexical text properties: ${unknown.join(", ")}`);
    return [{ text: value.text, marks }];
  }

  function convert(value: SourceNode, path: string, parentList?: string): Block {
    return context.recover(value, path, () => {
      const sourceType = typeof value.type === "string" ? value.type : "";
      let type = blockMap[sourceType];
      if (!type) throw new UnsupportedContent(`Unknown node ${sourceType}`);
      const attrs = metadata(value, ["type", "children"]);
      if (sourceType === "list" && !options.blockTypeMap?.list) {
        const kind = value.listType ?? (value.tag === "ol" ? "number" : "bullet");
        if (!["number", "bullet", "check"].includes(String(kind)))
          throw new UnsupportedContent(`Unknown list type ${String(kind)}`);
        type = kind === "number" ? "orderedList" : kind === "check" ? "todoList" : "bulletList";
        if (type === "orderedList") attrs.start = value.start ?? 1;
      }
      if (sourceType === "listitem" && parentList === "todoList") type = "todoItem";
      if (
        sourceType === "tablecell" &&
        typeof value.headerState === "number" &&
        value.headerState !== 0
      )
        type = "tableHeader";
      if (typeof value.colSpan === "number") attrs.colspan = value.colSpan;
      if (typeof value.rowSpan === "number") attrs.rowspan = value.rowSpan;
      if (typeof value.altText === "string") attrs.alt = value.altText;
      if (typeof value.format === "string" && value.format) attrs.align = value.format;
      if (sourceType === "heading") {
        if (typeof value.tag !== "string" || !/^h[1-6]$/.test(value.tag))
          throw new UnsupportedContent("Invalid heading tag");
        attrs.level = Number(value.tag[1]);
      }
      const spans: TextSpan[] = [];
      const descendants: Block[] = [];
      for (const [index, child] of children(value, "children", path).entries()) {
        const converted = inline(child, [], type === "codeBlock");
        if (converted) {
          if (descendants.length)
            throw new UnsupportedContent(
              "Interleaved text and child blocks require a custom mapping",
            );
          for (const span of converted) append(spans, span.text, span.marks);
        } else {
          if (["paragraph", "heading", "codeBlock"].includes(type))
            throw new UnsupportedContent(`Unknown inline node ${String(child.type)}`);
          descendants.push(convert(child, `${path}.children[${index}]`, type));
        }
      }
      return context.block(type, attrs, spans, descendants, value.id);
    });
  }
  return context.result(
    children(root, "children", "root").map((child, index) =>
      convert(child, `root.children[${index}]`),
    ),
    metadata(root, ["type", "children"]),
  );
}
