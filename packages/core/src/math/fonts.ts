// Math alphabets (\mathbf, \mathbb, …) and text commands. MathML Core renders only
// `mathvariant="normal"`, so Latin letters and digits are also mapped to the Unicode
// Mathematical Alphanumeric Symbols; the attribute stays for legacy renderers.

import type { MathElement, MathNode } from "./types";

export type MathFont =
  | "normal"
  | "bold"
  | "italic"
  | "bold-italic"
  | "double-struck"
  | "script"
  | "fraktur"
  | "sans-serif"
  | "monospace";

export const MATH_FONTS: ReadonlyMap<string, MathFont> = new Map<string, MathFont>([
  ["mathrm", "normal"],
  ["operatorname", "normal"],
  ["mathbf", "bold"],
  ["mathit", "italic"],
  ["boldsymbol", "bold-italic"],
  ["bm", "bold-italic"],
  ["mathbb", "double-struck"],
  ["mathcal", "script"],
  ["mathscr", "script"],
  ["mathfrak", "fraktur"],
  ["mathsf", "sans-serif"],
  ["mathtt", "monospace"],
]);

/** Text commands; "" keeps the default upright text font. */
export const TEXT_FONTS: ReadonlyMap<string, MathFont | ""> = new Map<string, MathFont | "">([
  ["text", ""],
  ["textrm", ""],
  ["textnormal", ""],
  ["mbox", ""],
  ["textbf", "bold"],
  ["textit", "italic"],
  ["textsf", "sans-serif"],
  ["texttt", "monospace"],
]);

/** [code point of "A", code point of "0" (0 = no digits), reserved letters "X𝑋…"] */
const ALPHABETS: ReadonlyMap<MathFont, [number, number, string]> = new Map<
  MathFont,
  [number, number, string]
>([
  ["bold", [0x1d400, 0x1d7ce, ""]],
  ["italic", [0x1d434, 0, "hℎ"]],
  ["bold-italic", [0x1d468, 0, ""]],
  ["script", [0x1d49c, 0, "BℬEℰFℱHℋIℐLℒMℳRℛeℯgℊoℴ"]],
  ["fraktur", [0x1d504, 0, "CℭHℌIℑRℜZℨ"]],
  ["double-struck", [0x1d538, 0x1d7d8, "CℂHℍNℕPℙQℚRℝZℤ"]],
  ["sans-serif", [0x1d5a0, 0x1d7e2, ""]],
  ["monospace", [0x1d670, 0x1d7f6, ""]],
]);

function mapChar(c: string, font: MathFont): string {
  const alphabet = ALPHABETS.get(font);
  if (!alphabet || c.length !== 1) return c;
  const [letters, digits, reserved] = alphabet;
  const hole = reserved.indexOf(c);
  if (hole >= 0 && hole % 2 === 0) return reserved[hole + 1]!;
  const code = c.charCodeAt(0);
  if (code >= 65 && code <= 90) return String.fromCodePoint(letters + code - 65);
  if (code >= 97 && code <= 122) return String.fromCodePoint(letters + 26 + code - 97);
  if (digits && code >= 48 && code <= 57) return String.fromCodePoint(digits + code - 48);
  return c;
}

/** Joins adjacent identifiers, so `\operatorname{sgn}` becomes one `mi`. */
function mergeIdentifiers(children: MathNode[]): MathNode[] {
  const out: MathNode[] = [];
  for (const child of children) {
    const last = out[out.length - 1];
    if (
      typeof child !== "string" &&
      child.tag === "mi" &&
      typeof last !== "string" &&
      last?.tag === "mi"
    ) {
      out[out.length - 1] = {
        tag: "mi",
        children: [`${last.children.join("")}${child.children.join("")}`],
      };
    } else out.push(child);
  }
  return out;
}

/** Applies a math alphabet to identifiers and numbers in a freshly parsed subtree. */
export function applyFont(node: MathElement, font: MathFont): MathElement {
  if (node.tag === "mi" || node.tag === "mn") {
    const text = [...node.children.join("")].map((c) => mapChar(c, font)).join("");
    // Multi-letter `mi` is upright in MathML already; `mn` is never italic.
    const tagged = font !== "normal" || (node.tag === "mi" && [...text].length === 1);
    // Parsed `mi`/`mn` carry no attribute other than `mathvariant`, which the font replaces.
    return tagged
      ? { tag: node.tag, attrs: { mathvariant: font }, children: [text] }
      : { tag: node.tag, children: [text] };
  }
  if (node.tag === "mo" || node.tag === "mtext" || node.tag === "mspace") return node;
  const merged =
    font === "normal" && node.tag === "mrow" ? mergeIdentifiers(node.children) : node.children;
  const children = merged.map((c) => (typeof c === "string" ? c : applyFont(c, font)));
  if (node.tag === "mrow" && children.length === 1 && typeof children[0] !== "string") {
    return children[0]!;
  }
  return { ...node, children };
}
