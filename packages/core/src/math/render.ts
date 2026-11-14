// Validation and output of MathML trees. Only tags from MATH_TAGS and attributes from
// MATH_ATTRS are emitted; text always goes through text nodes or escaping.

import { MATH_ATTRS, MATH_NAMESPACE, MATH_TAGS, type MathElement } from "./types";

const TOKENS = new Set(["mi", "mn", "mo", "mtext"]);
/** Bound for hand-made trees; parsed trees stay far below it. */
const MAX_TREE_DEPTH = 512;

function validAttrs(attrs: unknown): boolean {
  if (attrs === undefined) return true;
  if (typeof attrs !== "object" || attrs === null || Array.isArray(attrs)) return false;
  const proto = Object.getPrototypeOf(attrs);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.entries(attrs).every(
    ([key, value]) => MATH_ATTRS.has(key) && typeof value === "string",
  );
}

function valid(value: unknown, depth: number): boolean {
  if (depth > MAX_TREE_DEPTH || typeof value !== "object" || value === null) return false;
  const { tag, attrs, children } = value as Record<string, unknown>;
  if (typeof tag !== "string" || !MATH_TAGS.has(tag) || (tag === "math" && depth > 0)) return false;
  if (!validAttrs(attrs) || !Array.isArray(children)) return false;
  const token = TOKENS.has(tag);
  return children.every((child) =>
    typeof child === "string" ? token : !token && valid(child, depth + 1),
  );
}

/** Checks a whole tree against the allowed tags, attributes and text placement. */
export function isMathElement(value: unknown): value is MathElement {
  return valid(value, 0);
}

function assertTree(node: MathElement): void {
  if (!isMathElement(node)) throw new TypeError("Invalid MathML tree");
}

function entries(node: MathElement): [string, string][] {
  const out = Object.entries(node.attrs ?? {});
  for (const [key] of out)
    if (!MATH_ATTRS.has(key)) throw new TypeError(`Invalid attribute ${key}`);
  return out;
}

function checkedTag(node: MathElement): string {
  if (!MATH_TAGS.has(node.tag)) throw new TypeError("Invalid MathML tag");
  return node.tag;
}

/** Builds MathML DOM in the MathML namespace; throws on anything outside the allowed sets. */
export function mathToDOM(node: MathElement, doc?: Document): Element {
  assertTree(node);
  const d = doc ?? globalThis.document;
  if (!d) throw new TypeError("mathToDOM needs a Document");
  const build = (n: MathElement): Element => {
    const element = d.createElementNS(MATH_NAMESPACE, checkedTag(n));
    for (const [key, value] of entries(n)) element.setAttribute(key, value);
    for (const child of n.children) {
      element.append(typeof child === "string" ? d.createTextNode(child) : build(child));
    }
    return element;
  };
  return build(node);
}

const ESCAPES: ReadonlyMap<string, string> = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
]);

const escape = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES.get(c) ?? c);

/** Serializes MathML markup (xmlns on the root) for server-rendered HTML. */
export function mathToString(node: MathElement): string {
  assertTree(node);
  const write = (n: MathElement, root: boolean): string => {
    const tag = checkedTag(n);
    let open = root ? `<${tag} xmlns="${MATH_NAMESPACE}"` : `<${tag}`;
    for (const [key, value] of entries(n)) open += ` ${key}="${escape(value)}"`;
    const inner = n.children
      .map((child) => (typeof child === "string" ? escape(child) : write(child, false)))
      .join("");
    return `${open}>${inner}</${tag}>`;
  };
  return write(node, true);
}
