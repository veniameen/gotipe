import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setCaretAt, setNotionContent, type BlockInput } from "./helpers/notion-checklist";

type Variant = "bullet" | "ordered" | "todo" | "cross" | "collapsed_mid";
type Op = "bold" | "italic" | "underline" | "bubble_command" | "shortcut";

type C = { id: string; variant: Variant; op: Op };

const CASES: C[] = [
  { id: "NL-401", variant: "bullet", op: "bold" },
  { id: "NL-402", variant: "bullet", op: "italic" },
  { id: "NL-403", variant: "bullet", op: "underline" },
  { id: "NL-404", variant: "bullet", op: "bubble_command" },
  { id: "NL-405", variant: "bullet", op: "shortcut" },
  { id: "NL-406", variant: "ordered", op: "bold" },
  { id: "NL-407", variant: "ordered", op: "italic" },
  { id: "NL-408", variant: "ordered", op: "underline" },
  { id: "NL-409", variant: "ordered", op: "bubble_command" },
  { id: "NL-410", variant: "ordered", op: "shortcut" },
  { id: "NL-411", variant: "todo", op: "bold" },
  { id: "NL-412", variant: "todo", op: "italic" },
  { id: "NL-413", variant: "todo", op: "underline" },
  { id: "NL-414", variant: "todo", op: "bubble_command" },
  { id: "NL-415", variant: "todo", op: "shortcut" },
  { id: "NL-416", variant: "cross", op: "bold" },
  { id: "NL-417", variant: "cross", op: "italic" },
  { id: "NL-418", variant: "cross", op: "underline" },
  { id: "NL-419", variant: "cross", op: "bubble_command" },
  { id: "NL-420", variant: "cross", op: "shortcut" },
  { id: "NL-421", variant: "collapsed_mid", op: "bold" },
  { id: "NL-422", variant: "collapsed_mid", op: "italic" },
  { id: "NL-423", variant: "collapsed_mid", op: "underline" },
  { id: "NL-424", variant: "collapsed_mid", op: "bubble_command" },
  { id: "NL-425", variant: "collapsed_mid", op: "shortcut" },
];
if (CASES.length !== 25) throw new Error("Expected NL-401..NL-425");

const mod = (key: string) => (process.platform === "darwin" ? `Meta+${key}` : `Control+${key}`);

const spans = (text: string) => [{ text, marks: [] as Array<{ type: string }> }];

const list = (type: "bulletList" | "orderedList" | "todoList", listId: string, itemId: string, text: string): BlockInput => ({
  id: listId,
  type,
  attrs: {},
  content: null,
  children: [{ id: itemId, type: type === "todoList" ? "todoItem" : "listItem", attrs: type === "todoList" ? { checked: false } : {}, content: spans(text), children: [] }],
});

async function syncSelection(page: Page) {
  await page.evaluate(() => {
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { syncSelectionFromDOM?: () => void } | undefined;
    ed?.syncSelectionFromDOM?.();
  });
}

async function selectRangeInBlock(page: Page, blockId: string, from: number, to: number) {
  await page.evaluate(({ id, from, to }) => {
    const root = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    if (!root || !block) return;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode() as Text | null;
    if (!text) return;
    const r = document.createRange();
    r.setStart(text, Math.max(0, Math.min(from, text.length)));
    r.setEnd(text, Math.max(0, Math.min(to, text.length)));
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(r);
    root.focus();
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { syncSelectionFromDOM?: () => void } | undefined;
    ed?.syncSelectionFromDOM?.();
  }, { id: blockId, from, to });
}

async function selectAcrossBlocks(page: Page, firstId: string, secondId: string) {
  await page.evaluate(({ aId, bId }) => {
    const root = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const a = document.querySelector(`[data-block-id="${aId}"]`) as HTMLElement | null;
    const b = document.querySelector(`[data-block-id="${bId}"]`) as HTMLElement | null;
    if (!root || !a || !b) return;
    const ta = document.createTreeWalker(a, NodeFilter.SHOW_TEXT).nextNode() as Text | null;
    const tb = document.createTreeWalker(b, NodeFilter.SHOW_TEXT).nextNode() as Text | null;
    if (!ta || !tb) return;
    const r = document.createRange();
    r.setStart(ta, 0);
    r.setEnd(tb, Math.min(tb.length, 6));
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(r);
    root.focus();
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { syncSelectionFromDOM?: () => void } | undefined;
    ed?.syncSelectionFromDOM?.();
  }, { aId: firstId, bId: secondId });
}

async function runBubble(page: Page, mark: "bold" | "italic" | "underline" | "code") {
  const bubble = page.locator("[data-gotipe-bubble-menu]");
  await expect(bubble).toBeVisible();
  await bubble.locator(`[data-mark="${mark}"]`).click();
}

async function applyOp(page: Page, op: Op) {
  if (op === "bold") return runBubble(page, "bold");
  if (op === "italic") return runBubble(page, "italic");
  if (op === "underline") return runBubble(page, "underline");
  if (op === "bubble_command") return runBubble(page, "code");
  await page.keyboard.press(mod("B"));
}

