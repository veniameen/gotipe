const ASCII_PUNCT_RE = /[!-/:-@[-`{-~]/;
const UNICODE_WS_RE = /[\t\n\f\r    -   　]/;
const UNICODE_PUNCT_RE = /[\p{P}\p{S}]/u;

export function isAsciiPunct(c: string | undefined): boolean {
  return c !== undefined && c.length === 1 && ASCII_PUNCT_RE.test(c);
}

/** CommonMark "Unicode whitespace" (or start/end of input when `c` is null/undefined). */
export function isWs(c: string | null | undefined): boolean {
  return c === null || c === undefined || c === "" || UNICODE_WS_RE.test(c);
}

export function isPunct(c: string | null | undefined): boolean {
  return c !== null && c !== undefined && c !== "" && UNICODE_PUNCT_RE.test(c);
}

/** 1 = whitespace (incl. start/end), 2 = punctuation, 0 = other ("alphanumeric"). */
export function classify(c: string | null | undefined): 0 | 1 | 2 {
  if (isWs(c)) return 1;
  if (isPunct(c)) return 2;
  return 0;
}

export function detectEol(text: string): string {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 10) return "\n";
    if (c === 13) return text.charCodeAt(i + 1) === 10 ? "\r\n" : "\r";
  }
  return "\n";
}

export function normalizeEol(s: string): string {
  return s.indexOf("\r") === -1 ? s : s.replace(/\r\n?/g, "\n");
}

/** Number of line endings in `s`. */
export function countLineEndings(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 10) n++;
    else if (c === 13) {
      n++;
      if (s.charCodeAt(i + 1) === 10) i++;
    }
  }
  return n;
}

/** Deterministic JSON: object keys sorted, `undefined` dropped. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (value === undefined) return "null";
    if (typeof value === "number" && !Number.isFinite(value)) return "null";
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : stableStringify(v))).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

const HEX: string[] = [];
for (let i = 0; i < 256; i++) HEX.push((i + 0x100).toString(16).slice(1));

/** RFC 9562 UUID v7. Uses `crypto.getRandomValues` when available. */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  let ts = Date.now();
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  let out = "";
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += "-";
    out += HEX[bytes[i]!];
  }
  return out;
}

/** Returns the end offset of a front matter block starting at `from`, or `from` if there is none. */
export function detectFrontMatter(text: string, from: number): number {
  const open = /^---[ \t]*(\r\n|\n|\r)/.exec(text.slice(from, from + 80));
  if (!open) return from;
  let pos = from + open[0].length;
  while (pos <= text.length) {
    let lineEnd = pos;
    while (lineEnd < text.length) {
      const c = text.charCodeAt(lineEnd);
      if (c === 10 || c === 13) break;
      lineEnd++;
    }
    const line = text.slice(pos, lineEnd);
    let next = lineEnd;
    if (text.charCodeAt(next) === 13) next++;
    if (text.charCodeAt(next) === 10 && (next === lineEnd || text.charCodeAt(lineEnd) === 13))
      next++;
    if (/^(---|\.\.\.)[ \t]*$/.test(line)) return next;
    if (next === lineEnd) return from; // end of text without closing fence
    pos = next;
  }
  return from;
}
