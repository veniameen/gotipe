/** How a link written as `www.example.com` is opened. */
export type DefaultProtocol = "https" | "http";

const START = /^(?:https?:\/\/|www\.|mailto:)/i;
const LEADING = /^[("'«“‘<[{]+/u;
const TRAILING = /[.,;:!?'"’”»>]$/u;

/**
 * The address a link written as `candidate` opens, or `null` when it is not a whole web or mail
 * address: `http(s)://host…` with a dotted host or `localhost`, `www.host.tld…` (opened with
 * `protocol`) and `mailto:name@host.tld`. Only these schemes pass, the ones `toSafeHref`
 * allows, so a result is always unchanged by it (the tests check this).
 */
export function linkHref(candidate: string, protocol: DefaultProtocol = "https"): string | null {
  if (!START.test(candidate) || /\s/.test(candidate)) return null;
  if (/^mailto:/i.test(candidate))
    return /^mailto:[^\s@/?]+@[^\s@.]+(?:\.[^\s@.]+)+(?:\?\S*)?$/i.test(candidate)
      ? candidate
      : null;
  const href = /^www\./i.test(candidate) ? `${protocol}://${candidate}` : candidate;
  let host: string;
  try {
    host = new URL(href).hostname;
  } catch {
    return null;
  }
  const dotted = /^[^.]+(?:\.[^.]+)+$/.test(host);
  if (!dotted && host !== "localhost" && !host.startsWith("[")) return null;
  return href;
}

/** Drops punctuation that closes a sentence or a bracket the address did not open. */
function trimAddress(text: string): { start: number; end: number } {
  const leading = LEADING.exec(text)?.[0].length ?? 0;
  let end = text.length;
  for (;;) {
    const last = text[end - 1];
    if (!last || end <= leading) break;
    const body = text.slice(leading, end);
    const unbalanced = (open: string, close: string) =>
      last === close && body.split(close).length > body.split(open).length;
    if (TRAILING.test(last) || unbalanced("(", ")") || unbalanced("[", "]")) end--;
    else break;
  }
  return { start: leading, end };
}

/** The web or mail address that ends at `end` in `text`, if the word there is one. */
export function addressBefore(
  text: string,
  end: number,
  protocol: DefaultProtocol,
): { from: number; to: number; href: string } | null {
  let start = end;
  while (start > 0 && !/\s/.test(text[start - 1]!)) start--;
  const word = text.slice(start, end);
  const { start: skip, end: keep } = trimAddress(word);
  const candidate = word.slice(skip, keep);
  const href = candidate ? linkHref(candidate, protocol) : null;
  return href ? { from: start + skip, to: start + keep, href } : null;
}
