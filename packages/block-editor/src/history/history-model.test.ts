import type { Block, Document } from "@gotipe/core";
import { describe, expect, it } from "vitest";
import {
  LIVE_ROW,
  compareTree,
  dayLabel,
  groupByDay,
  initials,
  savedRows,
  withLiveRow,
} from "./history-model";

const p = (id: string, text: string, type = "paragraph"): Block => ({
  id,
  type,
  attrs: {},
  content: text ? [{ text, marks: [] }] : [],
  children: [],
});
const list = (id: string, ...items: Block[]): Block => ({
  id,
  type: "orderedList",
  attrs: {},
  content: null,
  children: items,
});
const doc = (...blocks: Block[]): Document => ({ version: 1, blocks });
const version = (id: string, at: string, snapshot: Document, createdBy = "Илья Орлов") => ({
  id,
  name: id,
  createdAt: at,
  createdBy,
  snapshot,
});

describe("the comparison of a version with the page", () => {
  it("marks added, removed and changed blocks and puts removed ones back where they stood", () => {
    const before = doc(
      p("h", "Порядок выката", "heading"),
      list(
        "l",
        p("i1", "Включить журнал для 10 % пользователей", "listItem"),
        p("i2", "Неделю", "listItem"),
      ),
      p("old", "Шифрование черновика — после выпуска."),
      p("end", "Возражения"),
    );
    const after = doc(
      p("h", "Порядок выката", "heading"),
      list(
        "l",
        p("i1", "Включить журнал для 5 % пользователей", "listItem"),
        p("i2", "Неделю", "listItem"),
        p("i3", "Открыть всем", "listItem"),
      ),
      p("new", "Черновик шифруется ключом сессии."),
      p("end", "Возражения"),
    );
    const result = compareTree(before, after);
    expect([result.added, result.removed, result.changed]).toEqual([2, 1, 1]);
    expect(result.nodes.map((node) => [node.block.id, node.status])).toEqual([
      ["h", "same"],
      ["l", "same"],
      ["old", "removed"],
      ["new", "added"],
      ["end", "same"],
    ]);
    const items = result.nodes[1]!.children;
    expect(items.map((node) => node.status)).toEqual(["changed", "same", "added"]);
    expect(items[0]!.text).toEqual([
      { type: "equal", text: "Включить журнал для " },
      { type: "delete", text: "10" },
      { type: "insert", text: "5" },
      { type: "equal", text: " % пользователей" },
    ]);
  });
  it("keeps a removed first block first and a removed subtree whole", () => {
    const before = doc(p("a", "первый"), list("l", p("x", "пункт", "listItem")), p("b", "b"));
    const result = compareTree(before, doc(p("b", "b")));
    expect(result.nodes.map((node) => [node.block.id, node.status])).toEqual([
      ["a", "removed"],
      ["l", "removed"],
      ["b", "same"],
    ]);
    expect(result.nodes[1]!.children.map((node) => node.status)).toEqual(["removed"]);
    expect(result.removed).toBe(2);
  });
});

describe("the list of versions", () => {
  const first = doc(p("a", "one two"));
  const second = doc(p("a", "one two three four"));
  const versions = [
    version("v2", "2026-11-14T11:05:00", second),
    version("v1", "2026-11-13T18:40:00", first, "system"),
  ];
  it("counts the words of each version against the one before it", () => {
    const rows = savedRows(versions);
    expect(rows.map((row) => [row.id, row.words])).toEqual([
      ["v2", { added: 2, removed: 0 }],
      ["v1", { added: 2, removed: 0 }],
    ]);
    expect(rows[1]!.author).toBeNull();
  });
  it("puts the later of two versions saved at the same moment first", () => {
    const moment = "2026-11-14T14:35:00Z";
    const rows = savedRows([version("before", moment, first), version("after", moment, second)]);
    expect(rows.map((row) => row.id)).toEqual(["after", "before"]);
  });
  it("leads with the live page while it differs from the newest version", () => {
    const rows = savedRows(versions);
    const now = new Date("2026-11-14T14:32:00");
    const changed = withLiveRow(rows, doc(p("a", "one two three")), now, {
      name: "Мария Лебедева",
    });
    expect(changed[0]).toMatchObject({
      id: LIVE_ROW,
      live: true,
      author: "Мария Лебедева",
      words: { added: 0, removed: 1 },
    });
    const same = withLiveRow(rows, second, now, undefined);
    expect(same[0]).toMatchObject({ id: "v2", live: true });
    expect(same).toHaveLength(2);
    expect(withLiveRow([], second, now, undefined)).toEqual([]);
  });
  it("groups by local day and names today, yesterday and older days", () => {
    const rows = savedRows(versions);
    const now = new Date("2026-11-14T15:00:00");
    const days = groupByDay(rows);
    expect(days.map((day) => day.rows.length)).toEqual([1, 1]);
    const words = { today: "Сегодня", yesterday: "Вчера" };
    expect(days.map((day) => dayLabel(day.date, now, "ru", words))).toEqual(["Сегодня", "Вчера"]);
    expect(dayLabel(new Date("2026-11-07T16:20:00"), now, "ru", words)).toBe("7 ноября");
    expect(initials("Мария Лебедева")).toBe("МЛ");
    expect(initials("anna")).toBe("A");
  });
});
