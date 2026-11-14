/**
 * GFM autolink literals: `www.…`, `http://…`, `https://…` and e-mail addresses in plain text.
 * A literal is found where the source writes its start as it is: an escape or a character
 * reference in its `www.`, its `scheme://` or its `@` keeps the words text (`www\.a.b`), while
 * the rest of an address may hold them (`https://a.b/c\_d` is one link). The writer escapes that
 * start in typed text that a reader would take for an address (D-97).
 * `crates/gotipe-export/src/markdown_parse/autolinks.rs` is the Rust copy.
 */

/** An autolink literal found at an offset of a text. */
export interface LiteralLink {
  /** Where it ends: the text of the link is `text.slice(start, end)`. */
  end: number;
  url: string;
  /**
   * The character whose escape keeps the words text: the `.` after `www`, the `:` of the
   * scheme or the `@` of an address.
   */
  trigger: number;
}

/** A scheme in any case; `www.` in lower case, as GFM reads it. */
const PREFIX = /(?:[Hh][Tt][Tt][Pp][Ss]?:\/\/|www\.)/y;
const EMAIL_DOMAIN = /[A-Za-z\d](?:[A-Za-z\d.-]*\.)[A-Za-z]{2,}/y;
const EMAIL_LOCAL = /[A-Za-z\d.!#$%&'*+/=?^_`{|}~-]/;
/** A literal starts at the start of a word only. */
const WORD = /[\p{L}\p{N}_]/u;
/** What ends an address: JavaScript `\s`, `<` and `>`. */
const URL_END = /[\s<>]/;
/** Punctuation that is not part of an address at its end. */
const TRAILING = /[?!.,:*_~]/;

/** The code point that ends right before `index`, or undefined at the start. */
export function charBefore(text: string, index: number): string | undefined {
  if (index <= 0) return undefined;
  const low = text.charCodeAt(index - 1);
  if (index >= 2 && low >= 0xdc00 && low <= 0xdfff) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(index - 2, index);
  }
  return text[index - 1];
}

/**
 * Autolink literals of one text, looked up offset by offset. `literal(i)` says whether the
 * source writes `text[i]` as it is (not as an escape or a reference); it may change between
 * lookups. What lookups share is computed once, so a scan of the whole text is linear (D-96).
 */
export class AutolinkScanner {
  /** Per offset: where the run of address characters from it ends. */
  private ends: Int32Array | null = null;
  /** Per end offset: where the run of trailing punctuation that ends there starts. */
  private trails: Int32Array | null = null;
  /** How many `(` and `)` there are before each offset. */
  private opens: Int32Array | null = null;
  private closes: Int32Array | null = null;
  /** Per offset: where the run of e-mail local-part characters from it ends. */
  private localEnd: Int32Array | null = null;
  /** The end of the e-mail domain after each `@` (0: none), filled when asked. */
  private readonly domains = new Map<number, number>();

  constructor(
    readonly text: string,
    private readonly literal: (index: number) => boolean = () => true,
  ) {}

  /**
   * The literal that starts at `p`, when the character before it (`before`, undefined at the
   * start of text) does not continue a word.
   */
  at(p: number, before: string | undefined): LiteralLink | null {
    if (before !== undefined && WORD.test(before)) return null;
    const c = this.text[p];
    if (c === "w" || c === "h" || c === "H") {
      PREFIX.lastIndex = p;
      const prefix = PREFIX.exec(this.text);
      if (prefix) {
        const url = this.url(p, prefix[0]);
        if (url) return url;
      }
    }
    return this.email(p);
  }

  private prepare(): void {
    const text = this.text;
    const n = text.length;
    const ends = new Int32Array(n + 1);
    const trails = new Int32Array(n + 1);
    const opens = new Int32Array(n + 1);
    const closes = new Int32Array(n + 1);
    ends[n] = n;
    for (let i = n - 1; i >= 0; i--) ends[i] = URL_END.test(text[i]!) ? i : ends[i + 1]!;
    for (let i = 0; i < n; i++) {
      trails[i + 1] = TRAILING.test(text[i]!) ? trails[i]! : i + 1;
      opens[i + 1] = opens[i]! + (text[i] === "(" ? 1 : 0);
      closes[i + 1] = closes[i]! + (text[i] === ")" ? 1 : 0);
    }
    this.ends = ends;
    this.trails = trails;
    this.opens = opens;
    this.closes = closes;
  }

  private url(p: number, prefix: string): LiteralLink | null {
    for (let i = p; i < p + prefix.length; i++) if (!this.literal(i)) return null;
    if (!this.ends) this.prepare();
    const text = this.text;
    let end = this.ends![p]!;
    if (end <= p + prefix.length) return null;
    // trailing punctuation is not part of the address
    end = Math.max(p, this.trails![end]!);
    // a closing parenthesis is part of it only when it balances an opening one
    const opens = this.opens![end]! - this.opens![p]!;
    let closes = this.closes![end]! - this.closes![p]!;
    while (closes > opens && text[end - 1] === ")") {
      end--;
      closes--;
    }
    // nor is a character reference at its end
    if (text[end - 1] === ";") {
      let start = end - 1;
      while (start > p && /[A-Za-z\d]/.test(text[start - 1]!)) start--;
      if (start < end - 1 && start > p && text[start - 1] === "&") end = start - 1;
    }
    // what is left must still be an address: `www.!` and `http://.` are text
    if (end - p <= prefix.length) return null;
    const www = prefix === "www.";
    const label = text.slice(p, end);
    return {
      end,
      url: www ? `http://${label}` : label,
      trigger: p + (www ? 3 : prefix.indexOf(":")),
    };
  }

  private email(p: number): LiteralLink | null {
    const text = this.text;
    if (!EMAIL_LOCAL.test(text[p] ?? "")) return null;
    if (!this.localEnd) {
      const ends = new Int32Array(text.length + 1);
      ends[text.length] = text.length;
      for (let i = text.length - 1; i >= 0; i--)
        ends[i] = EMAIL_LOCAL.test(text[i]!) ? ends[i + 1]! : i;
      this.localEnd = ends;
    }
    const at = this.localEnd[p]!;
    if (text[at] !== "@" || !this.literal(at)) return null;
    let end = this.domains.get(at);
    if (end === undefined) {
      EMAIL_DOMAIN.lastIndex = at + 1;
      const domain = EMAIL_DOMAIN.exec(text);
      end = domain ? at + 1 + domain[0].length : 0;
      this.domains.set(at, end);
    }
    if (end === 0) return null;
    return { end, url: `mailto:${text.slice(p, end)}`, trigger: at };
  }
}
