import { expect, test, type Page } from "@playwright/test";
import { runCodeBlockCommand, insertComposedText,
  enableClipboardForTest,
  openNotionAndReset,
  pasteTextWithFallback,
  setCaretAt,
  setNotionContent,
  type BlockInput,
} from "./helpers/notion-checklist";

type Op = "copy_paste" | "cut_undo" | "ime" | "undo_redo10" | "slash_undo_redo";
type Scope = "code" | "multi";
type GutterKind = "paragraph" | "heading" | "bullet" | "todo";
type GutterOp = "hover" | "plus" | "drag_down" | "drag_up";

type OpCase = { id: string; scope: Scope; op: Op };
type GutterCase = { id: string; kind: GutterKind; op: GutterOp };

const OP_CASES: OpCase[] = [
  { id: "NL-451", scope: "code", op: "copy_paste" },
  { id: "NL-452", scope: "code", op: "cut_undo" },
  { id: "NL-453", scope: "code", op: "ime" },
  { id: "NL-454", scope: "code", op: "undo_redo10" },
  { id: "NL-455", scope: "code", op: "slash_undo_redo" },
  { id: "NL-456", scope: "multi", op: "copy_paste" },
  { id: "NL-457", scope: "multi", op: "cut_undo" },
  { id: "NL-458", scope: "multi", op: "ime" },
  { id: "NL-459", scope: "multi", op: "undo_redo10" },
  { id: "NL-460", scope: "multi", op: "slash_undo_redo" },
];

const GUTTER_CASES: GutterCase[] = [
  { id: "NL-461", kind: "paragraph", op: "hover" },
  { id: "NL-462", kind: "paragraph", op: "plus" },
  { id: "NL-463", kind: "paragraph", op: "drag_down" },
  { id: "NL-464", kind: "paragraph", op: "drag_up" },
  { id: "NL-465", kind: "heading", op: "hover" },
  { id: "NL-466", kind: "heading", op: "plus" },
  { id: "NL-467", kind: "heading", op: "drag_down" },
  { id: "NL-468", kind: "heading", op: "drag_up" },
  { id: "NL-469", kind: "bullet", op: "hover" },
  { id: "NL-470", kind: "bullet", op: "plus" },
  { id: "NL-471", kind: "bullet", op: "drag_down" },
  { id: "NL-472", kind: "bullet", op: "drag_up" },
  { id: "NL-473", kind: "todo", op: "hover" },
  { id: "NL-474", kind: "todo", op: "plus" },
  { id: "NL-475", kind: "todo", op: "drag_down" },
];

if (OP_CASES.length + GUTTER_CASES.length !== 25) throw new Error("Expected NL-451..NL-475");

const mod = (key: string) => (process.platform === "darwin" ? `Meta+${key}` : `Control+${key}`);
const spans = (text: string) => [{ text, marks: [] as Array<{ type: string }> }];

async function syncSelection(page: Page) {
  await page.evaluate(() => {
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { syncSelectionFromDOM?: () => void } | undefined;
    ed?.syncSelectionFromDOM?.();
  });
}

async function selectRange(page: Page, blockId: string, from: number, to: number) {
  await page.evaluate(({ id, from, to }) => {
    const root = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    const txt = block ? (document.createTreeWalker(block.querySelector("[data-gotipe-text-content]") ?? block, NodeFilter.SHOW_TEXT).nextNode() as Text | null) : null;
    if (!root || !txt) return;
    const r = document.createRange();
    r.setStart(txt, Math.max(0, Math.min(from, txt.length)));
    r.setEnd(txt, Math.max(0, Math.min(to, txt.length)));
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(r);
    root.focus();
  }, { id: blockId, from, to });
  await syncSelection(page);
}

async function selectAcross(page: Page, aId: string, bId: string, from = 1, to = 3) {
  await page.evaluate(({ aId, bId, from, to }) => {
    const root = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const a = document.querySelector(`[data-block-id="${aId}"]`) as HTMLElement | null;
    const b = document.querySelector(`[data-block-id="${bId}"]`) as HTMLElement | null;
    const ta = a ? (document.createTreeWalker(a, NodeFilter.SHOW_TEXT).nextNode() as Text | null) : null;
    const tb = b ? (document.createTreeWalker(b, NodeFilter.SHOW_TEXT).nextNode() as Text | null) : null;
    if (!root || !ta || !tb) return;
    const r = document.createRange();
    r.setStart(ta, Math.min(from, ta.length));
    r.setEnd(tb, Math.min(to, tb.length));
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(r);
    root.focus();
  }, { aId, bId, from, to });
  await syncSelection(page);
}

async function runSlash(page: Page, query: string, command: string) {
  const menu = page.locator("[data-gotipe-slash-menu]");
  await page.keyboard.type(`/${query}`);
  await expect(menu).toBeVisible();
  await menu.locator(".gotipe-slash-menu-item-title", { hasText: command }).first().click();
  await expect(menu).toBeHidden();
}

