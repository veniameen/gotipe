import namedReferences from "./entities.json";

// WHATWG named character reference data; only semicolon-terminated references are Markdown.
const named: Record<string, string> = namedReferences;
const replacement: Record<number, number> = {
  128: 0x20ac,
  130: 0x201a,
  131: 0x0192,
  132: 0x201e,
  133: 0x2026,
  134: 0x2020,
  135: 0x2021,
  136: 0x02c6,
  137: 0x2030,
  138: 0x0160,
  139: 0x2039,
  140: 0x0152,
  142: 0x017d,
  145: 0x2018,
  146: 0x2019,
  147: 0x201c,
  148: 0x201d,
  149: 0x2022,
  150: 0x2013,
  151: 0x2014,
  152: 0x02dc,
  153: 0x2122,
  154: 0x0161,
  155: 0x203a,
  156: 0x0153,
  158: 0x017e,
  159: 0x0178,
};

export function decodeReference(reference: string): string {
  const body = reference.slice(1, -1);
  if (!body.startsWith("#")) return named[body] ?? reference;
  let value =
    body[1]?.toLowerCase() === "x"
      ? Number.parseInt(body.slice(2), 16)
      : Number.parseInt(body.slice(1), 10);
  if (value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) value = 0xfffd;
  return String.fromCodePoint(replacement[value] ?? value);
}

export const REFERENCE = /&(?:#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/y;
export const punctuation = (c: string | undefined): boolean =>
  !!c && /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(c);

export function decodeString(text: string): string {
  return text.replace(
    /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])|&(?:#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g,
    (match, escaped: string | undefined) => escaped ?? decodeReference(match),
  );
}

export const referenceLabel = (text: string): string =>
  text.trim().replace(/\s+/g, " ").toLowerCase().toUpperCase();
