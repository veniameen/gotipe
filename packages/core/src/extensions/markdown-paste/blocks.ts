import { type InlineAtoms, parseMarkdown } from "@gotipe/markdown";
import { INLINE_ASSET_LIMIT } from "../../assets";
import { createId } from "../../document/id";
import type { AttrValue, Block, Mark, TextSpan } from "../../types/block";
import type { PasteTextContext } from "../../types/extension";

type Parsed = ReturnType<typeof parseMarkdown>["doc"]["blocks"][number];
type Schema = Pick<PasteTextContext, "nodes" | "marks" | "safeHref" | "safeImageSrc">;

const paragraph = (text: string): Block => ({
  id: createId(),
  type: "paragraph",
  attrs: {},
  content: text ? [{ text, marks: [] }] : [],
  children: [],
});

/**
 * Declared attributes only, with safe addresses: `src` of a block or an inline image passes
 * the image check, `href` and `url` the link check. `null` when an address is unsafe.
 */
function attributes(
  values: Record<string, unknown>,
  declared: Record<string, unknown>,
  { safeHref, safeImageSrc }: Schema,
): Record<string, AttrValue> | null {
  const result: Record<string, AttrValue> = {};
  for (const [name, value] of Object.entries(values)) {
    if (!(name in declared) || value === undefined) continue;
    if (name === "src") {
      const src = typeof value === "string" ? safeImageSrc(value) : null;
      if (!src || src.length > INLINE_ASSET_LIMIT) return null;
      result[name] = src;
    } else if (name === "href" || name === "url") {
      const href = typeof value === "string" ? safeHref(value) : null;
      if (!href) return null;
      result[name] = href;
    } else result[name] = structuredClone(value) as AttrValue;
  }
  return result;
}

/** The spans with their marks, or `null` when a mark is unknown or its address is unsafe. */
function spans(content: Parsed["content"], schema: Schema): TextSpan[] | null {
  const result: TextSpan[] = [];
  for (const span of content as {
    text: string;
    marks: { type: string; attrs?: Record<string, unknown> }[];
  }[]) {
    const marks: Mark[] = [];
    for (const mark of span.marks) {
      const spec = schema.marks[mark.type];
      const attrs = spec && attributes(mark.attrs ?? {}, spec.attrs, schema);
      if (!attrs) return null;
      marks.push({ type: mark.type, attrs });
    }
    result.push({ text: span.text, marks });
  }
  return result;
}

/**
 * The parsed block as the schema can hold it. `null` when a block or mark type is unknown or
 * an address is unsafe: nothing is dropped silently, the caller keeps the Markdown source.
 */
function fit(block: Parsed, schema: Schema): Block | null {
  const spec = schema.nodes[block.type];
  const attrs = spec && attributes(block.attrs, spec.attrs, schema);
  if (!attrs) return null;
  const children: Block[] = [];
  for (const child of block.children) {
    const fitted = fit(child, schema);
    if (!fitted) return null;
    children.push(fitted);
  }
  const content = Array.isArray(block.content) ? spans(block.content, schema) : block.content;
  if (Array.isArray(block.content) && !content) return null;
  return { id: createId(), type: block.type, attrs, content, children };
}

/**
 * The inline atoms this editor can hold: a mention, a formula, an image in the line or a
 * custom emoji is read as an atom only when the schema has its atomic mark. Custom emoji
 * also need the registered names.
 */
function atomsOf(
  { marks }: Pick<PasteTextContext, "marks">,
  customEmoji: Record<string, string> | undefined,
): InlineAtoms | undefined {
  const atomic = (name: string) => marks[name]?.atomic === true;
  const atoms: InlineAtoms = {};
  if (atomic("mention")) atoms.mention = true;
  if (atomic("inlineMath")) atoms.inlineMath = true;
  if (atomic("inlineImage")) atoms.inlineImage = true;
  if (atomic("customEmoji") && customEmoji) atoms.customEmoji = customEmoji;
  return Object.keys(atoms).length ? atoms : undefined;
}

/**
 * Blocks of pasted Markdown in this editor's schema. A top-level block the schema cannot hold
 * (an unknown block or mark, raw HTML) or with an unsafe address (a link, an image, a file)
 * becomes a raw Markdown block when the schema has `markdownRaw`, otherwise its source lines
 * become paragraphs. Front matter stays text too.
 */
export function markdownBlocks(
  text: string,
  context: PasteTextContext,
  customEmoji?: Record<string, string>,
): Block[] {
  const source = text.replace(/\r\n?/g, "\n");
  const { doc, snapshot } = parseMarkdown(source, { atoms: atomsOf(context, customEmoji) });
  const raw = "markdownRaw" in context.nodes;
  const verbatim = (markdown: string, kind: string): Block[] => {
    const value = markdown.replace(/\n+$/, "");
    if (!value) return [];
    return raw
      ? [
          {
            id: createId(),
            type: "markdownRaw",
            attrs: { kind },
            content: value,
            children: [],
          },
        ]
      : value.split("\n").map(paragraph);
  };
  const blocks = verbatim(snapshot.frontMatter, "frontMatter");
  doc.blocks.forEach((block, index) => {
    const range = snapshot.blocks[index];
    const fitted = fit(block, context);
    if (fitted && context.editor.validate({ version: 1, blocks: [fitted] })) blocks.push(fitted);
    else if (range)
      blocks.push(...verbatim(snapshot.text.slice(range.start, range.end), block.type));
  });
  return blocks;
}
