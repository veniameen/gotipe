import { fontFamilyCss, isFontSize, isTextDirection } from "../document/text-style";
import { sameValue } from "../engine/mark-rules";
import { toSafeColor } from "../security/colors";
import { toSafeHref, toSafeImageSrc } from "../security/urls";
import { BLOCK_STYLES } from "./html-styles";

/** Structural ports accept canonical public blocks without renderer/editor state. */
export interface HtmlSpan {
  text: string;
  marks: { type: string; attrs?: Record<string, unknown> }[];
}
export interface HtmlBlock {
  type: string;
  attrs: Record<string, unknown>;
  content: HtmlSpan[] | string | null;
  children: HtmlBlock[];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Positive integers up to 10000: the only image sizes written into HTML. */
function size(name: string, value: unknown): string {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10000
    ? ` ${name}="${value}"`
    : "";
}

type HtmlMark = HtmlSpan["marks"][number];
const ATOMS = ["mention", "inlineMath", "customEmoji", "inlineImage"];
const atomMarks = (span: HtmlSpan) => span.marks.filter((mark) => ATOMS.includes(mark.type));
const sameMark = (a: HtmlMark, b: HtmlMark) =>
  a.type === b.type && sameValue(a.attrs ?? {}, b.attrs ?? {});

/**
 * The element of one atom (docs/development/inline-atoms.md): `inner` is the HTML of its
 * text, `text` the plain fallback. Null when its attributes are not valid: the text stays.
 */
function atomElement(mark: HtmlMark, inner: string, text: string): string | null {
  const attrs = mark.attrs ?? {};
  if (mark.type === "inlineMath") return `<span data-type="math">${inner}</span>`;
  if (mark.type === "mention") {
    if (typeof attrs.id !== "string" || !attrs.id) return null;
    const label = typeof attrs.label === "string" ? ` data-label="${escapeHtml(attrs.label)}"` : "";
    return `<span data-type="mention" data-kind="${attrs.kind === "page" ? "page" : "user"}" data-id="${escapeHtml(attrs.id)}"${label}>${inner}</span>`;
  }
  const safe = toSafeImageSrc(String(attrs.src ?? ""));
  if (!safe) return null;
  const src = escapeHtml(safe);
  if (mark.type === "customEmoji")
    return `<img data-type="emoji" alt="${escapeHtml(text)}" src="${src}">`;
  const alt = escapeHtml(typeof attrs.alt === "string" ? attrs.alt : text);
  return `<img src="${src}" alt="${alt}"${size("width", attrs.width)}${size("height", attrs.height)}>`;
}

/** `html` inside the elements of `marks`, the first innermost. Atomic marks add none. */
function wrapMarks(inner: string, marks: readonly HtmlMark[]): string {
  let html = inner;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        html = `<strong>${html}</strong>`;
        break;
      case "italic":
        html = `<em>${html}</em>`;
        break;
      case "underline":
        html = `<u>${html}</u>`;
        break;
      case "strikethrough":
        html = `<s>${html}</s>`;
        break;
      case "code":
        html = `<code>${html}</code>`;
        break;
      case "superscript":
        html = `<sup>${html}</sup>`;
        break;
      case "subscript":
        html = `<sub>${html}</sub>`;
        break;
      case "link": {
        const href = toSafeHref(String(mark.attrs?.href ?? ""));
        const title = mark.attrs?.title ? ` title="${escapeHtml(String(mark.attrs.title))}"` : "";
        if (href) html = `<a href="${escapeHtml(href)}"${title}>${html}</a>`;
        break;
      }
      case "fontFamily": {
        const family = fontFamilyCss(mark.attrs?.family);
        if (family) html = `<span style="font-family:${family}">${html}</span>`;
        break;
      }
      case "fontSize": {
        const size = mark.attrs?.size;
        if (isFontSize(size)) html = `<span style="font-size:${size}px">${html}</span>`;
        break;
      }
      case "textColor":
      case "highlight": {
        const color = toSafeColor(mark.attrs?.color);
        if (mark.type === "textColor") {
          if (color) html = `<span style="color:${color}">${html}</span>`;
        } else
          html = color
            ? `<mark style="background:${color}">${html}</mark>`
            : `<mark>${html}</mark>`;
        break;
      }
    }
  }
  return html;
}

const spanHtml = (span: HtmlSpan, marks: readonly HtmlMark[] = span.marks) =>
  wrapMarks(escapeHtml(span.text).replace(/\n/g, "<br>"), marks);

/**
 * One atom — the longest run of spans with equal atomic marks — is one element. Marks every
 * span of it has wrap the element; the others stay inside it.
 */