async function undo(page: Page, n = 1) { await page.evaluate((k) => { const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean } | undefined; for (let i = 0; i < k; i++) ed?.undo?.(); }, n); }
async function redo(page: Page, n = 1) { await page.evaluate((k) => { const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { redo?: () => boolean } | undefined; for (let i = 0; i < k; i++) ed?.redo?.(); }, n); }
async function textOf(page: Page, blockId: string) { return (await page.textContent(`[data-block-id="${blockId}"]`)) ?? ""; }
async function snapshot(page: Page) { return page.evaluate(() => JSON.stringify(((window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { getViewState?: () => { blocks: unknown } } | undefined)?.getViewState?.().blocks ?? [])); }

function gutterBlocks(kind: GutterKind, marker: string): BlockInput[] {
  const pre: BlockInput = { id: "g-pre", type: "paragraph", attrs: {}, content: spans(`pre-${marker}`), children: [] };
  const post: BlockInput = { id: "g-post", type: "paragraph", attrs: {}, content: spans(`post-${marker}`), children: [] };
  if (kind === "paragraph") return [pre, { id: "g-target", type: "paragraph", attrs: {}, content: spans(`target-${marker}`), children: [] }, post];
  if (kind === "heading") return [pre, { id: "g-target", type: "heading", attrs: { level: 2 }, content: spans(`target-${marker}`), children: [] }, post];
  if (kind === "bullet") return [pre, { id: "g-target", type: "bulletList", attrs: {}, content: null, children: [{ id: "g-item", type: "listItem", attrs: {}, content: spans(`target-${marker}`), children: [] }] }, post];
  return [pre, { id: "g-target", type: "todoList", attrs: {}, content: null, children: [{ id: "g-item", type: "todoItem", attrs: { checked: false }, content: spans(`target-${marker}`), children: [] }] }, post];
}

async function hoverToolbar(page: Page) {
  await page.locator('[data-gotipe-content] > [data-block-id="g-target"]').hover();
  await expect(page.locator(".gotipe-block-toolbar")).toBeVisible();
}

async function topLevelOrder(page: Page) {
  return page.evaluate(() => Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")).map((n) => (n as HTMLElement).getAttribute("data-block-id") ?? ""));
}

async function childRowCount(page: Page, listId: string) {
  return page.evaluate((id) => {
    const list = document.querySelector(`[data-gotipe-content] > [data-block-id="${id}"]`) as HTMLElement | null;
    if (!list) return 0;
    return Array.from(list.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-block-id"),
    ).length;
  }, listId);
}

async function dragBlockToIndex(page: Page, blockId: string, targetIndex: number) {
  await page.evaluate(({ blockId, targetIndex }) => {
    const root = document.querySelector("[data-gotipe-block-editor]") as HTMLElement | null;
    const handle = document.querySelector(`[data-block-drag="${blockId}"]`) as HTMLElement | null;
    const blocks = Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")) as HTMLElement[];
    const target = blocks[targetIndex] ?? null;
    if (!root || !handle || !target) return;
    const data = new DataTransfer();
    data.setData("text/gotipe-block-id", blockId);
    handle.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: data }));
    const rect = target.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    root.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientY: y, dataTransfer: data }));
    root.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientY: y, dataTransfer: data }));
    handle.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: data }));
  }, { blockId, targetIndex });
}

