// Recursive-descent TeX parser producing a MathML tree. Shapes follow KaTeX:
// one `mi` per letter, digits joined into `mn`, groups become `mrow` (a one-child group
// is unwrapped), `\left…\right` is an `mrow` with stretchy fences. Large operators with
// limits (\sum, \lim, …) put limits under/over in display mode and at the side inline.

import { applyFont } from "./fonts";
import { MATH_FONTS, TEXT_FONTS } from "./fonts";
import { Lexer, type Token } from "./lexer";
import { ACCENTS, type AccentKind, DELIMITERS, SPACES, SYMBOLS, type SymbolEntry } from "./symbols";
import {
  type MathAttr,
  type MathElement,
  type MathNode,
  type MathTag,
  TexFailure,
  type TexResult,
  fail,
} from "./types";

export const TEX_MAX_LENGTH = 2000;
export const TEX_MAX_DEPTH = 64;

type Attrs = Partial<Record<MathAttr, string>>;

function el(tag: MathTag, children: MathNode[], attrs?: Attrs): MathElement {
  return attrs ? { tag, attrs, children } : { tag, children };
}

/** Plain brackets do not stretch; only `\left`/`\right` fences do. */
const BRACKETS = new Set([..."()[]{}|‖⟨⟩⌊⌋⌈⌉"]);
const CHAR_OPERATORS: ReadonlyMap<string, string> = new Map([
  ["-", "−"],
  ["*", "∗"],
  ["'", "′"],
]);

function mo(text: string): MathElement {
  return el("mo", [text], BRACKETS.has(text) ? { stretchy: "false" } : undefined);
}

function fence(text: string): MathElement {
  return el("mo", [text], { fence: "true", stretchy: "true" });
}

function row(nodes: MathElement[]): MathElement {
  return nodes.length === 1 ? nodes[0]! : el("mrow", nodes);
}

/** Tokens that end an expression or start a script, so they cannot be an argument. */
const NOT_ARGUMENT = new Set(["", "}", "^", "_", "\\right"]);

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= "0" && c <= "9";

function charNode(c: string): MathElement {
  if (/^\p{L}/u.test(c)) return el("mi", [c]);
  if (isDigit(c) || /^\p{N}/u.test(c)) return el("mn", [c]);
  if (c === "~") return el("mspace", [], { width: "0.25em" });
  return mo(CHAR_OPERATORS.get(c) ?? c);
}

/** `limits`: undefined for ordinary atoms; for operators, whether limits go under/over. */
interface Atom {
  node: MathElement;
  limits?: boolean;
}

class Parser {
  private depth = 0;
  private lefts = 0;
  private readonly lx: Lexer;

  constructor(
    src: string,
    private readonly display: boolean,
  ) {
    this.lx = new Lexer(src);
  }

  parse(): MathElement[] {
    const nodes = this.expression(false);
    const t = this.lx.peek();
    if (t.text === "}") fail("unexpectedClose", t.from, t.to, "}");
    if (t.text === "\\right") fail("unmatchedRight", t.from, t.to, "\\right");
    return nodes;
  }

  /** Parses until the end, `}`, `\right` or (inside `\sqrt[…]`) `]`; the caller checks which. */
  private expression(bracket: boolean): MathElement[] {
    const out: MathElement[] = [];
    for (;;) {
      const t = this.lx.peek().text;
      if (t === "" || t === "}" || t === "\\right" || (bracket && t === "]")) return out;
      out.push(this.scripted());
    }
  }

  private enter(t: Token): void {
    if (++this.depth > TEX_MAX_DEPTH) fail("tooDeep", t.from, t.to, String(TEX_MAX_DEPTH));
  }

  /** Consumes the closing token of a group opened by `open`. */
  private close(open: Token, want: string): void {
    const t = this.lx.next();
    if (t.text === want) return;
    if (t.text === "\\right") fail("unmatchedRight", t.from, t.to, "\\right");
    fail("unclosedGroup", open.from, open.to, want);
  }

  private scripted(): MathElement {
    const first = this.lx.peek().text;
    const base: Atom = first === "^" || first === "_" ? { node: el("mrow", []) } : this.atom();
    let sub: MathElement | undefined;
    let sup: MathElement | undefined;
    let primes = "";
    for (;;) {
      const t = this.lx.peek();
      if (t.cmd || (t.text !== "'" && t.text !== "^" && t.text !== "_")) break;
      if (t.text === "_" ? sub : sup)
        fail("doubleScript", t.from, t.to, t.text === "_" ? "_" : "^");
      this.lx.next();
      if (t.text === "'") primes += "′";
      else if (t.text === "^") sup = this.argument(t);
      else sub = this.argument(t);
    }
    if (primes) sup = sup ? el("mrow", [mo(primes), sup]) : mo(primes);
    if (!sub && !sup) return base.node;
    const under = base.limits === true;
    if (sub && sup) return el(under ? "munderover" : "msubsup", [base.node, sub, sup]);
    if (sub) return el(under ? "munder" : "msub", [base.node, sub]);
    return el(under ? "mover" : "msup", [base.node, sup!]);
  }

