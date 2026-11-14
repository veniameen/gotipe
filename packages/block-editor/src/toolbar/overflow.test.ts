import { describe, expect, it } from "vitest";
import { type ToolUnit, barWidth, hiddenUnits, packRows, planOverflow, samePlan } from "./overflow";

const NEVER = Number.POSITIVE_INFINITY;
/** The bar of Atlas frame 31 with the widths the frame draws (px). */
const UNITS: ToolUnit[] = [
  { id: "history", group: "history", priority: NEVER },
  { id: "blockType", group: "blockType", priority: NEVER },
  { id: "font", group: "font", priority: 2 },
  { id: "marks", group: "marks", priority: NEVER },
  { id: "moreMarks", group: "marks", priority: 5 },
  { id: "align", group: "blocks", priority: 4 },
  { id: "lists", group: "blocks", priority: 6 },
  { id: "todo", group: "blocks", priority: 4 },
  { id: "insert", group: "insert", priority: 3 },
  { id: "invisibles", group: "end", priority: 1, end: true },
];
const WIDTHS = new Map(
  Object.entries({
    history: 58,
    blockType: 65,
    font: 196,
    marks: 88,
    moreMarks: 118,
    align: 48,
    lists: 58,
    todo: 28,
    insert: 108,
    invisibles: 28,
  }),
);
const METRICS = { gap: 2, separator: 9, more: 28 };
const all = new Set(UNITS.map((unit) => unit.id));
const ids = (rows: ToolUnit[][][]) => rows.map((row) => row.map((group) => group.map((u) => u.id)));

describe("the fixed toolbar's «More»", () => {
  it("measures the bar: tools, a separator between groups, the gaps", () => {
    // 795 of tools, five separators, sixteen items (the free space before ¶ included)
    expect(barWidth(UNITS, WIDTHS, all, METRICS)).toBe(795 + 5 * 9 + 15 * 2);
  });

  it("keeps the whole bar where it fits (1024)", () => {
    expect(planOverflow(UNITS, WIDTHS, 1000, METRICS, 4)).toMatchObject({
      rows: [],
      cramped: false,
    });
    expect(hiddenUnits(UNITS, WIDTHS, 1000, METRICS).size).toBe(0);
  });

  it("sends ¶, then the font and size to «More» first (768)", () => {
    // in the order they leave
    expect([...hiddenUnits(UNITS, WIDTHS, 744, METRICS)]).toEqual(["invisibles", "font"]);
  });

  it("keeps history, the block type, bold, italic, underline and the lists on a phone (375)", () => {
    const plan = planOverflow(UNITS, WIDTHS, 351, METRICS, 4);
    expect([...plan.hidden].sort()).toEqual(
      ["align", "font", "insert", "invisibles", "moreMarks", "todo"].sort(),
    );
    // in the bar's order, as the frame draws it: font | marks, then alignment and tasks | insert | ¶
    expect(ids(plan.rows)).toEqual([
      [["font"], ["moreMarks"]],
      [["align", "todo"], ["insert"], ["invisibles"]],
    ]);
    expect(plan.cramped).toBe(false);
  });

  it("lets units of one priority leave together and never the ones that stay", () => {
    const hidden = hiddenUnits(UNITS, WIDTHS, 100, METRICS);
    expect(hidden.has("align")).toBe(hidden.has("todo"));
    expect(["history", "blockType", "marks"].some((id) => hidden.has(id))).toBe(false);
    expect(planOverflow(UNITS, WIDTHS, 100, METRICS).cramped).toBe(true);
  });

  it("starts a new row when a group does not fit beside the others", () => {
    const rows = packRows(UNITS, WIDTHS, new Set(["font", "moreMarks", "insert"]), 200, METRICS);
    expect(ids(rows)).toEqual([[["font"]], [["moreMarks"]], [["insert"]]]);
  });

  it("tells equal plans apart from changed ones", () => {
    const a = planOverflow(UNITS, WIDTHS, 351, METRICS, 4);
    expect(samePlan(a, planOverflow(UNITS, WIDTHS, 351, METRICS, 4))).toBe(true);
    expect(samePlan(a, planOverflow(UNITS, WIDTHS, 744, METRICS, 4))).toBe(false);
  });
});
