import type { BlockView, Decoration } from "@gotipe/core";
import { parseMarkdown, serializeMarkdown } from "@gotipe/markdown";
import { describe, expect, it } from "vitest";
import { applyAnchoredEdits } from "./anchors";
import {
  computeReviewDecorations,
  mapOffsetToText,
  proposalsInDocumentOrder,
  revealDecorations,
} from "./review-decorations";
import type { ReviewLane, ReviewProposal } from "./review-types";

const PAGE = `# Выкат

- [x] Снять дамп
- [ ] Индекс по status_id

| code | Задач |
| :--- | ---: |
| \`open\` |  |
| \`done\` |  |

Цифры — только из базы.
`;

const LANES: ReviewLane[] = [
  { id: "agent", name: "Agent", kind: "agent", color: "var(--gt-track-1)" },
  { id: "psql", name: "psql", kind: "tool", color: "var(--gt-track-3)" },
];

type Doc = { blocks: BlockView[] };

function toView(blocks: unknown[]): BlockView[] {
  return (blocks as BlockView[]).map((b) => ({
    ...b,
    decorations: [],
    children: toView(b.children),
  }));
}

function setup(text: string) {
  const parsed = parseMarkdown(text);
  const blocks = toView(parsed.doc.blocks as unknown[]);
  const out = serializeMarkdown(parsed.doc, parsed.snapshot);
  expect(out.text).toBe(text);
  return { blocks, text: out.text, map: out.map, doc: parsed.doc as unknown as Doc };
}

const parse = (fragment: string) => toView(parseMarkdown(fragment).doc.blocks as unknown[]);

function run(
  text: string,
  proposals: ReviewProposal[],
  extra: Partial<Parameters<typeof computeReviewDecorations>[0]> = {},
) {
  const s = setup(text);
  return { ...s, ...computeReviewDecorations({ ...s, parse, proposals, lanes: LANES, ...extra }) };
}

const byType = (ds: Decoration[], type: Decoration["type"]) => ds.filter((d) => d.type === type);

