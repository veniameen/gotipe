import type {
  Decoration,
  InlineDecoration,
  MarkView,
  TextSpanView,
  WidgetDecoration,
} from "@gotipe/core";
import { documentColorStyle, toSafeHref } from "@gotipe/core";
import React from "react";

export interface TextRendererProps {
  spans: TextSpanView[];
  /** Decorations of the block: `inline` ranges and `widget`s are rendered. */
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

/** Splits `decorations` of a block into inline ranges and widgets. */
export function splitTextDecorations(decorations: Decoration[] | undefined): {
  inline: InlineDecoration[];
  widgets: WidgetDecoration[];
} {
  const inline: InlineDecoration[] = [];
  const widgets: WidgetDecoration[] = [];
  if (!decorations) return { inline, widgets };
  for (const d of decorations) {
    if (d.type === "inline") inline.push(d);
    else if (d.type === "widget") widgets.push(d);
  }
  return { inline, widgets };
}

export function TextRenderer({ spans, decorations }: TextRendererProps) {
  const { inline, widgets } = splitTextDecorations(decorations);

  // Fast path: no decorations — one node per span, as before.
  if (inline.length === 0 && widgets.length === 0) {
    return (
      <>
        {spans.map((span, i) => (
          <React.Fragment key={i}>{renderMarks(span.text, span.marks, String(i))}</React.Fragment>
        ))}
      </>
    );
  }

  const total = spans.reduce((n, s) => n + s.text.length, 0);
  const points = new Set<number>([0, total]);
  let pos = 0;
  for (const span of spans) {
    points.add(pos);
    pos += span.text.length;
    points.add(pos);
  }
  const ranges = inline
    .map((d) => ({
      d,
      from: Math.max(0, Math.min(d.from, total)),
      to: Math.max(0, Math.min(d.to, total)),
    }))
    .filter((r) => r.to > r.from);
  for (const r of ranges) {
    points.add(r.from);
    points.add(r.to);
  }
  const widgetsAt = new Map<number, WidgetDecoration[]>();
  for (const w of widgets) {
    const at = Math.max(0, Math.min(w.offset, total));
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
  const spanAt = (offset: number): TextSpanView | null => {
    let p = 0;
    for (const span of spans) {
      if (offset >= p && offset < p + span.text.length) return span;
      p += span.text.length;
    }
    return null;
  };
  const spanStart = (span: TextSpanView): number => {
    let p = 0;
    for (const s of spans) {
      if (s === span) return p;
      p += s.text.length;
    }
    return 0;
  };

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    const here = widgetsAt.get(a);
    if (here) {
      for (const w of here) out.push(<Widget key={`w:${w.key}`} decoration={w} />);
    }
    const b = sorted[i + 1];
    if (b === undefined || b <= a) continue;
    const span = spanAt(a);
    if (!span) continue;
    const start = spanStart(span);
    const text = span.text.slice(a - start, b - start);
    let node = renderMarks(text, span.marks, `s${a}`);
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
