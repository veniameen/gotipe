import type { MarkView, TextSpanView } from "@gotipe/core";
import { toSafeImageSrc } from "@gotipe/core/extensions";
import type { MathElement, TexError } from "@gotipe/core/math";
import type { I18n, TranslationKey } from "@gotipe/i18n";
import React from "react";
import { useGoTipeI18n } from "../i18n-context";
import { ContentIcon } from "./icons";
import { type MathRenderer, useMathRenderer } from "./math-renderer";

/**
 * Inline atoms (GoTipe Atlas, frames 22–24): text whose mark is `atomic` is one non-editable
 * element. The atom's fallback text stays in the DOM, visually hidden, so offsets, selection,
 * search and screen readers see the document text; the drawing beside it is a widget.
 */

/** A span of a block, or a whole atom made of one or more spans. */
export interface TextUnit {
  text: string;
  /** The first span's marks: the formatting around an atom. */
  marks: MarkView[];
  atom?: MarkView;
}

const sameAttrs = (a: MarkView["attrs"], b: MarkView["attrs"]): boolean => {
  const left = a ?? {};
  const right = b ?? {};
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((k) => left[k] === right[k]);
};
const atomicOf = (span: TextSpanView): MarkView | undefined =>
  span.marks.find((mark) => mark.atomic === true);

/** Joins the spans of each atom (the run of spans with the same atomic mark) into one unit. */
export function textUnits(spans: TextSpanView[]): TextUnit[] {
  const units: TextUnit[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const atom = atomicOf(span);
    const last = units[units.length - 1];
    if (atom && last?.atom?.type === atom.type && sameAttrs(last.atom.attrs, atom.attrs))
      last.text += span.text;
    else units.push({ text: span.text, marks: span.marks, atom });
  }
  return units;
}

// Zero-size text, not an absolutely positioned one: Chrome loses an IME composition typed
// right after an atom whose text is taken out of the flow.
const HIDDEN: React.CSSProperties = { fontSize: 0, letterSpacing: 0 };

const str = (value: unknown): string => (typeof value === "string" ? value : "");

/** Initials of a name: the first letters of its first two words. */
export function initialsOf(name: string): string {
  const words = name.replace(/^@/, "").trim().split(/\s+/u).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}

/** One of the theme's person colours, stable for an id. */
export function personOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return (hash % 3) + 1;
}

/** A name such as `sin` stands upright; the theme sets single letters in italic itself. */
export const uprightName = (node: MathElement): boolean =>
  node.tag === "mi" &&
  !node.attrs?.mathvariant &&
  typeof node.children[0] === "string" &&
  Array.from(node.children[0]).length > 1;

/** MathML elements of a converted formula; the tree holds only allowed tags and attributes. */
export function renderMath(node: MathElement, key?: React.Key): React.ReactElement {
  return React.createElement(
    node.tag,
    { key, ...node.attrs, ...(uprightName(node) ? { mathvariant: "normal" } : {}) },
    ...node.children.map((child, i) => (typeof child === "string" ? child : renderMath(child, i))),
  );
}

const widget = { "data-gotipe-widget": "", "aria-hidden": true } as const;
const NAMED = new Set(["unclosedGroup", "unexpectedClose", "unknownCommand", "missingArgument"]);

/** Why TeX cannot be read, in the interface language; rarer errors name the place. */
export function mathErrorText(i18n: I18n, error: TexError, tex: string): string {
  return NAMED.has(error.code)
    ? i18n.t(`math.error.${error.code}` as TranslationKey, { detail: error.detail ?? "" })
    : i18n.t("math.error", { detail: tex.slice(error.from, error.to).slice(0, 12) });
}

/** The drawing of an atom and the attributes of its element. */
function drawing(
  atom: MarkView,
  text: string,
  i18n: I18n,
  parse: MathRenderer | null,
): [Record<string, unknown>, React.ReactNode] {
  const attrs = atom.attrs ?? {};
  if (atom.type === "mention") {
    const label = str(attrs.label);
    const page = attrs.kind === "page";
    return [
      {
        className: "gotipe-mention",
        "data-id": str(attrs.id),
        "data-kind": page ? "page" : "person",
      },
      <span key="view" className="gotipe-mention-view" {...widget}>
        {page ? (
          <ContentIcon name="page" />
        ) : (
          <span className="gotipe-avatar" data-person={personOf(str(attrs.id) || label)}>
            {initialsOf(label)}
          </span>
        )}
        {page ? <span className="gotipe-mention-label">{label}</span> : label}
      </span>,
    ];
  }
  if (atom.type === "inlineMath") {
    // Without a TeX reader the formula is its TeX (`MathRendererContext`).
    if (!parse)
      return [{ className: "gotipe-math-inline", role: "math", "aria-label": text }, null];
    const result = parse(text);
    return [
      {
        className: result.ok ? "gotipe-math-inline" : "gotipe-math-inline is-invalid",
        role: "math",
        "aria-label": text,
        "aria-invalid": result.ok ? undefined : true,
      },
      <span key="view" className="gotipe-math-view" {...widget}>
        {result.ok ? renderMath(result.math) : text}
        {!result.ok && (
          <span className="gotipe-tooltip" data-place="below">
            {mathErrorText(i18n, result.error, text)}
          </span>
        )}
      </span>,
    ];
  }
  const emoji = atom.type === "customEmoji";
  const src = toSafeImageSrc(str(attrs.src));
  const size = (value: unknown) => (typeof value === "number" ? value : undefined);
  return [
    {
      className: emoji ? "gotipe-emoji-custom" : "gotipe-inline-image",
      role: "img",
      "aria-label": text,
    },
    <span key="view" {...widget}>
      {src ? (
        <img
          className={emoji ? "gotipe-emoji-image" : undefined}
          src={src}
          alt=""
          width={size(attrs.width)}
          height={size(attrs.height)}
          draggable={false}
        />
      ) : (
        text
      )}
      {emoji && (
        <span className="gotipe-tooltip" data-place="above">
          {text}
        </span>
      )}
    </span>,
  ];
}

const KNOWN = new Set(["mention", "inlineMath", "customEmoji", "inlineImage"]);

/**
 * One atom: a non-editable element (`data-gotipe-atom`, `data-type`) whose accessible name is
 * its fallback text. Unknown atomic marks show the text itself.
 */
export function AtomView({ atom, text }: { atom: MarkView; text: string }) {
  const i18n = useGoTipeI18n();
  const parse = useMathRenderer();
  const [attrs, view] = KNOWN.has(atom.type)
    ? drawing(atom, text, i18n, parse)
    : [{ className: "gotipe-atom" }, null];
  const known = view !== null;
  return (
    <span
      {...attrs}
      data-gotipe-atom=""
      data-type={atom.type}
      contentEditable={false}
      suppressContentEditableWarning
    >
      {view}
      <span style={known ? HIDDEN : undefined}>{text}</span>
    </span>
  );
}
