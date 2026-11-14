export const SANITIZER_CONFIG = {
  allowedElements: [
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
    "code",
    "strong",
    "em",
    "u",
    "s",
    "del",
    "mark",
    "a",
    "sup",
    "sub",
    "br",
    "hr",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "figure",
    "figcaption",
    "details",
    "summary",
    "span",
    "div",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    code: ["class"],
    "*": ["class", "id"],
  } as Record<string, string[]>,
  allowedSchemes: ["http", "https", "mailto"],
};

/**
 * Sanitize HTML with the browser's DOMParser and an allowlist. The same code runs
 * on both engines: the WASM module carries no HTML sanitizer.
 */
export function sanitizeHtml(html: string): string {
  return sanitizeWithDOMParser(html);
}

function sanitizeWithDOMParser(html: string): string {
  if (typeof DOMParser === "undefined") {
    // SSR: strip all tags as a safe fallback
    return html.replace(/<[^>]*>/g, "");
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc.body) return html.replace(/<[^>]*>/g, "");

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];

  let node: Node | null = walker.nextNode();
  while (node) {
    if (node instanceof Element) {
      const tag = node.tagName.toLowerCase();
      if (!SANITIZER_CONFIG.allowedElements.includes(tag)) {
        toRemove.push(node);
      } else {
        for (const attr of Array.from(node.attributes)) {
          const allowed =
            SANITIZER_CONFIG.allowedAttributes[tag] ??
            SANITIZER_CONFIG.allowedAttributes["*"] ??
            [];
          const globalAllowed = SANITIZER_CONFIG.allowedAttributes["*"] ?? [];
          if (!allowed.includes(attr.name) && !globalAllowed.includes(attr.name)) {
            node.removeAttribute(attr.name);
          }
          if (
            (attr.name === "href" || attr.name === "src") &&
            /^(javascript|data|vbscript):/i.test(attr.value)
          ) {
            node.removeAttribute(attr.name);
          }
        }
      }
    }
    node = walker.nextNode();
  }

  for (const el of toRemove) {
    el.parentNode?.replaceChild(doc.createTextNode(el.textContent || ""), el);
  }

  return doc.body.innerHTML;
}
