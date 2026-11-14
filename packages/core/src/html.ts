import { fontFamilyFromCss, fontSizeFromCss, isTextDirection } from "./document/text-style";
import { GoTipeError } from "./error";
import { toSafeColor } from "./security/colors";
import { toSafeHref, toSafeImageSrc } from "./security/urls";
import { repairTable } from "./table/repair";
import type { HtmlAtomReader, InlineAtomSupport } from "./types/atoms";
import type { Block, Document, Mark, TextSpan } from "./types/block";

/** The schema an HTML import reads into, and the atom support of its extensions. */
export interface HtmlImportSchema {
  nodes: Readonly<Record<string, unknown>>;
  marks: Readonly<Record<string, unknown>>;
  atoms?: InlineAtomSupport | null;
}

const IGNORED = new Set(["script", "style", "noscript", "template", "iframe", "object", "embed"]);
const BLOCK_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "hr",
  "img",
  "table",
  "figure",
  "details",
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
]);
const MARK_TAGS: Record<string, string> = {
  b: "bold",
  strong: "bold",
  i: "italic",
  em: "italic",
  u: "underline",
  s: "strikethrough",
  strike: "strikethrough",
  del: "strikethrough",
  code: "code",
  sup: "superscript",
  sub: "subscript",
  mark: "highlight",
};

function makeBlock(
  type: string,
  content: Block["content"],
  attrs: Block["attrs"] = {},
  children: Block[] = [],
): Block {
  return { id: crypto.randomUUID(), type, content, attrs, children };
}

/**
 * Without atom support inline atoms are their text: images are inline only as emoji or
 * when the schema has no image block.
 */
const textAtoms = (schema?: HtmlImportSchema): HtmlAtomReader => ({
  inlineImages: (images) =>
    images.every((image) => image.getAttribute("data-type") === "emoji") ||
    (!!schema && !Object.hasOwn(schema.nodes, "image")),
  span: () => null,
  image: (element) => ({ text: element.getAttribute("alt") ?? "", mark: null }),
});

/** Atoms of the schema of the import in progress (`parseHtmlDocument` is synchronous). */
let atoms = textAtoms();
/** The schema of the import in progress; without one every mark and attribute is read. */
let importSchema: HtmlImportSchema | undefined;
const declaresMark = (type: string) => !importSchema || Object.hasOwn(importSchema.marks, type);
function declaresAttr(nodeType: string, attr: string): boolean {
  if (!importSchema) return true;
  const node = importSchema.nodes[nodeType] as { attrs?: Record<string, unknown> } | undefined;
  return !!node?.attrs && Object.hasOwn(node.attrs, attr);
}

/** `dir` (`ltr`, `rtl`, `auto`) of an element, when the block type declares it. */
function direction(element: Element, nodeType: string): Block["attrs"] {
  const value = (element.getAttribute("dir") ?? "").trim().toLowerCase();
  return isTextDirection(value) && declaresAttr(nodeType, "dir") ? { dir: value } : {};
}

function appendSpan(spans: TextSpan[], text: string, marks: Mark[]) {
  if (!text) return;
  const previous = spans[spans.length - 1];
  if (previous && JSON.stringify(previous.marks) === JSON.stringify(marks)) previous.text += text;
  else spans.push({ text, marks: marks.map((mark) => ({ ...mark, attrs: { ...mark.attrs } })) });
}

