import { type Extension, defineExtension } from "../../types/extension";
import { caretText, replaceBeforeCaret } from "./caret";

export interface TypographyOptions {
  /** Quote style: “ ” ‘ ’ (`en`) or « » with „ “ inside (`ru`); also the spaced dash. */
  locale: "en" | "ru";
  /** `"` and `'` become typographic quotes; `'` after a letter is an apostrophe ’. */
  quotes: boolean;
  /** `--` becomes —; a hyphen between spaces becomes – (`en`) or — (`ru`). */
  dashes: boolean;
  /** `...` becomes …. */
  ellipsis: boolean;
  /** `->` →, `<-` ←, `=>` ⇒. */
  arrows: boolean;
  /** `(c)` ©, `(r)` ®, `(tm)` ™. */
  symbols: boolean;
  /** `1/2`, `1/4`, `3/4` followed by a space become ½ ¼ ¾. */
  fractions: boolean;
  /** `x` between digits becomes ×: `2x3` → `2×3`; `0x1F` stays. */
  multiplication: boolean;
}

type Rule = keyof Omit<TypographyOptions, "locale">;
interface Replacement {
  from: number;
  to: number;
  insert: string;
}

const OPENS_QUOTE = /[\s([{<«„“‘—–/-]/u;
/** The caret is in an address: `https://…`, `www.…` or `mailto:…`, maybe after a quote. */
const LINK_LIKE = /(?:^|[\s"'«„“‘([<])(?:\S*:\/\/|www\.|mailto:)\S*$/i;

const depth = (text: string, open: string, close: string) =>
  text.split(open).length - text.split(close).length;

function quote(before: string, locale: TypographyOptions["locale"]): Replacement | null {
  const typed = before.at(-1);
  if (typed !== '"' && typed !== "'") return null;
  const at = before.length - 1;
  const previous = before[at - 1];
  const opening = previous === undefined || OPENS_QUOTE.test(previous);
  let insert: string;
  if (typed === "'") insert = opening ? "‘" : "’";
  else if (locale === "en") insert = opening ? "“" : "”";
  else {
    const text = before.slice(0, at);
    if (opening) insert = depth(text, "«", "»") > 0 ? "„" : "«";
    else insert = depth(text, "„", "“") > 0 ? "“" : "»";
  }
  return { from: at, to: at + 1, insert };
}

/**
 * After a link the typed `"` stays as typed, except when it closes a quote that was converted:
 * `"https://example.com"` becomes “https://example.com”, never “https://example.com".
 */
function closeAfterLink(before: string, locale: TypographyOptions["locale"]): Replacement | null {
  if (before.at(-1) !== '"') return null;
  const at = before.length - 1;
  const text = before.slice(0, at);
  let insert: string | null;
  if (locale === "en") insert = depth(text, "“", "”") > 0 ? "”" : null;
  else if (depth(text, "„", "“") > 0) insert = "“";
  else insert = depth(text, "«", "»") > 0 ? "»" : null;
  return insert ? { from: at, to: at + 1, insert } : null;
}

/** Each rule looks only at the text before the caret, which ends with the typed character. */
const RULES: Record<
  Rule,
  (before: string, locale: TypographyOptions["locale"]) => Replacement | null
> = {
  quotes: quote,
  dashes(before, locale) {
    const end = before.length;
    // Hyphens alone at the start of a block are on their way to the "---" divider.
    if (before.endsWith("--") && !/^-+$/.test(before))
      return { from: end - 2, to: end, insert: "—" };
    if (/\S - $/u.test(before))
      return { from: end - 2, to: end - 1, insert: locale === "ru" ? "—" : "–" };
    return null;
  },
  ellipsis(before) {
    return before.endsWith("...")
      ? { from: before.length - 3, to: before.length, insert: "…" }
      : null;
  },
  arrows(before) {
    const arrow = { "->": "→", "<-": "←", "=>": "⇒" }[before.slice(-2)];
    return arrow ? { from: before.length - 2, to: before.length, insert: arrow } : null;
  },
  symbols(before) {
    const match = /\((c|r|tm)\)$/i.exec(before);
    if (!match) return null;
    const insert = { c: "©", r: "®", tm: "™" }[match[1]!.toLowerCase() as "c" | "r" | "tm"];
    return { from: match.index, to: before.length, insert };
  },
  fractions(before) {
    const match = /(?:^|[\s(])(1\/2|1\/4|3\/4)\s$/.exec(before);
    if (!match) return null;
    const from = before.length - 1 - match[1]!.length;
    return {
      from,
      to: before.length - 1,
      insert: { "1/2": "½", "1/4": "¼", "3/4": "¾" }[match[1]!]!,
    };
  },
  multiplication(before) {
    const match = /(?:^|[^\p{L}\p{N}_])(\d+(?:[.,]\d+)?)[xх]\d$/u.exec(before);
    if (!match || match[1] === "0") return null;
    return { from: before.length - 2, to: before.length - 1, insert: "×" };
  },
};

const DEFAULTS: TypographyOptions = {
  locale: "en",
  quotes: true,
  dashes: true,
  ellipsis: true,
  arrows: true,
  symbols: true,
  fractions: true,
  multiplication: true,
};

function typography(options: TypographyOptions): Extension<TypographyOptions> {
  const rules = (Object.keys(RULES) as Rule[]).filter((rule) => options[rule]);
  const extension = defineExtension<TypographyOptions>({
    name: "typography",
    options,
    inputRules: [
      {
        // Any text may end with a trigger; the handler matches at the caret only.
        pattern: /[\s\S]/,
        handler(editor) {
          const context = caretText(editor);
          if (!context) return false;
          const before = context.text.slice(0, context.caret);
          if (LINK_LIKE.test(before)) {
            const closing = options.quotes ? closeAfterLink(before, options.locale) : null;
            if (!closing) return false;
            return replaceBeforeCaret(editor, context, closing.from, closing.to, closing.insert);
          }
          for (const rule of rules) {
            const found = RULES[rule](before, options.locale);
            if (found)
              return replaceBeforeCaret(editor, context, found.from, found.to, found.insert);
          }
          return false;
        },
      },
    ],
  });
  return { ...extension, configure: (next) => typography({ ...options, ...next }) };
}

/**
 * Typographic replacements while typing, at the caret only and never in code. Each is its own
 * transaction, so Undo right after it brings back the typed characters.
 */
export const Typography = typography(DEFAULTS);
