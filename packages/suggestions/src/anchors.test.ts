import { describe, expect, it } from "vitest";
import { anchorAt, anchorWindowsOverlap, applyAnchoredEdits, findAnchor, locateEdits } from "./anchors";

const PAGE = "# Выкат\n\n- [ ] Снять дамп\n- [ ] Миграция 0042\n\nЦифры — из базы.\n";

describe("findAnchor", () => {
  it("finds before+quote+after exactly once", () => {
    const m = findAnchor(PAGE, { before: "- [ ] ", quote: "Снять дамп", after: "\n" });
    expect(m).toEqual({ ok: true, start: PAGE.indexOf("Снять"), end: PAGE.indexOf("Снять") + 10 });
  });

  it("reports zero and two matches", () => {
    expect(findAnchor(PAGE, { before: "", quote: "нет такого", after: "" })).toEqual({ ok: false, reason: "missing" });
    expect(findAnchor(PAGE, { before: "- [ ] ", quote: "", after: "" })).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("counts overlapping matches as ambiguous", () => {
    expect(findAnchor("aaa", { before: "", quote: "aa", after: "" })).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("matches LF anchors in CRLF text and maps offsets back", () => {
    const crlf = PAGE.replace(/\n/g, "\r\n");
    const m = findAnchor(crlf, { before: "дамп\n- [ ] ", quote: "Миграция", after: " 0042\n" });
    expect(m.ok).toBe(true);
    if (m.ok) expect(crlf.slice(m.start, m.end)).toBe("Миграция");
  });

  it("an empty needle matches only an empty text", () => {
    expect(findAnchor("", { before: "", quote: "", after: "" })).toEqual({ ok: true, start: 0, end: 0 });
    expect(findAnchor("x", { before: "", quote: "", after: "" })).toEqual({ ok: false, reason: "ambiguous" });
  });
});

describe("applyAnchoredEdits", () => {
  it("applies insert, replace and delete together", () => {
    const r = applyAnchoredEdits(PAGE, [
      { before: "0042", quote: "", after: "\n\n", text: "\n- [ ] Индекс по status_id" },
      { before: "Цифры — ", quote: "из базы", after: ".", text: "только из базы стенда" },
      { before: "# ", quote: "Выкат", after: "\n", text: "Выкат статусов" },
    ]);
    expect(r).toEqual({
      ok: true,
      text: "# Выкат статусов\n\n- [ ] Снять дамп\n- [ ] Миграция 0042\n- [ ] Индекс по status_id\n\nЦифры — только из базы стенда.\n",
    });
    const del = applyAnchoredEdits(PAGE, [{ before: "\n\n", quote: "Цифры — из базы.\n", after: "", text: "" }]);
    expect(del).toEqual({ ok: true, text: "# Выкат\n\n- [ ] Снять дамп\n- [ ] Миграция 0042\n\n" });
  });

  it("is all-or-nothing on a stale anchor", () => {
    const r = applyAnchoredEdits(PAGE, [
      { before: "# ", quote: "Выкат", after: "\n", text: "X" },
      { before: "", quote: "удалено", after: "", text: "Y" },
    ]);
    expect(r).toEqual({ ok: false, reason: "missing", index: 1 });
  });

  it("rejects overlapping edits, including two inserts at one point", () => {
    expect(
      locateEdits(PAGE, [
        { before: "", quote: "Снять дамп", after: "", text: "a" },
        { before: "Снять ", quote: "дамп", after: "", text: "b" },
      ]),
    ).toMatchObject({ ok: false, reason: "overlap" });
    expect(
      locateEdits(PAGE, [
        { before: "дамп", quote: "", after: "\n- [ ] М", text: "1" },
        { before: "Снять дамп", quote: "", after: "", text: "2" },
      ]),
    ).toMatchObject({ ok: false, reason: "overlap" });
  });
});

describe("helpers", () => {
  it("anchorWindowsOverlap detects an edit inside another's window", () => {
    const edit = { before: "Снять ", quote: "дамп", after: "", text: "снимок" };
    expect(anchorWindowsOverlap(PAGE, edit, { before: "- [ ] Снять ", quote: "", after: "" })).toBe(false);
    expect(anchorWindowsOverlap(PAGE, edit, { before: "- [ ] ", quote: "Снять", after: " дамп" })).toBe(true);
  });

  it("anchorAt grows the context until the anchor is unique", () => {
    const text = "x a x a x b";
    const at = text.lastIndexOf("a");
    const anchor = anchorAt(text, at, at + 1, 6);
    expect(findAnchor(text, anchor)).toEqual({ ok: true, start: at, end: at + 1 });
  });
});
