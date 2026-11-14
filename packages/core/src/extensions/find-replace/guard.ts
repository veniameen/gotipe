/**
 * Static check of a regular expression for catastrophic backtracking, for searches that cannot
 * run in a Worker (no `Worker`, a CSP without `worker-src blob:`, server rendering). A running
 * JavaScript match cannot be interrupted, so a pattern that may backtrack exponentially or with
 * a high polynomial degree is refused before it runs:
 *
 * - a quantifier that may repeat (`+`, `*`, `{2}`, `{1,30}`) on a group that can match one
 *   text in more than one way: `(a+){8}`, `(a?){25}`, `(a|aa)*`, `(.*a){12}`;
 * - two flexible atoms (`*`, `+`, `?`, `{1,30}`, an ambiguous group) that can trade a
 *   character, with only optional atoms or atoms that match the traded character between
 *   them: `a*a*`, `.*.*`, `\w+\s?\w+`, `.*a.*`.
 *
 * Alternatives are unambiguous when they are words of which none starts another, as in
 * `(cat|dog)+` or `(cat|car)+`, or when they start with different characters. The check is
 * conservative: it refuses some harmless patterns.
 */

/** Characters an atom can match: listed ones, class escapes such as `w`, or anything. */
interface Chars {
  any: boolean;
  chars: Set<string>;
  classes: Set<string>;
}

interface Atom {
  chars: Chars;
  /** Characters the atom can start with, when fewer than `chars`. */
  head?: Chars;
  /** The atom is one literal character. */
  literal?: string;
  group?: Frame;
  /** A backreference: its length depends on the text. */
  flexible?: boolean;
}

interface Frame {
  /** A lookaround: it matches no characters and is checked on its own. */
  look: boolean;
  /** The group can match one text in more than one way. */
  variable: boolean;
  /** Characters any atom of the group can match. */
  all: Chars;
  branches: { word: string | null; first: Chars }[];
  /** The current alternative as literal text while it is literal, and its first characters. */
  word: string | null;
  first: Chars | null;
  /** Flexible atoms the next atom follows: characters can move between them and it. */
  chain: Chars[];
  /** The chain before the group, where every alternative starts. */
  entry: Chars[];
  /** The chains at the ends of the finished alternatives. */
  tails: Chars[];
}

const none = (): Chars => ({ any: false, chars: new Set(), classes: new Set() });
const anything = (): Chars => ({ any: true, chars: new Set(), classes: new Set() });
const CLASS_TEST: Record<string, RegExp> = { d: /\d/, w: /\w/, s: /\s/ };
/** Pairs of class escapes without a common character. */
const DISJOINT = new Set(["dD", "wW", "sS", "ds", "ws", "dW"]);
const CONTROLS: Record<string, string> = { t: "\t", n: "\n", v: "\v", f: "\f", r: "\r", 0: "\0" };
const MAX_RANGE = 512;
/** An unescaped `-` in a bracket class: a range when it stands between two characters. */
const DASH = Symbol("dash");

function merge(target: Chars, source: Chars): Chars {
  target.any ||= source.any;
  for (const char of source.chars) target.chars.add(char);
  for (const name of source.classes) target.classes.add(name);
  return target;
}

function inClass(char: string, name: string): boolean {
  const lower = name.toLowerCase();
  return CLASS_TEST[lower]!.test(char) === (name === lower);
}

function overlaps(a: Chars, b: Chars): boolean {
  if (a.any || b.any) return true;
  for (const char of a.chars)
    if (b.chars.has(char) || [...b.classes].some((name) => inClass(char, name))) return true;
  for (const char of b.chars) if ([...a.classes].some((name) => inClass(char, name))) return true;
  for (const x of a.classes)
    for (const y of b.classes)
      if (x === y || !(DISJOINT.has(x + y) || DISJOINT.has(y + x))) return true;
  return false;
}

function frame(entry: Chars[], look: boolean): Frame {
  return {
    look,
    variable: false,
    all: none(),
    branches: [],
    word: "",
    first: null,
    chain: entry,
    entry,
    tails: [],
  };
}

