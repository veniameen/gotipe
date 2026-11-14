// TeX tokens on demand: a command (`\name` or `\` + one character) or one code point.
// Math mode skips whitespace and `%` comments; `\text` reads its group raw.

import { fail } from "./types";

export interface Token {
  /** Token source text; "" only at the end of input. */
  text: string;
  cmd: boolean;
  from: number;
  to: number;
}

const LETTER = /[A-Za-z]/;
const SPACE = /\s/;
/** Characters a backslash escapes inside `\text{…}`. */
const TEXT_ESCAPES = "{}$%&#_ ";

export class Lexer {
  pos = 0;

  constructor(readonly src: string) {}

  peek(): Token {
    return this.scan(this.skip(this.pos));
  }

  next(): Token {
    const token = this.peek();
    this.pos = token.to;
    return token;
  }

  /** Reads the braced argument of a text command literally (nested braces balanced). */
  rawGroup(owner: Token): string {
    const src = this.src;
    let i = this.skip(this.pos);
    if (src[i] !== "{") fail("missingArgument", owner.from, owner.to, owner.text);
    const open = i++;
    let depth = 1;
    let text = "";
    while (i < src.length) {
      const c = src[i]!;
      if (c === "\\" && i + 1 < src.length) {
        const escaped = src[i + 1]!;
        text += TEXT_ESCAPES.includes(escaped) ? escaped : c + escaped;
        i += 2;
        continue;
      }
      i++;
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        this.pos = i;
        return text;
      } else if (c !== "}") text += c;
    }
    return fail("unclosedGroup", open, open + 1, "}");
  }

  private skip(start: number): number {
    const src = this.src;
    let i = start;
    while (i < src.length) {
      if (SPACE.test(src[i]!)) i++;
      else if (src[i] === "%") while (i < src.length && src[i] !== "\n") i++;
      else break;
    }
    return i;
  }

  private scan(i: number): Token {
    const src = this.src;
    if (i >= src.length) return { text: "", cmd: false, from: i, to: i };
    if (src[i] === "\\") {
      let j = i + 1;
      while (j < src.length && LETTER.test(src[j]!)) j++;
      if (j === i + 1 && j < src.length) j += codePointWidth(src, j);
      return { text: src.slice(i, j), cmd: true, from: i, to: j };
    }
    const to = i + codePointWidth(src, i);
    return { text: src.slice(i, to), cmd: false, from: i, to };
  }
}

function codePointWidth(src: string, i: number): number {
  return (src.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
}
