import type { Block, Mark, TextSpan } from "@gotipe/core";
import { MigrationContext, type Note } from "./context";
import { holdsBlocks } from "./schema";
import {
  type SourceNode,
  children,
  metadata,
  node,
  object,
  readJSON,
  rename,
  take,
} from "./source";
import { append } from "./text";
import type { MigrationOptions, MigrationResult } from "./types";
import { UnsupportedContent } from "./unsupported";

const blocks: Record<string, string> = {
  paragraph: "paragraph",
  heading: "heading",
  "heading-one": "heading",
  "heading-two": "heading",
  "heading-three": "heading",
  "heading-four": "heading",
  "heading-five": "heading",
  "heading-six": "heading",
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
const levels = ["one", "two", "three", "four", "five", "six"];
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
  const context = new MigrationContext("Slate", options, { idOf: (value) => value.id });
  const values = readJSON(input);
  if (!Array.isArray(values)) throw new Error("Slate document must be an array");
  const blockMap = { ...blocks, ...options.blockTypeMap };
  const markMap = { ...marks, ...options.markTypeMap };

  function inline(
    value: SourceNode,
    path: string,
    notes: Note[],
    inherited: Mark[] = [],
  ): TextSpan[] | null {
    if (value.type === "link") {
      const key = value.url !== undefined ? "url" : "href";
      const href = value[key];
      if (typeof href !== "string") throw new Error("Slate link requires url or href");
      const attrs = metadata(value, ["type", "children", key]);
      // With both `url` and `href`, `url` is the address and `href` is reported.
      const second: SourceNode = {};
      take(attrs, ["href"], second);
      notes.push({ path, sourceType: "link", fields: second });
      const link = context.mark("link", { ...attrs, href }, path, "link", notes);
      const spans: TextSpan[] = [];
      for (const [index, child] of children(value, "children", path).entries()) {
        const converted = inline(child, `${path}.children[${index}]`, notes, [...inherited, link]);
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
      const at = `${path}.${key}`;
      if (property === true) styles.push(context.mark(type, {}, at, key, notes));
      else if (object(property)) styles.push(context.mark(type, property, at, key, notes));
      else if (typeof property === "string" && ["textColor", "highlight"].includes(type))
        styles.push(context.mark(type, { color: property }, at, key, notes));
      else throw new UnsupportedContent(`Unsupported Slate mark value ${key}`);
    }
    return [{ text: value.text, marks: styles }];
  }

  function convert(value: SourceNode, path: string, parent: string | null): Block {
    return context.recover(value, path, parent, () => {
      if (value.text !== undefined)
        throw new UnsupportedContent("Top-level text is not a Slate element");
      const sourceType = typeof value.type === "string" ? value.type : "paragraph";
      const type = blockMap[sourceType];
      if (!type) throw new UnsupportedContent(`Unknown node ${sourceType}`);
      const attrs = metadata(value, ["type", "children", "id"]);
      const named = levels.indexOf(sourceType.replace(/^heading-/, ""));
      if (sourceType.startsWith("heading-") && named >= 0) attrs.level = named + 1;
      const level = attrs.level;
      if (
        type === "heading" &&
        !(typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 6)
      )
        throw new UnsupportedContent("Heading requires level 1 through 6");
      if (type === "image") rename(attrs, "url", "src");
      if (type === "orderedList") attrs.start ??= 1;
      const spans: TextSpan[] = [];
      const descendants: Block[] = [];
      const notes: Note[] = [];
      for (const [index, child] of children(value, "children", path).entries()) {
        const childPath = `${path}.children[${index}]`;
        const converted = inline(child, childPath, notes);
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
        notes,
      });
    });
  }
  return context.result(
    values.map((value, index) => convert(node(value, `[${index}]`), `[${index}]`, null)),
  );
}
