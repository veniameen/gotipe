import { GoTipeError } from "./error";
import { toSafeColor } from "./security/colors";
import { toSafeHref, toSafeImageSrc } from "./security/urls";
import type { Block, Document, Mark, TextSpan } from "./types/block";

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
      appendSpan(spans, node.getAttribute("alt") ?? "", marks);
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
    if (background) add("highlight", { color: background });
    if (node.style.textDecoration.includes("underline")) add("underline");
    if (node.style.textDecoration.includes("line-through")) add("strikethrough");
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

function parseElement(element: HTMLElement): Block[] {
  const tag = element.tagName.toLowerCase();
  const nodes = Array.from(element.childNodes);
  if (IGNORED.has(tag)) return [];
  if (/^h[1-6]$/.test(tag)) return [makeBlock("heading", inline(nodes), { level: Number(tag[1]) })];
  if (tag === "p") {
    return element.querySelector("img")
      ? parseNodes(nodes)
      : [makeBlock("paragraph", inline(nodes))];
  }
  if (tag === "hr") return [makeBlock("divider", null)];
  if (tag === "img") return [imageBlock(element)];
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
          task
            ? { checked: checkbox?.checked ?? child.getAttribute("data-checked") === "true" }
            : {},
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
    return [
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

/** Import the HTML accepted by createEditor/content and setContent. Never inserts HTML into a live DOM. */
export function parseHtmlDocument(html: string): Document {
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
  const blocks = parseNodes(Array.from(document.body.childNodes));
  return { version: 1, blocks: blocks.length ? blocks : [makeBlock("paragraph", [])] };
}