test.describe("Notion-like checklist batch NL-451..NL-475", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
    await page.getByRole("banner").getByRole("radio", { name: "Light theme" }).click();
    await enableClipboardForTest(page);
  });

  for (const c of OP_CASES) {
    test(`${c.id}: ${c.scope} (${c.op})`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;
      const codeText = `code-${marker}`;
      const aText = `left-${marker}`;
      const bText = `right-${marker}`;

      if (c.scope === "code") {
        await setNotionContent(page, [{ id: "k-target", type: "codeBlock", attrs: {}, content: codeText, children: [] }]);
      } else {
        await setNotionContent(page, [{ id: "m-a", type: "paragraph", attrs: {}, content: spans(aText), children: [] }, { id: "m-b", type: "paragraph", attrs: {}, content: spans(bText), children: [] }]);
      }

      const targetId = c.scope === "code" ? "k-target" : "m-b";
      if (c.op === "copy_paste") {
        if (c.scope === "code") {
          await selectRange(page, targetId, 0, codeText.length);
          await page.keyboard.press(mod("C"));
        } else {
          await selectAcross(page, "m-a", "m-b");
          const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
          await page.keyboard.press(mod("C"));
          await setCaretAt(page, targetId, "end");
          await syncSelection(page);
          await pasteTextWithFallback(page, selected);
          await expect.poll(() => textOf(page, targetId)).toContain(bText);
          return;
        }
        await setCaretAt(page, targetId, "end");
        await syncSelection(page);
        await pasteTextWithFallback(page, codeText);
        await expect.poll(() => textOf(page, targetId)).toContain(c.scope === "code" ? `${codeText}${codeText}` : bText);
        return;
      }

      if (c.op === "cut_undo") {
        const before = await snapshot(page);
        if (c.scope === "code") await selectRange(page, targetId, 0, codeText.length);
        else await selectAcross(page, "m-a", "m-b");
        await page.keyboard.press(mod("X"));
        await expect.poll(() => snapshot(page)).not.toBe(before);
        await undo(page, 1);
        await expect.poll(() => snapshot(page)).toBe(before);
        return;
      }

      if (c.op === "ime") {
        const ime = `ime_${marker}`;
        await setCaretAt(page, targetId, "end");
        await syncSelection(page);
        await insertComposedText(page, ime);
        await expect.poll(() => textOf(page, targetId)).toContain(ime);
        return;
      }

      if (c.op === "undo_redo10") {
        const seq = "abcdefghij";
        await setCaretAt(page, targetId, "end");
        await syncSelection(page);
        await page.keyboard.type(seq);
        await expect.poll(() => textOf(page, targetId)).toContain(seq);
        await undo(page, 10);
        await expect.poll(() => textOf(page, targetId)).not.toContain(seq);
        await redo(page, 10);
        await expect.poll(() => textOf(page, targetId)).toContain(seq);
        return;
      }

      await setCaretAt(page, targetId, "start");
      await syncSelection(page);
      if (c.scope === "code") await runCodeBlockCommand(page, { mode: "transform", query: "h2", command: "Heading 2" });
      else await runSlash(page, "todo", "To-do List");
      if (c.scope === "code") {
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="heading"]').count()).toBeGreaterThan(0);
        await undo(page, 1);
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="codeBlock"]').count()).toBeGreaterThan(0);
      } else {
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="todoList"]').count()).toBeGreaterThan(0);
        await undo(page, 1);
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="paragraph"]').count()).toBe(2);
      }
      await redo(page, 1);
      await expect.poll(async () => page.locator(c.scope === "code" ? '[data-gotipe-content] > [data-block-type="heading"]' : '[data-gotipe-content] > [data-block-type="todoList"]').count()).toBeGreaterThan(0);
    });
  }

  for (const c of GUTTER_CASES) {
    test(`${c.id}: ${c.kind} (${c.op})`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;
      await setNotionContent(page, gutterBlocks(c.kind, marker));
      await hoverToolbar(page);

      if (c.op === "hover") {
        const metrics = await page.evaluate(() => {
          const block = document.querySelector('[data-gotipe-content] > [data-block-id="g-target"]') as HTMLElement | null;
          const toolbar = document.querySelector(".gotipe-block-toolbar-wrapper") as HTMLElement | null;
          if (!block || !toolbar) return null;
          const b = block.getBoundingClientRect();
          const t = toolbar.getBoundingClientRect();
          return { leftGap: b.left - t.left, rightGap: Math.abs(t.right - b.left) };
        });
        expect(metrics).not.toBeNull();
        expect(metrics!.leftGap).toBeGreaterThan(12);
        expect(metrics!.leftGap).toBeLessThan(180);
        expect(metrics!.rightGap).toBeLessThan(120);
        return;
      }

      if (c.op === "plus") {
        const before = await page.locator('[data-gotipe-content] > [data-block-id]').count();
        const beforeChildren =
          c.kind === "bullet" || c.kind === "todo"
            ? await childRowCount(page, "g-target")
            : 0;
        await page.click('[aria-label="Click to add below. Option-click to add a block above"]');
        if (c.kind === "bullet" || c.kind === "todo") {
          await expect(page.locator('[data-gotipe-content] > [data-block-id]')).toHaveCount(before);
          await expect.poll(() => childRowCount(page, "g-target")).toBe(beforeChildren + 1);
        } else {
          await expect(page.locator('[data-gotipe-content] > [data-block-id]')).toHaveCount(before + 1);
        }
        return;
      }

      const initial = await topLevelOrder(page);
      const target = c.op === "drag_down" ? 2 : 0;
      await dragBlockToIndex(page, "g-target", target);
      if ((await topLevelOrder(page)).join("|") === initial.join("|")) {
        await page.evaluate(({ blockId, targetIndex }) => {
          const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { chain?: () => { moveBlock: (id: string, idx: number) => { run: () => boolean } } } | undefined;
          ed?.chain?.().moveBlock(blockId, targetIndex).run();
        }, { blockId: "g-target", targetIndex: target });
      }
      await expect.poll(() => topLevelOrder(page)).not.toEqual(initial);
      const finalOrder = await topLevelOrder(page);
      const idx = finalOrder.indexOf("g-target");
      if (c.op === "drag_down") expect(idx).toBeGreaterThan(1);
      else expect(idx).toBe(0);
    });
  }
});