function atomHtml(group: readonly HtmlSpan[], mark: HtmlMark): string {
  const common = group[0]!.marks.filter(
    (item) =>
      !ATOMS.includes(item.type) &&
      group.every((span) => span.marks.some((other) => sameMark(other, item))),
  );
  const inner = group
    .map((span) =>
      spanHtml(
        span,
        span.marks.filter(
          (item) => !ATOMS.includes(item.type) && !common.some((c) => sameMark(c, item)),
        ),
      ),
    )
    .join("");
  const text = group.map((span) => span.text).join("");
  const element = atomElement(mark, inner, text);
  return element === null
    ? group.map((span) => spanHtml(span)).join("")
    : wrapMarks(element, common);
}

export function spansToHtml(spans: readonly HtmlSpan[]): string {
  let html = "";
  for (let i = 0; i < spans.length; ) {
    const atoms = atomMarks(spans[i]!);
    let j = i + 1;
    if (atoms.length) {
      const same = (span: HtmlSpan) => {
        const other = atomMarks(span);
        return other.length === atoms.length && other.every((m, k) => sameMark(m, atoms[k]!));
      };
      while (j < spans.length && same(spans[j]!)) j++;
      html += atomHtml(spans.slice(i, j), atoms[0]!);
    } else html += spanHtml(spans[i]!);
    i = j;
  }
  return html;
}

function blockToHtml(block: HtmlBlock, options: HtmlSerializationOptions): string {
  const inner = Array.isArray(block.content)
    ? spansToHtml(block.content)
    : typeof block.content === "string"
      ? escapeHtml(block.content)
      : "";
  const childrenHtml = block.children.map((child) => renderBlock(child, options)).join("\n");
  // Blocks that do not hold children in the editor schema still never lose them.
  const after = childrenHtml ? `\n${childrenHtml}` : "";

  switch (block.type) {
    case "paragraph":
      return `<p${direction(block.attrs)}${textAlign(block.attrs)}>${inner}</p>${after}`;
    case "heading": {
      const level = Math.min(Math.max(Math.trunc(Number(block.attrs.level)) || 1, 1), 6);
      return `<h${level}${direction(block.attrs)}${textAlign(block.attrs)}>${inner}</h${level}>${after}`;
    }
    case "bulletList":
      return `<ul>\n${childrenHtml}\n</ul>`;
    case "orderedList": {
      const start = Number(block.attrs.start);
      const attr = Number.isInteger(start) && start !== 1 ? ` start="${start}"` : "";
      return `<ol${attr}>\n${childrenHtml}\n</ol>`;
    }
    case "listItem":
      return `<li${direction(block.attrs)}>${inner}${childrenHtml ? `\n${childrenHtml}` : ""}</li>`;
    case "todoList":
      return `<ul class="todo-list">\n${childrenHtml}\n</ul>`;
    case "todoItem": {
      const checked = block.attrs.checked ? " checked" : "";
      return `<li${direction(block.attrs)}><input type="checkbox"${checked} disabled> ${inner}${childrenHtml ? `\n${childrenHtml}` : ""}</li>`;
    }
    case "codeBlock": {
      // Older documents store plain text as `plain`/`plaintext`; it has no language class.
      const language = block.attrs.language;
      const lang =
        language && !/^plain(?:text)?$/i.test(String(language))
          ? ` class="language-${escapeHtml(String(language))}"`
          : "";
      return `<pre><code${lang}>${inner}</code></pre>${after}`;
    }
    case "blockquote":
      return `<blockquote>${inner}${childrenHtml ? `\n${childrenHtml}` : ""}</blockquote>`;
    case "divider":
      return `<hr>${after}`;
    case "callout": {
      const emoji = block.attrs.emoji
        ? `<span class="callout-emoji">${escapeHtml(String(block.attrs.emoji))}</span>`
        : "";
      return `<div class="callout">${emoji}${inner}${childrenHtml ? `\n${childrenHtml}` : ""}</div>`;
    }
    case "image": {
      const src = escapeHtml(toSafeImageSrc(String(block.attrs.src ?? "")) ?? "");
      const alt = escapeHtml(String(block.attrs.alt ?? ""));
      const caption = block.attrs.caption
        ? `<figcaption>${escapeHtml(String(block.attrs.caption))}</figcaption>`
        : "";
      return `<figure><img src="${src}" alt="${alt}">${caption}</figure>${after}`;
    }
    case "table":
      return `<table>\n${childrenHtml}\n</table>`;
    case "tableRow":
      return `<tr>\n${childrenHtml}\n</tr>`;
    case "tableHeader":
      return `<th${cellAttributes(block.attrs)}>${inner}${childrenHtml}</th>`;
    case "tableCell":
      return `<td${cellAttributes(block.attrs)}>${inner}${childrenHtml}</td>`;
    case "file":
    case "embed": {
      const href = toSafeHref(String(block.attrs.url ?? block.attrs.src ?? ""));
      const name = [block.attrs.name, block.attrs.title].find(
        (value) => value !== undefined && value !== null && String(value) !== "",
      );
      const label = escapeHtml(name === undefined ? (href ?? "") : String(name));
      return `${href ? `<p><a href="${escapeHtml(href)}">${label}</a></p>` : `<p>${label}</p>`}${after}`;
    }
    case "toggle":
      return `<details${block.attrs.open ? " open" : ""}><summary>${inner}</summary>\n${childrenHtml}\n</details>`;
    case "columns":
      return `<div class="columns">\n${childrenHtml}\n</div>`;
    case "column":
      return `<div class="column">\n${childrenHtml}\n</div>`;
    default:
      return (inner ? `<p>${inner}</p>` : "") + childrenHtml;
  }
}

