import {
  type Decoration,
  type MarkView,
  type TextSpanView,
  toSafeColor,
  toSafeHref,
} from "@gotipe/core";
import { type VNodeChild, h } from "vue";
import { type TextUnit, type VueMath, atomView, textUnits } from "./atoms";
import { type TextWidget, textDecorations } from "./decorations";

const TAGS: Record<string, string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strikethrough: "s",
  code: "code",
  superscript: "sup",
  subscript: "sub",
  mdRaw: "span",
};

const FONT_FACES = new Set(["system", "serif", "mono"]);

export function markedText(text: VNodeChild, marks: MarkView[]): VNodeChild {
  let node: VNodeChild = text;
  for (const mark of marks) {
    const tag = TAGS[mark.type];
    if (tag) node = h(tag, mark.type === "code" ? { spellcheck: false } : {}, [node]);
    else if (mark.type === "link") {
      const href = toSafeHref(String(mark.attrs?.href ?? ""));
      node = h(
        "a",
        { href: href ?? undefined, title: mark.attrs?.title, rel: "noopener noreferrer" },
        [node],
      );
    } else if (mark.type === "highlight") {
      node = h(
        "mark",
        { style: { backgroundColor: toSafeColor(mark.attrs?.color) ?? undefined } },
        [node],
      );
    } else if (mark.type === "textColor") {
      node = h("span", { style: { color: toSafeColor(mark.attrs?.color) ?? undefined } }, [node]);
    } else if (mark.type === "fontFamily" && FONT_FACES.has(mark.attrs?.family as string)) {
      // `FontFamily`: a theme face by name (`--gt-font-*` via `data-font`), as React draws it.
      node = h("span", { class: "gotipe-font", "data-font": mark.attrs?.family }, [node]);
    } else if (mark.type === "fontSize") {
      // `FontSize`: whole px within 6–96, the values the HTML output writes.
      const size = mark.attrs?.size;
      if (typeof size === "number" && Number.isInteger(size) && size >= 6 && size <= 96)
        node = h("span", { style: { fontSize: `${size}px` } }, [node]);
    }
  }
  return node;
}

function widget(decoration: TextWidget): VNodeChild {
  const props = {
    ...(decoration.attrs ?? {}),
    key: `w:${decoration.key}`,
    class: decoration.className,
    style: decoration.style,
    "data-gotipe-widget": "",
    contenteditable: false,
  };
  const caret = decoration.caret;
  if (!caret)
    return h(
      "span",
      props,
      decoration.text ? [markedText(decoration.text, decoration.marks ?? [])] : [],
    );
  const color = caret.color ?? undefined;
  // The zero-width space gives the caret the line's height without literal sizes.
  return h("span", props, [
    h(
      "span",
      {
        class: "gotipe-remote-cursor-caret",
        style: { display: "inline-block", backgroundColor: color },
      },
      "\u200b",
    ),
    h(
      "span",
      { class: "gotipe-remote-cursor-label", style: { backgroundColor: color } },
      caret.name,
    ),
  ]);
}

/**
 * Text with the block's decorations of every layer: ranges wrap the text they cover, widgets
 * stand at their offsets and never count as text.
 */
export function decoratedText(
  spans: TextSpanView[],
  decorations: Decoration[] | undefined,
  math?: VueMath,
): VNodeChild[] {
  const { inline, widgets } = textDecorations(decorations);
  // An atom is drawn whole: a point inside it moves to its end.
  const units = textUnits(spans);
  const draw = (unit: TextUnit, text: string) =>
    markedText(unit.atom ? atomView(unit.atom, unit.text, math) : text, unit.marks);
  if (!inline.length && !widgets.length) return units.map((unit) => draw(unit, unit.text));
  const total = units.reduce((sum, unit) => sum + unit.text.length, 0);
  const starts: number[] = [];
  const atoms: { from: number; to: number }[] = [];
  let position = 0;
  for (const unit of units) {
    starts.push(position);
    if (unit.atom) atoms.push({ from: position, to: position + unit.text.length });
    position += unit.text.length;
  }
  const clamp = (value: number) => {
    const at = Math.max(0, Math.min(value, total));
    return atoms.find((a) => a.from < at && at < a.to)?.to ?? at;
  };
  const points = new Set<number>([0, total, ...starts]);
  const ranges = inline
    .map((d) => ({ d, from: clamp(d.from), to: clamp(d.to) }))
    .filter((range) => range.to > range.from);
  for (const range of ranges) points.add(range.from).add(range.to);
  const widgetsAt = new Map<number, TextWidget[]>();
  for (const w of widgets) {
    const at = clamp(w.offset);
    points.add(at);
    widgetsAt.set(at, [...(widgetsAt.get(at) ?? []), w]);
  }
  for (const list of widgetsAt.values())
    list.sort((a, b) => (a.side ?? 1) - (b.side ?? 1) || a.key.localeCompare(b.key));
  const sorted = [...points].sort((a, b) => a - b);
  const out: VNodeChild[] = [];
  for (let index = 0; index < sorted.length; index++) {
    const from = sorted[index]!;
    for (const w of widgetsAt.get(from) ?? []) out.push(widget(w));
    const to = sorted[index + 1];
    if (to === undefined || to <= from) continue;
    const spanIndex = units.findIndex(
      (unit, at) => from >= starts[at]! && from < starts[at]! + unit.text.length,
    );
    const span = units[spanIndex];
    if (!span) continue;
    const start = starts[spanIndex]!;
    let node = draw(span, span.text.slice(from - start, to - start));
    const active = ranges
      .filter((range) => range.from <= from && range.to >= to)
      .sort((a, b) => a.d.key.localeCompare(b.d.key));
    for (const { d } of active)
      node = h(
        "span",
        {
          ...(d.attrs ?? {}),
          key: `d:${d.key}:${from}`,
          class: d.className,
          style: d.style,
          "data-gotipe-decoration": "",
        },
        [node],
      );
    out.push(node);
  }
  return out;
}
