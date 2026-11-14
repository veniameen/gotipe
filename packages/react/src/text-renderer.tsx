import type {
  Decoration,
  InlineDecoration,
  MarkView,
  TextSpanView,
  WidgetDecoration,
} from "@gotipe/core";
import { documentColorStyle, toSafeHref } from "@gotipe/core";
import React from "react";
import { AtomView, type TextUnit, textUnits } from "./content/atoms";
import { type TextWidget, textDecorations } from "./content/decorations";

const FONT_FACES = new Set(["system", "serif", "mono"]);

export interface TextRendererProps {
  spans: TextSpanView[];
  /**
   * Decorations of the block. Ranges and widgets of every layer are drawn: `inline`,
   * `widget`, comments, proposals, other people's selections and carets, ghost text.
   */
  decorations?: Decoration[];
}

function renderMarks(text: React.ReactNode, marks: MarkView[], key: string): React.ReactNode {
  let element: React.ReactNode = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        element = <strong key={`${key}-bold`}>{element}</strong>;
        break;
      case "italic":
        element = <em key={`${key}-italic`}>{element}</em>;
        break;
      case "underline":
        element = <u key={`${key}-underline`}>{element}</u>;
        break;
      case "strikethrough":
        element = <s key={`${key}-strike`}>{element}</s>;
        break;
      case "code":
        element = (
          <code key={`${key}-code`} spellCheck={false}>
            {element}
          </code>
        );
        break;
      case "link":
        element = (
          <a
            key={`${key}-link`}
            href={
              typeof mark.attrs?.href === "string"
                ? (toSafeHref(mark.attrs.href) ?? undefined)
                : undefined
            }
            title={typeof mark.attrs?.title === "string" ? mark.attrs.title : undefined}
            rel="noopener noreferrer"
          >
            {element}
          </a>
        );
        break;
      case "highlight": {
        const color = documentColorStyle(mark.attrs?.color);
        element = (
          <mark key={`${key}-highlight`} style={color ? { backgroundColor: color } : undefined}>
            {element}
          </mark>
        );
        break;
      }
      case "superscript":
        element = <sup key={`${key}-sup`}>{element}</sup>;
        break;
      case "subscript":
        element = <sub key={`${key}-sub`}>{element}</sub>;
        break;
      case "textColor":
        element = (
          <span
            key={`${key}-textColor`}
            style={{ color: documentColorStyle(mark.attrs?.color) ?? undefined }}
          >
            {element}
          </span>
        );
        break;
      // `FontFamily` / `FontSize`: a family names a theme face (`--gt-font-*` via `data-font`), a
      // size is a whole number of px within 6–96 — the HTML output writes the same values.
      case "fontFamily":
        if (FONT_FACES.has(mark.attrs?.family as string))
          element = (
            <span key={`${key}-font`} className="gotipe-font" data-font={mark.attrs?.family}>
              {element}
            </span>
          );
        break;
      case "fontSize": {
        const size = mark.attrs?.size;
        if (typeof size === "number" && Number.isInteger(size) && size >= 6 && size <= 96)
          element = (
            <span key={`${key}-size`} style={{ fontSize: `${size}px` }}>
              {element}
            </span>
          );
        break;
      }
      case "mdRaw":
        element = (
          <span key={`${key}-raw`} className="gotipe-md-raw" data-gotipe-md-raw="">
            {element}
          </span>
        );
        break;
    }
  }
  return element;
}

function decorationProps(d: {
  className?: string;
  attrs?: Record<string, string>;
  style?: Record<string, string>;
}) {
  return {
    ...(d.attrs ?? {}),
    className: d.className,
    style: d.style as React.CSSProperties | undefined,
  };
}

export function Widget({ decoration }: { decoration: WidgetDecoration }) {
  return (
    <span
      {...decorationProps(decoration)}
      data-gotipe-widget=""
      contentEditable={false}
      suppressContentEditableWarning
    >
      {decoration.text
        ? renderMarks(decoration.text, decoration.marks ?? [], decoration.key)
        : null}
    </span>
  );
}

