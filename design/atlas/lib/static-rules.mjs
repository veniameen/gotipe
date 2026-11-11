// Static rules of the atlas's parts: literal colours and sizes live only in the token files,
// every var() is defined, markup carries no inline styles, colours or network addresses.
import { readPart } from "./assemble.mjs";

const TOKENS = new Set(["tokens.css", "tokens-views.css", "tokens-ui.css"]);
const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/i;
const LENGTH_LITERAL =
  /(?<![\w#-])-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|ex|ch|vh|vw|vmin|vmax|svh|dvh|lvh|pt|pc|cm|mm|in|q)\b/i;
const NAMED_COLOR =
  /(?<![\w-])(?:white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|brown|navy|teal)(?![\w-])/i;
const TYPE_PROPS = new Set(["font-size", "font-weight", "line-height", "letter-spacing"]);
const FREE_VALUES = /^(?:0|normal|inherit|initial|unset|none|auto)$/i;

/** Strips comments but keeps line breaks so reported lines match the file. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
const lineAt = (text, index) => text.slice(0, index).split("\n").length;

/** Declarations of a stylesheet with their line numbers; nested rules and @-blocks included. */
export function declarations(css) {
  const text = stripComments(css);
  const out = [];
  let depth = 0;
  let start = 0;
  const flush = (end) => {
    const chunk = text.slice(start, end);
    const lastSemi = chunk.lastIndexOf(";");
    const body = text[end] === "{" ? chunk.slice(0, lastSemi + 1) : chunk;
    let offset = start;
    for (const piece of body.split(";")) {
      const colon = piece.indexOf(":");
      if (colon > 0 && depth > 0) {
        const property = piece.slice(0, colon).trim().toLowerCase();
        const value = piece.slice(colon + 1).trim();
        if (property && value) out.push({ property, value, line: lineAt(text, offset + colon) });
      }
      offset += piece.length + 1;
    }
  };
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      flush(i);
      depth++;
      start = i + 1;
    } else if (text[i] === "}") {
      flush(i);
      depth--;
      start = i + 1;
    }
  }
  return out;
}

function literalIn(property, value) {
  const plain = value.replace(/var\(--[\w-]+\)/g, "");
  if (COLOR_LITERAL.test(plain)) return "colour";
  if (LENGTH_LITERAL.test(plain)) return "size";
  if (NAMED_COLOR.test(plain) && !property.startsWith("font")) return "named colour";
  if (property === "font-family" && !/^var\(--[\w-]+\)$/.test(value)) return "font family";
  if (TYPE_PROPS.has(property) && !FREE_VALUES.test(plain.trim()) && /\d/.test(plain)) {
    return "type value";
  }
  return null;
}

/** @media and @container conditions outside the token files must not hold literal sizes. */
function checkPreludes(name, css) {
  const text = stripComments(css);
  const out = [];
  for (const m of text.matchAll(/@(?:media|container|supports)\b[^{]*/g)) {
    if (LENGTH_LITERAL.test(m[0]))
      out.push(`${name}:${lineAt(text, m.index)} literal size in ${m[0].trim()} → token files`);
  }
  return out;
}

export function checkStyles(names) {
  const problems = [];
  const defined = new Set();
  const used = [];
  for (const name of names) {
    if (!TOKENS.has(name)) problems.push(...checkPreludes(name, readPart(name)));
    for (const { property, value, line } of declarations(readPart(name))) {
      if (property.startsWith("--")) defined.add(property);
      for (const m of value.matchAll(/var\((--[\w-]+)/g))
        used.push({ token: m[1], at: `${name}:${line}` });
      if (TOKENS.has(name)) {
        if (!property.startsWith("--") && property !== "color-scheme") {
          problems.push(`${name}:${line} ${property} — token files hold only custom properties`);
        }
        continue;
      }
      const kind = literalIn(property, value);
      if (kind) problems.push(`${name}:${line} literal ${kind} in ${property}: ${value} → a token`);
    }
  }
  for (const { token, at } of used) {
    if (!defined.has(token)) problems.push(`${at} var(${token}) is not defined`);
  }
  return { problems, defined };
}

export function checkMarkup(names, defined) {
  const problems = [];
  for (const name of names) {
    const html = readPart(name);
    html.split("\n").forEach((text, index) => {
      const at = `${name}:${index + 1}`;
      if (/\sstyle\s*=/.test(text)) problems.push(`${at} inline style → a class and tokens`);
      if (/<link\b|<script\b[^>]*\bsrc=|@import/i.test(text))
        problems.push(`${at} external resource`);
      if (/\b(?:src|href)\s*=\s*"(?:https?:)?\/\//i.test(text))
        problems.push(`${at} network address`);
      for (const m of text.matchAll(/\b(?:fill|stroke|color|stop-color)\s*=\s*"([^"]*)"/g)) {
        if (!/^(?:none|currentColor)$/.test(m[1])) problems.push(`${at} colour attribute ${m[0]}`);
      }
      for (const m of text.matchAll(/var\((--[\w-]+)/g)) {
        if (!defined.has(m[1])) problems.push(`${at} var(${m[1]}) is not defined`);
      }
    });
  }
  return problems;
}