/** Alternatives that can match one text in two ways, or a prefix of one another. */
function ambiguous(branches: Frame["branches"]): boolean {
  if (branches.length < 2) return false;
  const words = branches.map((branch) => branch.word);
  if (words.every((word) => word !== null))
    return words.some((a, i) => words.some((b, j) => i !== j && b!.startsWith(a!)));
  return branches.some((a, i) => branches.some((b, j) => i < j && overlaps(a.first, b.first)));
}

class Reader {
  constructor(
    private source: string,
    private fold: (char: string) => string,
  ) {}

  private literal(char: string, end: number): { atom: Atom; end: number } {
    const folded = this.fold(char);
    return { atom: { chars: { ...none(), chars: new Set([folded]) }, literal: folded }, end };
  }

  /** The escape at `index`: what it matches (`null`: nothing, as `\b`) and its last index. */
  escape(index: number, inBracket: boolean): { atom: Atom | null; end: number } {
    const source = this.source;
    const next = source[index + 1] ?? "";
    if ("dDwWsS".includes(next))
      return { atom: { chars: { ...none(), classes: new Set([next]) } }, end: index + 1 };
    if (next === "b" && inBracket) return this.literal("\b", index + 1);
    if (next === "b" || next === "B") return { atom: null, end: index + 1 };
    if (next === "p" || next === "P")
      return { atom: { chars: anything() }, end: source.indexOf("}", index) };
    if (next === "k")
      return { atom: { chars: anything(), flexible: true }, end: source.indexOf(">", index) };
    if (/[1-9]/.test(next)) {
      let end = index + 1;
      while (/\d/.test(source[end + 1] ?? "")) end++;
      return { atom: { chars: anything(), flexible: true }, end };
    }
    if (next === "c")
      return this.literal(String.fromCharCode(source.charCodeAt(index + 2) % 32), index + 2);
    if (next === "x")
      return this.literal(
        String.fromCharCode(Number.parseInt(source.slice(index + 2, index + 4), 16)),
        index + 3,
      );
    if (next === "u") return this.unicode(index);
    return this.literal(CONTROLS[next] ?? next, index + 1);
  }

  /** `\u{…}`, `\uXXXX` or a surrogate pair written as two `\uXXXX`. */
  private unicode(index: number): { atom: Atom; end: number } {
    const source = this.source;
    if (source[index + 2] === "{") {
      const close = source.indexOf("}", index);
      return this.literal(
        String.fromCodePoint(Number.parseInt(source.slice(index + 3, close), 16)),
        close,
      );
    }
    let code = Number.parseInt(source.slice(index + 2, index + 6), 16);
    let end = index + 5;
    if (code >= 0xd800 && code <= 0xdbff && source.startsWith("\\u", end + 1)) {
      const low = Number.parseInt(source.slice(end + 3, end + 7), 16);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        end += 6;
      }
    }
    return this.literal(String.fromCodePoint(code), end);
  }

  /** The bracket class starting at `index` and its closing index. */
  bracket(index: number): { chars: Chars; end: number } {
    const source = this.source;
    const negated = source[index + 1] === "^";
    const items: (string | Chars | typeof DASH)[] = [];
    let at = index + (negated ? 2 : 1);
    while (at < source.length && source[at] !== "]") {
      if (source[at] === "\\") {
        const { atom, end } = this.escape(at, true);
        items.push(atom?.literal ?? atom?.chars ?? anything());
        at = end + 1;
      } else {
        const char = String.fromCodePoint(source.codePointAt(at)!);
        items.push(char === "-" ? DASH : this.fold(char));
        at += char.length;
      }
    }
    const chars = none();
    for (let item = 0; item < items.length; item++) {
      const from = items[item]!;
      const to = items[item + 2];
      if (typeof from === "string" && items[item + 1] === DASH && typeof to === "string") {
        const start = from.codePointAt(0)!;
        const stop = to.codePointAt(0)!;
        if (stop - start > MAX_RANGE) chars.any = true;
        for (let point = start; point <= stop && !chars.any; point++)
          chars.chars.add(this.fold(String.fromCodePoint(point)));
        item += 2;
      } else if (typeof from === "string") chars.chars.add(from);
      else if (from === DASH) chars.chars.add("-");
      else merge(chars, from);
    }
    return { chars: negated ? anything() : chars, end: at };
  }
}