/** `dir` of a paragraph, heading or list item (the `TextDirection` extension). */
function direction(attrs: Record<string, unknown>): string {
  return isTextDirection(attrs.dir) ? ` dir="${attrs.dir}"` : "";
}

/** `align` of a paragraph or heading (the `TextAlign` extension): one of four values. */
function textAlign(attrs: Record<string, unknown>): string {
  const { align } = attrs;
  return align === "left" || align === "center" || align === "right" || align === "justify"
    ? ` style="text-align:${align}"`
    : "";
}

function cellAttributes(attrs: Record<string, unknown>): string {
  let html = "";
  for (const name of ["colspan", "rowspan"]) {
    const value = Number(attrs[name]);
    if (Number.isInteger(value) && value > 1 && value <= 1000) html += ` ${name}="${value}"`;
  }
  if (attrs.align === "left" || attrs.align === "center" || attrs.align === "right")
    html += ` style="text-align:${attrs.align}"`;
  return html;
}

export interface HtmlSerializationOptions {
  /** Add one class per block, e.g. classPrefix: "article-" produces article-paragraph. */
  classPrefix?: string;
  /** Include neutral structural styles suitable for a standalone document. */
  inlineStyles?: boolean;
  /** The same as `inlineStyles`; the name `exportToHtml` has always accepted. */
  includeStyles?: boolean;
}

function renderBlock(block: HtmlBlock, options: HtmlSerializationOptions): string {
  const html = blockToHtml(block, options);
  if (!options.classPrefix && !options.inlineStyles) return html;
  return html.replace(/^<([a-z][a-z0-9]*)([^>]*)>/, (_opening, tag: string, attrs: string) => {
    let attributes = attrs;
    if (options.classPrefix) {
      const className = escapeHtml(`${options.classPrefix}${block.type}`);
      attributes = / class="([^"]*)"/.test(attributes)
        ? attributes.replace(
            / class="([^"]*)"/,
            (_match, existing: string) => ` class="${existing} ${className}"`,
          )
        : `${attributes} class="${className}"`;
    }
    const style = options.inlineStyles ? BLOCK_STYLES[block.type] : undefined;
    if (style) {
      attributes = / style="([^"]*)"/.test(attributes)
        ? attributes.replace(/ style="([^"]*)"/, ` style="${style};$1"`)
        : `${attributes} style="${style}"`;
    }
    return `<${tag}${attributes}>`;
  });
}

/** Serialize canonical public blocks without creating an editor or touching the DOM. */
export function blocksToHtml(
  blocks: readonly HtmlBlock[],
  options: HtmlSerializationOptions = {},
): string {
  if (
    options.classPrefix !== undefined &&
    (typeof options.classPrefix !== "string" ||
      !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(options.classPrefix))
  )
    throw new TypeError("classPrefix must be a non-empty CSS identifier prefix");
  const { inlineStyles, includeStyles } = options;
  if (inlineStyles !== undefined && typeof inlineStyles !== "boolean")
    throw new TypeError("inlineStyles must be boolean");
  if (includeStyles !== undefined && typeof includeStyles !== "boolean")
    throw new TypeError("includeStyles must be boolean");
  if (inlineStyles !== undefined && includeStyles !== undefined && inlineStyles !== includeStyles)
    throw new TypeError("inlineStyles and includeStyles must not disagree");
  const resolved = {
    classPrefix: options.classPrefix,
    inlineStyles: inlineStyles ?? includeStyles,
  };
  return blocks.map((block) => renderBlock(block, resolved)).join("\n");
}