/** Another person's caret: a line in their color with their name above it. */
function RemoteCaret({ decoration }: { decoration: TextWidget }) {
  const color = decoration.caret?.color ?? undefined;
  return (
    <span
      {...decorationProps(decoration)}
      data-gotipe-widget=""
      contentEditable={false}
      suppressContentEditableWarning
    >
      {/* The zero-width space gives the caret the line's height without literal sizes. */}
      <span
        className="gotipe-remote-cursor-caret"
        style={{ display: "inline-block", backgroundColor: color }}
      >
        {"\u200b"}
      </span>
      <span className="gotipe-remote-cursor-label" style={{ backgroundColor: color }}>
        {decoration.caret?.name}
      </span>
    </span>
  );
}

/** Splits `decorations` of a block into inline ranges and widgets, from every layer. */
export function splitTextDecorations(decorations: Decoration[] | undefined): {
  inline: InlineDecoration[];
  widgets: WidgetDecoration[];
} {
  return textDecorations(decorations);
}

export function TextRenderer({ spans, decorations }: TextRendererProps) {
  const { inline, widgets } = textDecorations(decorations);
  // An atom (a run of spans with one atomic mark) is drawn whole, never split.
  const units = textUnits(spans);
  const draw = (unit: TextUnit, text: string, key: string) =>
    renderMarks(unit.atom ? <AtomView atom={unit.atom} text={unit.text} /> : text, unit.marks, key);

  // Fast path: no decorations — one node per span or atom.
  if (inline.length === 0 && widgets.length === 0) {
    return (
      <>
        {units.map((unit, i) => (
          <React.Fragment key={i}>{draw(unit, unit.text, String(i))}</React.Fragment>
        ))}
      </>
    );
  }

  const total = units.reduce((n, s) => n + s.text.length, 0);
  const points = new Set<number>([0, total]);
  const atoms: { from: number; to: number }[] = [];
  let pos = 0;
  for (const unit of units) {
    points.add(pos);
    if (unit.atom) atoms.push({ from: pos, to: pos + unit.text.length });
    pos += unit.text.length;
    points.add(pos);
  }
  // A point inside an atom moves to its end: decorations and widgets go around it.
  const edge = (at: number) => atoms.find((a) => a.from < at && at < a.to)?.to ?? at;
  const ranges = inline
    .map((d) => ({
      d,
      from: edge(Math.max(0, Math.min(d.from, total))),
      to: edge(Math.max(0, Math.min(d.to, total))),
    }))
    .filter((r) => r.to > r.from);
  for (const r of ranges) {
    points.add(r.from);
    points.add(r.to);
  }
  const widgetsAt = new Map<number, TextWidget[]>();
  for (const w of widgets) {
    const at = edge(Math.max(0, Math.min(w.offset, total)));
    points.add(at);
    const list = widgetsAt.get(at);
    if (list) list.push(w);
    else widgetsAt.set(at, [w]);
  }
  for (const list of widgetsAt.values()) {
    list.sort((a, b) => (a.side ?? 1) - (b.side ?? 1) || a.key.localeCompare(b.key));
  }
  const sorted = [...points].sort((a, b) => a - b);

  const out: React.ReactNode[] = [];
  const spanAt = (offset: number): TextUnit | null => {
    let p = 0;
    for (const unit of units) {
      if (offset >= p && offset < p + unit.text.length) return unit;
      p += unit.text.length;
    }
    return null;
  };
  const spanStart = (span: TextUnit): number => {
    let p = 0;
    for (const s of units) {
      if (s === span) return p;
      p += s.text.length;
    }
    return 0;
  };

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    const here = widgetsAt.get(a);
    if (here) {
      for (const w of here)
        out.push(
          w.caret ? (
            <RemoteCaret key={`w:${w.key}`} decoration={w} />
          ) : (
            <Widget key={`w:${w.key}`} decoration={w} />
          ),
        );
    }
    const b = sorted[i + 1];
    if (b === undefined || b <= a) continue;
    const span = spanAt(a);
    if (!span) continue;
    const start = spanStart(span);
    const text = span.text.slice(a - start, b - start);
    let node = draw(span, text, `s${a}`);
    const active = ranges
      .filter((r) => r.from <= a && r.to >= b)
      .sort((x, y) => x.d.key.localeCompare(y.d.key));
    for (const r of active) {
      node = (
        <span key={`d:${r.d.key}:${a}`} {...decorationProps(r.d)} data-gotipe-decoration="">
          {node}
        </span>
      );
    }
    out.push(<React.Fragment key={`t:${a}`}>{node}</React.Fragment>);
  }
  return <>{out}</>;
}
