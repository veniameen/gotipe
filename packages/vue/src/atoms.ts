import type { MarkView, TextSpanView } from "@gotipe/core";
import { toSafeImageSrc } from "@gotipe/core/extensions";
import type { MathElement, TexError, TexResult } from "@gotipe/core/math";
import { type VNode, type VNodeChild, h } from "vue";

/**
 * Inline atoms, the same elements as `@gotipe/react` (GoTipe Atlas, frames 22–24): one
 * non-editable element per atom; its fallback text stays in the DOM, visually hidden, so
 * offsets and screen readers see the document text, and the drawing is a widget.
 */

/** A span, or a whole atom made of one or more spans (with the first span's marks). */
export interface TextUnit {
  text: string;
  marks: MarkView[];
  atom?: MarkView;
}

const sameAttrs = (a: MarkView["attrs"], b: MarkView["attrs"]): boolean => {
  const left = a ?? {};
  const right = b ?? {};
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((k) => left[k] === right[k]);
};

export function textUnits(spans: TextSpanView[]): TextUnit[] {
  const units: TextUnit[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const atom = span.marks.find((mark) => mark.atomic === true);
    const last = units[units.length - 1];
    if (atom && last?.atom?.type === atom.type && sameAttrs(last.atom.attrs, atom.attrs))
      last.text += span.text;
    else units.push({ text: span.text, marks: span.marks, atom });
  }
  return units;
}

/**
 * Formulas for `EditorContent`'s `math` prop: `{ parse: parseTex }` from `@gotipe/core/math`
 * draws them, `errorText` words why TeX cannot be read (default: the English message).
 * Without it a formula shows its TeX and the converter is not loaded.
 */
export interface VueMath {
  parse(tex: string, options?: { display?: boolean }): TexResult;
  errorText?(error: TexError, tex: string): string;
}

/** The page glyph of the shared set; the theme gives its size and stroke. */
const pageGlyph = () =>
  h("svg", { class: "gotipe-icon", viewBox: "0 0 16 16", "aria-hidden": "true" }, [
    h("path", {
      d: "M5 2.75h3.75l3 3v6.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1ZM8.75 2.75v2a1 1 0 0 0 1 1h2M6.25 8.75h3.5M6.25 10.75h2.5",
    }),
  ]);

const str = (value: unknown): string => (typeof value === "string" ? value : "");
// Zero-size text: Chrome loses an IME composition after an atom whose text is out of the flow.
const HIDDEN = "font-size:0;letter-spacing:0";
const widget = { "data-gotipe-widget": "", "aria-hidden": "true" };

function mathNode(node: MathElement): VNode {
  return h(
    node.tag,
    {
      ...node.attrs,
      ...(node.tag === "mi" &&
      !node.attrs?.mathvariant &&
      Array.from(String(node.children[0])).length > 1
        ? { mathvariant: "normal" }
        : {}),
    },
    node.children.map((child) => (typeof child === "string" ? child : mathNode(child))),
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}
function person(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return (hash % 3) + 1;
}

function drawing(
  atom: MarkView,
  text: string,
  math: VueMath | undefined,
): [Record<string, unknown>, VNode | null] {
  if (atom.type === "mention") {
    const label = str(atom.attrs?.label);
    const page = atom.attrs?.kind === "page";
    return [
      { class: "gotipe-mention", "data-kind": page ? "page" : "person" },
      h("span", { ...widget, class: "gotipe-mention-view" }, [
        page
          ? pageGlyph()
          : h(
              "span",
              { class: "gotipe-avatar", "data-person": person(str(atom.attrs?.id) || label) },
              initials(label),
            ),
        page ? h("span", { class: "gotipe-mention-label" }, label) : label,
      ]),
    ];
  }
  if (atom.type === "inlineMath") {
    const result = math?.parse(text);
    const tip =
      result?.ok === false && (math?.errorText?.(result.error, text) ?? result.error.message);
    return [
      {
        class: tip ? "gotipe-math-inline is-invalid" : "gotipe-math-inline",
        role: "math",
        "aria-label": text,
        "aria-invalid": tip ? "true" : undefined,
      },
      result
        ? h("span", { ...widget, class: "gotipe-math-view" }, [
            result.ok ? mathNode(result.math) : text,
            tip ? h("span", { class: "gotipe-tooltip", "data-place": "below" }, tip) : null,
          ])
        : null,
    ];
  }
  const emoji = atom.type === "customEmoji";
  const src = toSafeImageSrc(str(atom.attrs?.src));
  return [
    {
      class: emoji ? "gotipe-emoji-custom" : "gotipe-inline-image",
      role: "img",
      "aria-label": text,
    },
    h("span", widget, [
      src ? h("img", { class: emoji ? "gotipe-emoji-image" : undefined, src, alt: "" }) : text,
      emoji ? h("span", { class: "gotipe-tooltip", "data-place": "above" }, text) : null,
    ]),
  ];
}

const KNOWN = new Set(["mention", "inlineMath", "customEmoji", "inlineImage"]);

/** One atom element; unknown atomic marks and formulas without `math` show their text. */
export function atomView(atom: MarkView, text: string, math?: VueMath): VNodeChild {
  const [props, view] = KNOWN.has(atom.type)
    ? drawing(atom, text, math)
    : [{ class: "gotipe-atom" }, null];
  return h(
    "span",
    { ...props, "data-gotipe-atom": "", "data-type": atom.type, contenteditable: false },
    view ? [view, h("span", { style: HIDDEN }, text)] : [text],
  );
}
