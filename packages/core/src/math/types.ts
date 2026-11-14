// MathML tree, error contract and the allowed tag/attribute sets of `@gotipe/core/math`.

export type MathTag =
  | "math"
  | "mrow"
  | "mi"
  | "mn"
  | "mo"
  | "mtext"
  | "mspace"
  | "mfrac"
  | "msup"
  | "msub"
  | "msubsup"
  | "msqrt"
  | "mroot"
  | "mover"
  | "munder"
  | "munderover";

export type MathAttr =
  | "display"
  | "mathvariant"
  | "stretchy"
  | "accent"
  | "fence"
  | "separator"
  | "largeop"
  | "movablelimits"
  | "lspace"
  | "rspace"
  | "width"
  | "form";

export interface MathElement {
  tag: MathTag;
  attrs?: Partial<Record<MathAttr, string>>;
  children: MathNode[];
}

/** A string appears only as the text of `mi`, `mn`, `mo` and `mtext`. */
export type MathNode = MathElement | string;

export type TexErrorCode =
  | "unclosedGroup"
  | "unexpectedClose"
  | "unknownCommand"
  | "missingArgument"
  | "unmatchedLeft"
  | "unmatchedRight"
  | "badDelimiter"
  | "doubleScript"
  | "tooLong"
  | "tooDeep";

/** `from`/`to` are UTF-16 offsets in the source; `detail` names the offending token. */
export interface TexError {
  code: TexErrorCode;
  detail?: string;
  from: number;
  to: number;
  message: string;
}

export type TexResult = { ok: true; math: MathElement } | { ok: false; error: TexError };

export const MATH_NAMESPACE = "http://www.w3.org/1998/Math/MathML";

export const MATH_TAGS: ReadonlySet<string> = new Set<MathTag>([
  "math",
  "mrow",
  "mi",
  "mn",
  "mo",
  "mtext",
  "mspace",
  "mfrac",
  "msup",
  "msub",
  "msubsup",
  "msqrt",
  "mroot",
  "mover",
  "munder",
  "munderover",
]);

export const MATH_ATTRS: ReadonlySet<string> = new Set<MathAttr>([
  "display",
  "mathvariant",
  "stretchy",
  "accent",
  "fence",
  "separator",
  "largeop",
  "movablelimits",
  "lspace",
  "rspace",
  "width",
  "form",
]);

const MESSAGES: Record<TexErrorCode, (detail: string) => string> = {
  unclosedGroup: (d) => `Missing closing "${d}"`,
  unexpectedClose: (d) => `Unexpected "${d}"`,
  unknownCommand: (d) => `Unknown command ${d}`,
  missingArgument: (d) => `Missing argument for ${d}`,
  unmatchedLeft: () => "\\left without matching \\right",
  unmatchedRight: (d) => `${d} without matching \\left`,
  badDelimiter: (d) => `Invalid delimiter "${d}"`,
  doubleScript: (d) => (d === "_" ? "Double subscript" : "Double superscript"),
  tooLong: (d) => `Formula is longer than ${d} characters`,
  tooDeep: (d) => `Formula is nested deeper than ${d} levels`,
};

/** Internal carrier of a parse error; `parseTex` turns it into a result. */
export class TexFailure extends Error {
  constructor(readonly error: TexError) {
    super(error.message);
  }
}

export function fail(code: TexErrorCode, from: number, to: number, detail: string): never {
  throw new TexFailure({ code, detail, from, to, message: MESSAGES[code](detail) });
}
