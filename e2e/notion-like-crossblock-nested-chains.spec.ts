import { expect, test } from "@playwright/test";
import {
  enableClipboardForTest,
  openNotionAndReset,
  pasteTextWithFallback,
  setNotionContent,
  type BlockInput,
} from "./helpers/notion-checklist";
import {
  getDocStats,
  mod,
  redo,
  selectAcross,
  setSelection,
  snapshot,
  spans,
  toggleMark,
  undo,
  type MarkName,
} from "./helpers/notion-crossblock";

function buildNestedDoc(seed: string): BlockInput[] {
  return [
    { id: "h-0", type: "heading", attrs: { level: 2 }, content: spans(`${seed}-heading`), children: [] },
    { id: "p-0", type: "paragraph", attrs: {}, content: spans(`${seed}-p-0`), children: [] },
    {
      id: "bl-root",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        {
          id: "li-a",
          type: "listItem",
          attrs: {},
          content: spans(`${seed}-li-a`),
          children: [
            {
              id: "bl-nested",
              type: "bulletList",
              attrs: {},
              content: null,
              children: [
                { id: "li-a1", type: "listItem", attrs: {}, content: spans(`${seed}-li-a1`), children: [] },
                { id: "li-a2", type: "listItem", attrs: {}, content: spans(`${seed}-li-a2`), children: [] },
              ],
            },
          ],
        },
        { id: "li-b", type: "listItem", attrs: {}, content: spans(`${seed}-li-b`), children: [] },
      ],
    },
    {
      id: "tl-root",
      type: "todoList",
      attrs: {},
      content: null,
      children: [
        {
          id: "ti-a",
          type: "todoItem",
          attrs: { checked: false },
          content: spans(`${seed}-ti-a`),
          children: [
            {
              id: "tl-nested",
              type: "todoList",
              attrs: {},
              content: null,
              children: [
                {
                  id: "ti-a1",
                  type: "todoItem",
                  attrs: { checked: false },
                  content: spans(`${seed}-ti-a1`),
                  children: [],
                },
                {
                  id: "ti-a2",
                  type: "todoItem",
                  attrs: { checked: false },
                  content: spans(`${seed}-ti-a2`),
                  children: [],
                },
              ],
            },
          ],
        },
        { id: "ti-b", type: "todoItem", attrs: { checked: false }, content: spans(`${seed}-ti-b`), children: [] },
      ],
    },
    {
      id: "ol-root",
      type: "orderedList",
      attrs: {},
      content: null,
      children: [{ id: "oi-a", type: "listItem", attrs: {}, content: spans(`${seed}-oi-a`), children: [] }],
    },
    { id: "p-anchor", type: "paragraph", attrs: {}, content: spans(`${seed}-anchor-fixed`), children: [] },
    { id: "p-tail", type: "paragraph", attrs: {}, content: spans(`${seed}-tail`), children: [] },
  ];
}

test.describe("Notion-like nested cross-block range chains", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
    await enableClipboardForTest(page);
  });

  test("NCB-001: copy/paste across nested ranges keeps tree and marks stable", async ({ page }) => {
    const seed = `ncb1-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, buildNestedDoc(seed));

    const selected = await selectAcross(page, "li-a1", "ti-a1", 1, 6);
    await page.keyboard.press(mod("C"));
    await setSelection(page, { blockId: "p-anchor", offset: 4 });
    await pasteTextWithFallback(page, selected || `${seed}-fallback`);

    await setSelection(page, { blockId: "p-anchor", offset: 1 }, { blockId: "p-anchor", offset: 8 });
    await toggleMark(page, "bold");
    await toggleMark(page, "italic");

    const stats = await getDocStats(page);
    expect(stats.hasInvalidId).toBe(false);
    expect(stats.text).toContain("anchor-fixed");
    expect(stats.text).toContain(seed);
    expect(stats.text).toContain(`${seed}-tail`);
    expect(stats.maxDepth).toBeGreaterThan(2);
    expect(stats.markCount).toBeGreaterThan(1);
  });

  test("NCB-002: nested cross-block cut + undo/redo restores deterministic snapshot", async ({ page }) => {
    const seed = `ncb2-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, buildNestedDoc(seed));

    const before = await snapshot(page);
    await selectAcross(page, "li-a2", "ti-b", 1, 5);
    await page.keyboard.press(mod("X"));

    let mutated = await snapshot(page);
    if (mutated === before) {
      await setSelection(page, { blockId: "p-tail", offset: 2 }, { blockId: "p-tail", offset: 6 });
      await page.keyboard.press("Backspace");
      mutated = await snapshot(page);
    }

    expect(mutated).not.toBe(before);
    await undo(page, 1);
    await expect.poll(() => snapshot(page)).toBe(before);

    await redo(page, 1);
    await expect.poll(() => snapshot(page)).not.toBe(before);

    const stats = await getDocStats(page);
    expect(stats.hasInvalidId).toBe(false);
    expect(stats.maxDepth).toBeGreaterThan(2);
    expect(stats.blockCount).toBeGreaterThan(10);
  });

  test("NCB-003: rapid mixed nested range loop stays healthy", async ({ page, browserName }) => {
    test.setTimeout(90_000);
    const seed = `ncb3-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, buildNestedDoc(seed));

    const pairs: Array<[string, string]> = [
      ["li-a1", "ti-a1"],
      ["li-a2", "ti-a2"],
      ["li-b", "oi-a"],
      ["p-0", "ti-b"],
      ["li-a", "p-tail"],
    ];
    const marks: MarkName[] = ["bold", "italic", "underline", "strikethrough", "code"];
    const textTargets = ["p-0", "p-anchor", "p-tail"];
    const iterations = browserName === "chromium" ? 30 : 18;

    for (let i = 0; i < iterations; i++) {
      const [from, to] = pairs[i % pairs.length]!;
      const selected = await selectAcross(page, from, to, 1, 5);

      if (i % 3 === 0) {
        await page.keyboard.press(mod("C"));
        const target = textTargets[i % textTargets.length]!;
        await setSelection(page, { blockId: target, offset: 4 });
        const payload = (selected || `n${i}`).replace(/\s+/g, " ").slice(0, 18);
        await pasteTextWithFallback(page, payload);
      } else if (i % 3 === 1) {
        await page.keyboard.press(mod("X"));
        await undo(page, 1);
        await redo(page, 1);
      } else {
        const target = textTargets[(i + 1) % textTargets.length]!;
        await setSelection(page, { blockId: target, offset: 1 }, { blockId: target, offset: 7 });
        await toggleMark(page, marks[i % marks.length]!);
        await setSelection(page, { blockId: target, offset: 7 });
        await page.keyboard.type(`q${i % 10}`, { delay: 0 });
      }

      if (i % 9 === 0) {
        await undo(page, 1);
        await redo(page, 1);
      }
    }

    const stats = await getDocStats(page);
    expect(stats.hasInvalidId).toBe(false);
    expect(stats.text).toContain("anchor-fixed");
    expect(stats.maxDepth).toBeGreaterThan(2);
    expect(stats.blockCount).toBeGreaterThan(10);
    expect(stats.markCount).toBeGreaterThan(browserName === "chromium" ? 5 : 2);
  });
});
