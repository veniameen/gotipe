import { expect, test } from "@playwright/test";
import {
  enableClipboardForTest,
  openNotionAndReset,
  pasteTextWithFallback,
  setNotionContent,
} from "./helpers/notion-checklist";
import {
  getDocStats,
  mod,
  redo,
  selectAcross,
  setSelection,
  snapshot,
  toggleMark,
  undo,
  type MarkName,
} from "./helpers/notion-crossblock";
import {
  activateToolbarForBlock,
  buildMixedDoc,
  dragBlockToIndex,
  getLeafByMarker,
  runSlash,
  topLevelOrder,
} from "./helpers/notion-chaos";

test.describe("Notion-like integrated chaos pack", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
    await enableClipboardForTest(page);
  });

  test("CHAOS-001: nested DnD + clipboard + marks + history chain stays stable", async ({ page }) => {
    const seed = `chaos1-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, buildMixedDoc(seed));

    const before = await topLevelOrder(page);
    await activateToolbarForBlock(page, "li-a");
    await dragBlockToIndex(page, "li-a", before.length - 1);
    await expect.poll(() => topLevelOrder(page)).not.toEqual(before);

    const selected = await selectAcross(page, "li-a1", "ti-a1", 1, 5);
    await page.keyboard.press(mod("C"));
    await setSelection(page, { blockId: "p-anchor", offset: 4 });
    await pasteTextWithFallback(page, selected || `${seed}-fallback`);

    await setSelection(page, { blockId: "p-anchor", offset: 1 }, { blockId: "p-anchor", offset: 8 });
    await toggleMark(page, "bold");
    await toggleMark(page, "italic");
    await undo(page, 2);
    await redo(page, 2);

    const health = await getDocStats(page);
    expect(health.hasInvalidId).toBe(false);
    expect(health.text).toContain("anchor-fixed");
    expect(health.maxDepth).toBeGreaterThan(2);
    expect(health.markCount).toBeGreaterThan(1);
  });

  test("CHAOS-002: long mixed loop (DnD + clipboard + marks) keeps healthy tree", async ({ page, browserName }) => {
    test.setTimeout(90_000);
    const seed = `chaos2-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, buildMixedDoc(seed));

    const dragBlocks = ["li-a", "ti-a", "code", "p-a"];
    const ranges: Array<[string, string]> = [["li-a1", "ti-a1"], ["li-a", "ti-a"], ["p-a", "p-tail"]];
    const marks: MarkName[] = ["bold", "italic", "underline", "strikethrough", "code"];
    const iterations = browserName === "chromium" ? 24 : 16;

    for (let i = 0; i < iterations; i++) {
      const blockId = dragBlocks[i % dragBlocks.length]!;
      const order = await topLevelOrder(page);
      const targetIndex = i % 2 === 0 ? order.length - 1 : 0;
      await activateToolbarForBlock(page, blockId);
      await dragBlockToIndex(page, blockId, targetIndex);

      const [from, to] = ranges[i % ranges.length]!;
      const selected = await selectAcross(page, from, to, 1, 5);
      if (i % 3 === 0) {
        await page.keyboard.press(mod("C"));
        await setSelection(page, { blockId: "p-anchor", offset: 5 });
        await pasteTextWithFallback(page, (selected || `z${i}`).replace(/\s+/g, " ").slice(0, 16));
      } else if (i % 3 === 1) {
        const beforeCut = await snapshot(page);
        expect(selected.length).toBeGreaterThan(0);
        await page.keyboard.press(mod("X"));
        const afterCut = await snapshot(page);
        expect(afterCut).not.toBe(beforeCut);
        await undo(page, 1);
        await expect.poll(() => snapshot(page)).toBe(beforeCut);
        await redo(page, 1);
        await expect.poll(() => snapshot(page)).toBe(afterCut);
        await undo(page, 1);
        await expect.poll(() => snapshot(page)).toBe(beforeCut);
      } else {
        await setSelection(page, { blockId: "p-tail", offset: 1 }, { blockId: "p-tail", offset: 6 });
        await toggleMark(page, marks[i % marks.length]!);
        await setSelection(page, { blockId: "p-tail", offset: 6 });
        await page.keyboard.type(`v${i % 10}`, { delay: 0 });
      }

      if (i % 8 === 0) {
        await undo(page, 1);
        await redo(page, 1);
      }
    }

    const health = await getDocStats(page);
    expect(health.hasInvalidId).toBe(false);
    expect(health.text).toContain("anchor-fixed");
    expect(health.maxDepth).toBeGreaterThan(2);
    expect(health.blockCount).toBeGreaterThan(10);
    expect(health.markCount).toBeGreaterThan(browserName === "chromium" ? 6 : 2);
  });

  test("CHAOS-003: slash transform + immediate typing + DnD + clipboard remains deterministic", async ({ page }) => {
    const marker = `chaos3-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [
      { id: "start", type: "paragraph", attrs: {}, content: [{ text: "start", marks: [] }], children: [] },
      { id: "target", type: "paragraph", attrs: {}, content: [{ text: marker, marks: [] }], children: [] },
      { id: "other", type: "paragraph", attrs: {}, content: [{ text: "other", marks: [] }], children: [] },
      { id: "anchor", type: "paragraph", attrs: {}, content: [{ text: "anchor-fixed", marks: [] }], children: [] },
    ]);

    await setSelection(page, { blockId: "target", offset: marker.length });
    await runSlash(page, "todo", "To-do List");

    const leaf = await getLeafByMarker(page, marker);
    expect(leaf?.parentType).toBe("todoList");
    await setSelection(page, { blockId: leaf!.blockId, offset: leaf!.text.length });
    await page.keyboard.type("-typed", { delay: 0 });

    const topTodoId = await page.evaluate((leafId) => {
      if (!leafId) return null;
      const el = document.querySelector(`[data-block-id="${leafId}"]`) as HTMLElement | null;
      return el?.parentElement?.getAttribute("data-block-id") ?? null;
    }, leaf?.blockId ?? null);
    expect(topTodoId).not.toBeNull();

    await activateToolbarForBlock(page, leaf!.blockId);
    await dragBlockToIndex(page, leaf!.blockId, 0);

    const copied = await selectAcross(page, leaf!.blockId, "other", 1, 4);
    await page.keyboard.press(mod("C"));
    await setSelection(page, { blockId: "anchor", offset: 12 });
    await pasteTextWithFallback(page, copied || "fallback");

    const health = await getDocStats(page);
    expect(health.hasInvalidId).toBe(false);
    expect(health.text).toContain("anchor-fixed");
    expect(health.text).toContain("typed");
    expect(health.text).toContain(marker);
  });
});
