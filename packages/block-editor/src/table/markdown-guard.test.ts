import type { BlockView, GoTipeEditor } from "@gotipe/core";
import type { TableLayout } from "@gotipe/react";
import { describe, expect, it } from "vitest";
import { markdownTableGuard } from "./markdown-guard";

const view = (id: string, type: string, extra: Partial<BlockView> = {}): BlockView =>
  ({ id, type, attrs: {}, content: null, children: [], ...extra }) as BlockView;
const cell = (marks: { type: string; attrs: Record<string, unknown> }[]) =>
  view("c", "tableCell", { content: [{ text: "x", marks }] } as Partial<BlockView>);
const layout = (table: BlockView, topLevel = true) =>
  ({
    table,
    editor: {
      getViewState: () => ({ blocks: topLevel ? [table] : [] }),
    } as unknown as GoTipeEditor,
  }) as TableLayout;

describe("Markdown merge guard", () => {
  const guard = markdownTableGuard("why");
  const table = (marks: Parameters<typeof cell>[0]) =>
    view("t", "table", { children: [view("r", "tableRow", { children: [cell(marks)] })] });
  it("allows a top-level table whose marks the HTML table keeps", () => {
    expect(guard(layout(table([{ type: "bold", attrs: {} }])))).toBeNull();
    expect(guard(layout(table([{ type: "link", attrs: { href: "https://a.b" } }])))).toBeNull();
  });
  it("refuses mentions, formulas, fonts, link titles and nested tables, with the reason", () => {
    for (const type of ["mention", "inlineMath", "customEmoji", "fontFamily", "fontSize"])
      expect(guard(layout(table([{ type, attrs: {} }])))).toBe("why");
    expect(guard(layout(table([{ type: "link", attrs: { href: "/a", title: "t" } }])))).toBe("why");
    expect(guard(layout(table([]), false))).toBe("why");
  });
});
