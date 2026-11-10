import type { Block, Mark, TextSpan } from "@gotipe/core";
import {
  MigrationContext,
  type SourceNode,
  UnsupportedContent,
  append,
  children,
  metadata,
  node,
  object,
  readJSON,
} from "./context";
import type { MigrationOptions, MigrationResult } from "./types";

const blocks: Record<string, string> = {
  paragraph: "paragraph",
  heading: "heading",
  "heading-one": "heading",
  "heading-two": "heading",
  "bulleted-list": "bulletList",
  "numbered-list": "orderedList",
  "list-item": "listItem",
  "code-block": "codeBlock",
  "block-quote": "blockquote",
  image: "image",
  table: "table",
  "table-row": "tableRow",
  "table-cell": "tableCell",
  "table-header": "tableHeader",
  "check-list": "todoList",
  "check-list-item": "todoItem",
  "horizontal-rule": "divider",
};
const marks: Record<string, string> = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikethrough: "strikethrough",
  strike: "strikethrough",
  code: "code",
  subscript: "subscript",
  superscript: "superscript",
  highlight: "highlight",
  color: "textColor",
};

/** Convert common Slate schemas; custom nodes can be mapped explicitly. */
export function convertSlateToGoTipe(
  input: unknown,
  options: MigrationOptions = {},
): MigrationResult {
  const context = new MigrationContext("Slate", options);
  const values = readJSON(input);
  if (!Array.isArray(values)) throw new Error("Slate document must be an array");
  const blockMap = { ...blocks, ...options.blockTypeMap };
  const markMap = { ...marks, ...options.markTypeMap };

  function inline(value: SourceNode, inherited: Mark[] = []): TextSpan[] | null {
    if (value.type === "link") {
      const href = value.url ?? value.href;
      if (typeof href !== "string") throw new Error("Slate link requires url or href");
      const mark = { type: "link", attrs: { ...metadata(value, ["type", "children"]), href } };
      const spans: TextSpan[] = [];
      for (const child of children(value, "children", "link")) {
        const converted = inline(child, [...inherited, mark]);
        if (!converted) throw new UnsupportedContent("Block nested inside a link");
        for (const span of converted) append(spans, span.text, span.marks);
      }
      return spans;
    }
    if (value.text === undefined) return null;
    if (typeof value.text !== "string") throw new Error("Slate text must be a string");
    const styles = [...inherited];
    for (const [key, property] of Object.entries(metadata(value, ["text"]))) {
      if (property === false || property === null) continue;
      const type = markMap[key];
      if (!type) throw new UnsupportedContent(`Unknown Slate text property ${key}`);
      if (property === true) styles.push({ type, attrs: {} });
      else if (object(property)) styles.push({ type, attrs: property });
      else if (typeof property === "string" && ["textColor", "highlight"].includes(type))
        styles.push({ type, attrs: { color: property } });
      else throw new UnsupportedContent(`Unsupported Slate mark value ${key}`);
    }
    return [{ text: value.text, marks: styles }];
  }

  function convert(value: SourceNode, path: string): Block {
    return context.recover(value, path, () => {
      if (value.text !== undefined)
        throw new UnsupportedContent("Top-level text is not a Slate element");
      const sourceType = typeof value.type === "string" ? value.type : "paragraph";
      const type = blockMap[sourceType];
      if (!type) throw new UnsupportedContent(`Unknown node ${sourceType}`);
      const attrs = metadata(value, ["type", "children"]);
      if (sourceType === "heading-one") attrs.level = 1;
      if (sourceType === "heading-two") attrs.level = 2;
      if (
        type === "heading" &&
        (typeof attrs.level !== "number" || attrs.level < 1 || attrs.level > 6)
      )
        throw new UnsupportedContent("Heading requires level 1 through 6");
      if (type === "image" && typeof attrs.url === "string") attrs.src = attrs.url;
      if (type === "orderedList") attrs.start = attrs.start ?? 1;
      const spans: TextSpan[] = [];
      const descendants: Block[] = [];
      for (const [index, child] of children(value, "children", path).entries()) {
        const converted = inline(child);
        if (converted) {
          if (descendants.length)
            throw new UnsupportedContent(
              "Interleaved text and child blocks require a custom mapping",
            );
          for (const span of converted) append(spans, span.text, span.marks);
        } else {
          if (["paragraph", "heading", "codeBlock"].includes(type))
            throw new UnsupportedContent(`Unknown inline node ${String(child.type)}`);
          descendants.push(convert(child, `${path}.children[${index}]`));
        }
      }
      return context.block(type, attrs, spans, descendants, value.id);
    });
  }
  return context.result(
    values.map((value, index) => convert(node(value, `[${index}]`), `[${index}]`)),
  );
}
