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

export function spansToHtml(spans: readonly HtmlSpan[]): string {
  return spans
    .map((span) => {
      let html = escapeHtml(span.text).replace(/\n/g, "<br>");
      for (const mark of span.marks) {
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
            const title = mark.attrs?.title
              ? ` title="${escapeHtml(String(mark.attrs.title))}"`
              : "";
            if (href) html = `<a href="${escapeHtml(href)}"${title}>${html}</a>`;
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
    })
    .join("");
}

function blockToHtml(block: HtmlBlock, options: HtmlSerializationOptions): string {
  const inner = Array.isArray(block.content)
    ? spansToHtml(block.content)
    : typeof block.content === "string"
      ? escapeHtml(block.content)
      : "";
  const childrenHtml = block.children.map((child) => renderBlock(child, options)).join("\n");

  switch (block.type) {
    case "paragraph":
      return `<p>${inner}</p>`;
    case "heading": {
      const level = Math.min(Math.max(Math.trunc(Number(block.attrs.level)) || 1, 1), 6);
      return `<h${level}>${inner}</h${level}>`;
    }
    case "bulletList":
      return `<ul>\n${childrenHtml}\n</ul>`;
    case "orderedList": {
      const start = Number(block.attrs.start);
      const attr = Number.isInteger(start) && start !== 1 ? ` start="${start}"` : "";
      return `<ol${attr}>\n${childrenHtml}\n</ol>`;
    }
    case "listItem":
      return `<li>${inner}${childrenHtml ? `\n${childrenHtml}` : ""}</li>`;
    case "todoList":
      return `<ul class="todo-list">\n${childrenHtml}\n</ul>`;
    case "todoItem": {
      const checked = block.attrs.checked ? " checked" : "";
      return `<li><input type="checkbox"${checked} disabled> ${inner}${childrenHtml ? `\n${childrenHtml}` : ""}</li>`;
    }
    case "codeBlock": {
      const lang = block.attrs.language
        ? ` class="language-${escapeHtml(String(block.attrs.language))}"`
        : "";
      return `<pre><code${lang}>${inner}</code></pre>`;
    }
    case "blockquote":
      return `<blockquote>${inner}${childrenHtml ? `\n${childrenHtml}` : ""}</blockquote>`;
    case "divider":
      return "<hr>";
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
      return `<figure><img src="${src}" alt="${alt}">${caption}</figure>`;
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
      const label = escapeHtml(String(block.attrs.name ?? block.attrs.title ?? href ?? ""));
      return href ? `<p><a href="${escapeHtml(href)}">${label}</a></p>` : `<p>${label}</p>`;
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
  if (options.inlineStyles !== undefined && typeof options.inlineStyles !== "boolean")
    throw new TypeError("inlineStyles must be boolean");
  return blocks.map((block) => renderBlock(block, options)).join("\n");
}