function inline(nodes: Node[], inherited: Mark[] = []): TextSpan[] {
  const spans: TextSpan[] = [];
  const visit = (node: Node, marks: Mark[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendSpan(spans, (node.textContent ?? "").replace(/[\t\r\n ]+/g, " "), marks);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName.toLowerCase();
    if (IGNORED.has(tag) || tag === "input") return;
    if (tag === "br") {
      appendSpan(spans, "\n", marks);
      return;
    }
    if (tag === "img") {
      const image = atoms.image(node);
      appendSpan(spans, image.text, image.mark ? [...marks, image.mark] : marks);
      return;
    }
    const next = marks.slice();
    const add = (type: string, attrs: Mark["attrs"] = {}) => {
      const index = next.findIndex((mark) => mark.type === type);
      if (index >= 0) next.splice(index, 1);
      next.push({ type, attrs });
    };
    const type = MARK_TAGS[tag];
    if (type)
      add(
        type,
        type === "highlight" && node.style.backgroundColor
          ? { color: node.style.backgroundColor }
          : {},
      );
    if (tag === "a") {
      const href = toSafeHref(node.getAttribute("href") ?? "");
      if (href)
        add("link", {
          href,
          target: node.getAttribute("target") ?? "_blank",
          rel: "noopener noreferrer",
        });
    }
    if (node.style.fontWeight === "bold" || Number.parseInt(node.style.fontWeight, 10) >= 600)
      add("bold");
    if (node.style.fontStyle === "italic") add("italic");
    const color = toSafeColor(node.style.color);
    const background = toSafeColor(node.style.backgroundColor);
    if (color) add("textColor", { color });
    // Theme faces and whole-pixel sizes only (see `fontFamilyFromCss`/`fontSizeFromCss`).
    const family = fontFamilyFromCss(node.style.fontFamily);
    if (family && declaresMark("fontFamily")) add("fontFamily", { family });
    const size = fontSizeFromCss(node.style.fontSize);
    if (size !== null && declaresMark("fontSize")) add("fontSize", { size });
    if (background) add("highlight", { color: background });
    if (node.style.textDecoration.includes("underline")) add("underline");
    if (node.style.textDecoration.includes("line-through")) add("strikethrough");
    const atom = tag === "span" ? atoms.span(node) : null;
    if (atom) next.push(atom);
    if (tag === "p" && spans.length > 0) appendSpan(spans, "\n", marks);
    for (const child of Array.from(node.childNodes)) visit(child, next);
  };
  for (const node of nodes) visit(node, inherited);
  return spans;
}

function positiveInteger(value: string | null, fallback = 1): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

function imageBlock(image: HTMLElement, caption = ""): Block {
  const original = image.getAttribute("src") ?? "";
  const src = toSafeImageSrc(original) ?? "";
  const attrs: Block["attrs"] = { src, alt: image.getAttribute("alt") ?? "", caption };
  for (const key of ["width", "height"]) {
    const value = positiveInteger(image.getAttribute(key), 0);
    if (value) attrs[key] = value;
  }
  return makeBlock("image", null, attrs);
}

/** `text-align` (or the `align` attribute) of a paragraph or heading, as `TextAlign` stores it. */
function textAlign(element: HTMLElement): Block["attrs"] {
  const value = (element.style.textAlign || element.getAttribute("align") || "").toLowerCase();
  return value === "left" || value === "center" || value === "right" || value === "justify"
    ? { align: value }
    : {};
}

function parseElement(element: HTMLElement): Block[] {
  const tag = element.tagName.toLowerCase();
  const nodes = Array.from(element.childNodes);
  if (IGNORED.has(tag)) return [];
  if (/^h[1-6]$/.test(tag))
    return [
      makeBlock("heading", inline(nodes), {
        level: Number(tag[1]),
        ...direction(element, "heading"),
        ...textAlign(element),
      }),
    ];
  if (tag === "p") {
    return element.querySelector("img") &&
      !atoms.inlineImages(Array.from(element.querySelectorAll("img")))
      ? parseNodes(nodes)
      : [
          makeBlock("paragraph", inline(nodes), {
            ...direction(element, "paragraph"),
            ...textAlign(element),
          }),
        ];
  }
  if (tag === "hr") return [makeBlock("divider", null)];
  if (tag === "img")
    return atoms.inlineImages([element])
      ? [makeBlock("paragraph", inline([element]))]
      : [imageBlock(element)];
  if (tag === "figure") {
    const image = element.querySelector<HTMLElement>("img");
    if (image) return [imageBlock(image, element.querySelector("figcaption")?.textContent ?? "")];
    return parseNodes(nodes);
  }
  if (tag === "pre") {
    const code = element.querySelector("code");
    const language = /(?:^|\s)language-([^\s]+)/.exec(code?.className ?? "")?.[1] ?? "";
    return [makeBlock("codeBlock", code?.textContent ?? element.textContent ?? "", { language })];
  }
  if (tag === "blockquote") return [makeBlock("blockquote", inline(nodes))];
  if (tag === "ul" || tag === "ol") {
    const lists: Block[] = [];
    const items = Array.from(element.children).filter((child) => child.tagName === "LI");
    for (const [index, child] of items.entries()) {
      const checkbox = child.querySelector<HTMLInputElement>("input[type=checkbox]");
      const task = child.getAttribute("data-type") === "taskItem" || checkbox !== null;
      const type = task ? "todoList" : tag === "ol" ? "orderedList" : "bulletList";
      let list = lists[lists.length - 1];
      if (!list || list.type !== type) {
        list = makeBlock(
          type,
          null,
          type === "orderedList"
            ? { start: positiveInteger(element.getAttribute("start")) + index }
            : {},
        );
        lists.push(list);
      }
      const nested = Array.from(child.children).filter(
        (node) => node.tagName === "UL" || node.tagName === "OL",
      );
      const ownNodes = Array.from(child.childNodes).filter(
        (node) => !nested.includes(node as Element),
      );
      list.children.push(
        makeBlock(
          task ? "todoItem" : "listItem",
          inline(ownNodes),
          {
            ...direction(child, task ? "todoItem" : "listItem"),
            ...(task
              ? { checked: checkbox?.checked ?? child.getAttribute("data-checked") === "true" }
              : {}),
          },
          nested.flatMap((node) => parseElement(node as HTMLElement)),
        ),
      );
    }
    return lists;
  }
  if (tag === "table") {
    const rows = Array.from(element.querySelectorAll("tr")).filter(
      (row) => row.closest("table") === element,
    );
    // spans as browsers draw them: cut at the last row and before cells from above
    return [
      repairTable(
        makeBlock(
          "table",
          null,
          {},
          rows.map((row) =>
            makeBlock(
              "tableRow",
              null,
              {},
              Array.from(row.children)
                .filter((cell) => cell.tagName === "TD" || cell.tagName === "TH")
                .map((cell) => {
                  const attrs: Block["attrs"] = {
                    colspan: positiveInteger(cell.getAttribute("colspan")),
                    rowspan: positiveInteger(cell.getAttribute("rowspan")),
                  };
                  const alignment =
                    (cell as HTMLElement).style.textAlign || cell.getAttribute("align");
                  if (alignment === "left" || alignment === "center" || alignment === "right")
                    attrs.align = alignment;
                  return makeBlock(
                    cell.tagName === "TH" ? "tableHeader" : "tableCell",
                    inline(Array.from(cell.childNodes)),
                    attrs,
                  );
                }),
            ),
          ),
        ),
        { fill: false },
      ),
    ];
  }
  if (tag === "details") {
    const summary = Array.from(element.children).find((child) => child.tagName === "SUMMARY");
    return [
      makeBlock(
        "toggle",
        inline(summary ? Array.from(summary.childNodes) : []),
        { open: element.hasAttribute("open") },
        parseNodes(nodes.filter((node) => node !== summary)),
      ),
    ];
  }
  return parseNodes(nodes);
}

function parseNodes(nodes: Node[]): Block[] {
  const blocks: Block[] = [];
  let pending: Node[] = [];
  const flush = () => {
    const spans = inline(pending);
    if (spans.some((span) => span.text.trim())) blocks.push(makeBlock("paragraph", spans));
    pending = [];
  };
  for (const node of nodes) {
    if (node instanceof HTMLElement && BLOCK_TAGS.has(node.tagName.toLowerCase())) {
      flush();
      blocks.push(...parseElement(node));
    } else pending.push(node);
  }
  flush();
  return blocks;
}

/**
 * Import the HTML accepted by createEditor/content and setContent. Never inserts HTML into a
 * live DOM. With the editor's `schema` and its atom support, inline atoms written by
 * `serializeHtml` are read back when it declares their marks; otherwise they are their text.
 */
export function parseHtmlDocument(html: string, schema?: HtmlImportSchema): Document {
  if (typeof DOMParser === "undefined") {
    if (/<\/?[a-z][^>]*>/i.test(html)) {
      throw new GoTipeError(
        "PARSE_ERROR",
        "HTML import requires DOMParser; use document JSON in headless environments",
      );
    }
    return {
      version: 1,
      blocks: [makeBlock("paragraph", html ? [{ text: html, marks: [] }] : [])],
    };
  }
  const document = new DOMParser().parseFromString(html, "text/html");
  const support = schema?.atoms;
  atoms = schema && support ? support.readHtml(schema) : textAtoms(schema);
  // An empty schema validates nothing (engine/validate.ts): it is read as no schema.
  importSchema =
    schema && (Object.keys(schema.nodes).length || Object.keys(schema.marks).length)
      ? schema
      : undefined;
  let blocks: Block[];
  try {
    blocks = parseNodes(Array.from(document.body.childNodes));
  } finally {
    atoms = textAtoms();
    importSchema = undefined;
  }
  return { version: 1, blocks: blocks.length ? blocks : [makeBlock("paragraph", [])] };
}