describe("computeReviewDecorations", () => {
  it("shows new list items as phantom rows after the anchored item", () => {
    const r = run(PAGE, [
      {
        id: "p1",
        laneId: "agent",
        edits: [
          {
            before: "- [ ] Индекс по status_id",
            quote: "",
            after: "\n\n|",
            text: "\n- [ ] Переключить listTasks",
          },
        ],
      },
    ]);
    expect(r.proposals[0]).toMatchObject({ status: "pending", exact: false });
    const blocks = byType(r.decorations, "blocks");
    expect(blocks).toHaveLength(1);
    const d = blocks[0] as Extract<Decoration, { type: "blocks" }>;
    const list = r.blocks[1]!;
    expect(d.blockId).toBe(list.children[1]!.id);
    expect(d.position).toBe("after");
    expect(d.blocks[0]).toMatchObject({ type: "todoItem", attrs: { checked: false } });
    expect(d.style?.["--gt-track"]).toBe("var(--gt-track-1)");
    expect(r.proposals[0]!.insertedChars).toBe("Переключить listTasks".length);
  });

  it("fills empty table cells inline", () => {
    const r = run(PAGE, [
      {
        id: "p2",
        laneId: "psql",
        edits: [
          { before: "| `open` | ", quote: "", after: " |\n| `done`", text: "1 204" },
          { before: "| `done` | ", quote: "", after: " |\n", text: "9 871" },
        ],
      },
    ]);
    const widgets = byType(r.decorations, "widget") as Extract<Decoration, { type: "widget" }>[];
    expect(widgets.map((w) => w.text)).toEqual(["1 204", "9 871"]);
    const table = r.blocks[2]!;
    expect(widgets[0]!.blockId).toBe(table.children[1]!.children[1]!.id);
    expect(widgets[1]!.blockId).toBe(table.children[2]!.children[1]!.id);
    expect(r.proposals[0]!.exact).toBe(true);
  });

  it("strikes replaced text and inserts the new words in place", () => {
    const r = run(PAGE, [
      {
        id: "p3",
        laneId: "agent",
        edits: [{ before: "Цифры — ", quote: "только", after: " из", text: "лишь" }],
      },
    ]);
    const del = byType(r.decorations, "inline")[0] as Extract<Decoration, { type: "inline" }>;
    const ins = byType(r.decorations, "widget")[0] as Extract<Decoration, { type: "widget" }>;
    const para = r.blocks[3]!;
    expect(del).toMatchObject({
      blockId: para.id,
      from: 8,
      to: 14,
      className: "gotipe-sug gotipe-sug-del",
    });
    expect(ins).toMatchObject({ blockId: para.id, offset: 14, text: "лишь" });
  });

  it("marks a proposal stale when its anchor is gone or ambiguous, and keeps a hint in place", () => {
    const edited = PAGE.replace("Индекс по status_id", "Индекс по status_id CONCURRENTLY");
    const r = run(edited, [
      {
        id: "p4",
        laneId: "agent",
        edits: [
          { before: "- [ ] Индекс по status_id", quote: "", after: "\n\n|", text: "\n- [ ] Ещё" },
        ],
      },
      { id: "p5", laneId: "agent", edits: [{ before: "", quote: "- [", after: "", text: "* [" }] },
    ]);
    expect(r.proposals.map((p) => [p.status, p.reason])).toEqual([
      ["stale", "missing"],
      ["stale", "ambiguous"],
    ]);
    const hint = r.decorations.find(
      (d) => d.type === "widget" && d.className?.includes("gotipe-sug-stale"),
    );
    expect(hint).toBeTruthy();
  });

  it("replaces a block of another type: old block struck, new one after it", () => {
    const r = run(PAGE, [
      {
        id: "p6",
        laneId: "agent",
        edits: [
          {
            before: "\n\n",
            quote: "Цифры — только из базы.",
            after: "\n",
            text: "> [!NOTE]\n> Цифры — только из базы.",
          },
        ],
      },
    ]);
    expect(byType(r.decorations, "node")[0]).toMatchObject({
      className: "gotipe-sug gotipe-sug-block-del",
    });
    expect(
      (byType(r.decorations, "blocks")[0] as Extract<Decoration, { type: "blocks" }>).blocks[0],
    ).toMatchObject({ type: "callout" });
  });

  it("anchors comments to text ranges", () => {
    const r = run(PAGE, [], {
      comments: [
        {
          id: "c1",
          laneId: "agent",
          anchor: { before: "- [ ] ", quote: "Индекс", after: " по" },
          text: "CONCURRENTLY?",
        },
      ],
    });
    expect(r.comments[0]).toMatchObject({ status: "anchored" });
    expect(r.decorations[0]).toMatchObject({
      type: "inline",
      from: 0,
      to: 6,
      className: "gotipe-cmt",
    });
  });

  it("maps an offset inside an empty cell to that cell", () => {
    const s = setup(PAGE);
    const at = PAGE.indexOf("| `open` |") + "| `open` |".length + 1;
    const pos = mapOffsetToText(s.map, at, "before");
    expect(pos?.blockId).toBe(s.blocks[2]!.children[1]!.children[1]!.id);
  });

  it("orders proposals by document position, stale last", () => {
    const r = run(PAGE, [
      {
        id: "late",
        laneId: "agent",
        edits: [{ before: "Цифры — ", quote: "только", after: "", text: "лишь" }],
      },
      {
        id: "gone",
        laneId: "agent",
        edits: [{ before: "", quote: "нет такого", after: "", text: "x" }],
      },
      {
        id: "early",
        laneId: "agent",
        edits: [{ before: "Снять ", quote: "дамп", after: "", text: "снимок" }],
      },
    ]);
    expect(proposalsInDocumentOrder(r.blocks, r.proposals).map((p) => p.id)).toEqual([
      "early",
      "late",
      "gone",
    ]);
  });

  it("reveals a proposal's text progressively", () => {
    const r = run(PAGE, [
      {
        id: "p7",
        laneId: "agent",
        edits: [{ before: "Цифры — ", quote: "", after: "только", text: "строго " }],
      },
    ]);
    const partial = revealDecorations(r.decorations, "p7", 3);
    expect(
      (partial.find((d) => d.type === "widget") as Extract<Decoration, { type: "widget" }>).text,
    ).toBe("стр");
    expect(revealDecorations(r.decorations, "p7", 0).some((d) => d.type === "widget")).toBe(false);
  });

  it("accepting = applying the anchored edits to the file", () => {
    const r = applyAnchoredEdits(PAGE, [
      { before: "| `open` | ", quote: "", after: " |\n| `done`", text: "1 204" },
    ]);
    expect(r.ok && r.text.includes("| `open` | 1 204 |")).toBe(true);
  });
});