  private atom(): Atom {
    const t = this.lx.next();
    if (t.cmd) return this.command(t);
    if (t.text === "{") return { node: this.group(t) };
    if (isDigit(t.text) || (t.text === "." && isDigit(this.lx.src[t.to]))) {
      return { node: this.number(t.text) };
    }
    return { node: charNode(t.text) };
  }

  private number(first: string): MathElement {
    let text = first;
    for (;;) {
      const t = this.lx.peek();
      if (t.cmd || !(isDigit(t.text) || (t.text === "." && isDigit(this.lx.src[t.to])))) break;
      text += t.text;
      this.lx.next();
    }
    return el("mn", [text]);
  }

  private group(open: Token): MathElement {
    this.enter(open);
    const body = this.expression(false);
    this.close(open, "}");
    this.depth--;
    return row(body);
  }

  /** A command or script argument: a braced group or a single token. */
  private argument(owner: Token): MathElement {
    const t = this.lx.peek();
    if (NOT_ARGUMENT.has(t.text)) fail("missingArgument", owner.from, owner.to, owner.text);
    this.lx.next();
    if (t.text === "{") return this.group(t);
    if (!t.cmd) return charNode(t.text);
    this.enter(t);
    const node = this.command(t).node;
    this.depth--;
    return node;
  }

  private command(t: Token): Atom {
    const name = /^\\\s$/.test(t.text) ? " " : t.text.slice(1);
    const space = SPACES.get(name);
    if (space) return { node: el("mspace", [], { width: space }) };
    const symbol = SYMBOLS.get(name);
    if (symbol) return this.symbol(symbol);
    const accent = ACCENTS.get(name);
    if (accent) return { node: this.accent(t, ...accent) };
    const font = MATH_FONTS.get(name);
    if (font) return { node: applyFont(this.argument(t), font) };
    const textFont = TEXT_FONTS.get(name);
    if (textFont !== undefined) {
      const text = this.lx.rawGroup(t);
      return {
        node: el("mtext", text ? [text] : [], textFont ? { mathvariant: textFont } : undefined),
      };
    }
    switch (name) {
      case "frac":
      case "dfrac":
      case "tfrac":
      case "cfrac":
        return { node: el("mfrac", [this.argument(t), this.argument(t)]) };
      case "sqrt":
        return { node: this.sqrt(t) };
      case "left":
        return { node: this.leftRight(t) };
      case "middle": {
        if (this.lefts === 0) fail("unmatchedRight", t.from, t.to, "\\middle");
        const d = this.delimiter(t);
        return { node: d ? fence(d) : el("mrow", []) };
      }
    }
    return fail("unknownCommand", t.from, t.to, t.text);
  }

  private symbol(entry: SymbolEntry): Atom {
    const node =
      entry.tag === "mo"
        ? mo(entry.text)
        : el("mi", [entry.text], entry.normal ? { mathvariant: "normal" } : undefined);
    if (!entry.op) return { node };
    const next = this.lx.peek();
    if (next.text === "\\limits" || next.text === "\\nolimits") {
      this.lx.next();
      return { node, limits: next.text === "\\limits" };
    }
    return { node, limits: entry.op === "limits" && this.display };
  }

  private accent(t: Token, mark: string, kind: AccentKind): MathElement {
    const base = this.argument(t);
    const symbol = el("mo", [mark], { stretchy: kind === "over" ? "false" : "true" });
    return kind === "under"
      ? el("munder", [base, symbol])
      : el("mover", [base, symbol], { accent: "true" });
  }

  private sqrt(t: Token): MathElement {
    const open = this.lx.peek();
    if (open.text !== "[") return el("msqrt", [this.argument(t)]);
    this.lx.next();
    this.enter(open);
    const index = this.expression(true);
    this.close(open, "]");
    this.depth--;
    return el("mroot", [this.argument(t), row(index)]);
  }

  private leftRight(left: Token): MathElement {
    this.enter(left);
    const open = this.delimiter(left);
    this.lefts++;
    const body = this.expression(false);
    const right = this.lx.next();
    if (right.text !== "\\right") fail("unmatchedLeft", left.from, left.to, "\\left");
    this.lefts--;
    const close = this.delimiter(right);
    this.depth--;
    const children = [...(open ? [fence(open)] : []), ...body, ...(close ? [fence(close)] : [])];
    return el("mrow", children);
  }

  private delimiter(owner: Token): string {
    const t = this.lx.next();
    if (t.text === "") fail("missingArgument", owner.from, owner.to, owner.text);
    const d = DELIMITERS.get(t.text);
    if (d === undefined) fail("badDelimiter", t.from, t.to, t.text);
    return d;
  }
}

/** Converts TeX to a MathML tree; `display` renders a block (`display="block"`). */
export function parseTex(tex: string, options: { display?: boolean } = {}): TexResult {
  const display = options.display === true;
  try {
    if (tex.length > TEX_MAX_LENGTH) {
      fail("tooLong", TEX_MAX_LENGTH, tex.length, String(TEX_MAX_LENGTH));
    }
    const children = new Parser(tex, display).parse();
    return { ok: true, math: el("math", children, display ? { display: "block" } : undefined) };
  } catch (error) {
    if (error instanceof TexFailure) return { ok: false, error: error.error };
    throw error;
  }
}