/** `true` when `source` must not run outside a Worker; see the module comment. */
export function unsafePattern(source: string, ignoreCase = false): boolean {
  const caseless = ignoreCase || /\(\?(?:[ims]+-?[ims]*|-[ims]+):/.test(source);
  const reader = new Reader(source, (char) => (caseless ? char.toLowerCase() : char));
  const stack: Frame[] = [frame([], false)];
  const top = () => stack.at(-1)!;
  /** The atom a following quantifier applies to. */
  let pending: Atom | null = null;

  /** `pending` occurs from `min` to `max` times; `false` when that may backtrack badly. */
  const commit = (min: number, max: number): boolean => {
    const atom = pending;
    pending = null;
    if (!atom) return true;
    const current = top();
    const group = atom.group;
    if (group?.variable && max > 1) return false;
    const { chars, head = atom.chars } = atom;
    const flexible = min !== max || !!group?.variable || !!atom.flexible;
    const before = current.chain;
    // The atoms inside a group were checked against `before` already, from its first one on.
    if (flexible && before.some((previous) => overlaps(previous, head))) return false;
    current.first ??= head;
    current.word =
      current.word !== null && atom.literal !== undefined && min === 1 && max === 1
        ? current.word + atom.literal
        : null;
    merge(current.all, chars);
    let chain = before;
    if (group) chain = min > 0 ? group.tails : [...before, ...group.tails];
    else if (min > 0) chain = before.filter((previous) => overlaps(previous, chars));
    if (flexible) {
      current.variable = true;
      chain = [...chain, chars];
    }
    current.chain = chain;
    return true;
  };
  const endBranch = (group: Frame) => {
    group.branches.push({ word: group.word, first: group.first ?? none() });
    group.tails.push(...group.chain);
    group.word = "";
    group.first = null;
    group.chain = group.entry;
  };

  for (let index = 0; index < source.length; index++) {
    const quantifier =
      pending && /^(?:([*+?])|\{(\d+)(,?)(\d*)\})\??/.exec(source.slice(index, index + 24));
    if (quantifier) {
      const [text, symbol, least, comma, most] = quantifier;
      const min = symbol === "+" ? 1 : symbol ? 0 : Number(least);
      const max =
        symbol === "?"
          ? 1
          : symbol || (comma && !most)
            ? Number.POSITIVE_INFINITY
            : Number(most || least);
      if (!commit(min, max)) return true;
      index += text.length - 1;
      continue;
    }
    if (!commit(1, 1)) return true;
    const char = String.fromCodePoint(source.codePointAt(index)!);
    if (char === "\\") {
      const { atom, end } = reader.escape(index, false);
      pending = atom;
      index = end;
    } else if (char === "[") {
      const { chars, end } = reader.bracket(index);
      pending = { chars };
      index = end;
    } else if (char === "(") {
      const rest = source.slice(index + 2, index + 4);
      const look = source[index + 1] === "?" && /^(?:=|!|<=|<!)/.test(rest);
      if (look) index += rest[0] === "<" ? 3 : 2;
      else if (source[index + 1] === "?")
        index = source.indexOf(rest[0] === "<" ? ">" : ":", index);
      stack.push(frame(look ? [] : top().chain, look));
    } else if (char === ")" && stack.length > 1) {
      const group = stack.pop()!;
      endBranch(group);
      if (ambiguous(group.branches)) group.variable = true;
      const head = group.branches.reduce((union, branch) => merge(union, branch.first), none());
      pending = group.look ? null : { chars: group.all, head, group };
    } else if (char === "|") {
      endBranch(top());
    } else if (char !== "^" && char !== "$") {
      const folded = caseless ? char.toLowerCase() : char;
      pending =
        char === "."
          ? { chars: anything() }
          : { chars: { ...none(), chars: new Set([folded]) }, literal: folded };
      index += char.length - 1;
    }
  }
  return !commit(1, 1);
}