async function active(page: Page, mark: string) {
  return page.evaluate((m) => {
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { getViewState?: () => { toolbar: { activeMarks?: string[] } } } | undefined;
    return (ed?.getViewState?.().toolbar.activeMarks ?? []).includes(m);
  }, mark);
}

test.describe("Notion-like checklist batch NL-401..NL-425", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
    await page.getByRole("banner").getByRole("radio", { name: "Light theme" }).click();
  });

  for (const c of CASES) {
    test(`${c.id}: ${c.variant} (${c.op})`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;
      const text = `alpha-${marker}-omega`;

      if (c.variant === "bullet") {
        await setNotionContent(page, [list("bulletList", "b-list", "b-item", text)]);
        await selectRangeInBlock(page, "b-item", 0, 10);
      } else if (c.variant === "ordered") {
        await setNotionContent(page, [list("orderedList", "o-list", "o-item", text)]);
        await selectRangeInBlock(page, "o-item", 0, 10);
      } else if (c.variant === "todo") {
        await setNotionContent(page, [list("todoList", "t-list", "t-item", text)]);
        await selectRangeInBlock(page, "t-item", 0, 10);
      } else if (c.variant === "cross") {
        await setNotionContent(page, [
          { id: "c-1", type: "paragraph", attrs: {}, content: spans(`first-${marker}`), children: [] },
          { id: "c-2", type: "paragraph", attrs: {}, content: spans(`second-${marker}`), children: [] },
        ]);
        await selectAcrossBlocks(page, "c-1", "c-2");
      } else {
        await setNotionContent(page, [{ id: "m-1", type: "paragraph", attrs: {}, content: spans(`alpha${marker}omega`), children: [] }]);
        const midText = `alpha${marker}omega`;
        const mid = Math.floor(midText.length / 2);
        await setCaretAt(page, "m-1", "middle");
        await syncSelection(page);
        if (c.op === "bubble_command") {
          await selectRangeInBlock(page, "m-1", mid, Math.min(mid + 1, midText.length));
        }
      }

      if (c.variant === "collapsed_mid") {
        if (c.op === "bold") {
          await page.keyboard.press(mod("B"));
          await page.keyboard.type("B");
          await expect(page.locator('[data-block-id="m-1"] strong')).toContainText("B");
          return;
        }
        if (c.op === "italic") {
          await page.evaluate(() => {
            const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
              | { chain?: () => { focus: () => { toggleItalic: () => { run: () => boolean } } } }
              | undefined;
            ed?.chain?.().focus().toggleItalic().run();
          });
          await page.keyboard.type("I");
          await expect(page.locator('[data-block-id="m-1"] em')).toContainText("I");
          return;
        }
        if (c.op === "underline") {
          await page.evaluate(() => {
            const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
              | { chain?: () => { focus: () => { toggleUnderline: () => { run: () => boolean } } } }
              | undefined;
            ed?.chain?.().focus().toggleUnderline().run();
          });
          await page.keyboard.type("U");
          await expect(page.locator('[data-block-id="m-1"] u')).toContainText("U");
          return;
        }
        if (c.op === "bubble_command") {
          await runBubble(page, "code");
          await expect(page.locator('[data-block-id="m-1"] code')).toHaveCount(1);
          return;
        }
        await page.keyboard.press(mod("B"));
        await page.keyboard.type("Z");
        await expect(page.locator('[data-block-id="m-1"] strong')).toContainText("Z");
        return;
      }

      await applyOp(page, c.op);

      if (c.variant === "cross") {
        if (c.op === "bold" || c.op === "shortcut") await expect(page.locator('[data-block-id="c-1"] strong')).toHaveCount(1);
        if (c.op === "italic") await expect(page.locator('[data-block-id="c-1"] em')).toHaveCount(1);
        if (c.op === "underline") await expect(page.locator('[data-block-id="c-1"] u')).toHaveCount(1);
        if (c.op === "bubble_command") await expect(page.locator('[data-block-id="c-1"] code')).toHaveCount(1);
      } else {
        const blockId = c.variant === "bullet" ? "b-item" : c.variant === "ordered" ? "o-item" : "t-item";
        if (c.op === "bold" || c.op === "shortcut") await expect(page.locator(`[data-block-id="${blockId}"] strong`)).toHaveCount(1);
        if (c.op === "italic") await expect(page.locator(`[data-block-id="${blockId}"] em`)).toHaveCount(1);
        if (c.op === "underline") await expect(page.locator(`[data-block-id="${blockId}"] u`)).toHaveCount(1);
        if (c.op === "bubble_command") await expect(page.locator(`[data-block-id="${blockId}"] code`)).toHaveCount(1);
      }

      const mark = c.op === "italic" ? "italic" : c.op === "underline" ? "underline" : c.op === "bubble_command" ? "code" : "bold";
      await expect.poll(() => active(page, mark)).toBe(true);
    });
  }
});
