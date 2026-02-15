import { expect, test, type Page } from "@playwright/test";
import {
  heading,
  openNotionAndReset,
  paragraph,
  readSelectionState,
  setCaretAt,
  setNotionContent,
  todoList,
  type BlockInput,
} from "./helpers/notion-checklist";
const PREV_ID = "batch3-prev";
const NEXT_ID = "batch3-next";
const TARGET_ID = "batch3-target";
const LIST_ID = "batch3-list";
const TODO_ITEM_ID = "batch3-todo-item";
type TypingContext = "todo" | "blockquote" | "code" | "callout";
type TypingOp = "type_text" | "enter" | "shift_enter" | "backspace_middle" | "backspace_start" | "delete_forward";
const TYPING_CASES: Array<{ id: string; ctx: TypingContext; op: TypingOp }> = [
  { id: "NL-101", ctx: "todo", op: "backspace_start" },
  { id: "NL-102", ctx: "todo", op: "delete_forward" },
  { id: "NL-103", ctx: "blockquote", op: "type_text" },
  { id: "NL-104", ctx: "blockquote", op: "enter" },
  { id: "NL-105", ctx: "blockquote", op: "shift_enter" },
  { id: "NL-106", ctx: "blockquote", op: "backspace_middle" },
  { id: "NL-107", ctx: "blockquote", op: "backspace_start" },
  { id: "NL-108", ctx: "blockquote", op: "delete_forward" },
  { id: "NL-109", ctx: "code", op: "type_text" },
  { id: "NL-110", ctx: "code", op: "enter" },
  { id: "NL-111", ctx: "code", op: "shift_enter" },
  { id: "NL-112", ctx: "code", op: "backspace_middle" },
  { id: "NL-113", ctx: "code", op: "backspace_start" },
  { id: "NL-114", ctx: "code", op: "delete_forward" },
  { id: "NL-115", ctx: "callout", op: "type_text" },
  { id: "NL-116", ctx: "callout", op: "enter" },
  { id: "NL-117", ctx: "callout", op: "shift_enter" },
  { id: "NL-118", ctx: "callout", op: "backspace_middle" },
  { id: "NL-119", ctx: "callout", op: "backspace_start" },
  { id: "NL-120", ctx: "callout", op: "delete_forward" },
];
type SlashContext = "empty_paragraph" | "start_nonempty_paragraph" | "middle_paragraph" | "end_heading";
type SlashOp = "slash_open" | "slash_query" | "arrow_down_enter" | "arrow_up_enter" | "esc" | "click_outside" | "no_results" | "backspace_to_empty";
const SLASH_CASES: Array<{ id: string; ctx: SlashContext; op: SlashOp }> = [
  { id: "NL-121", ctx: "empty_paragraph", op: "slash_open" },
  { id: "NL-122", ctx: "empty_paragraph", op: "slash_query" },
  { id: "NL-123", ctx: "empty_paragraph", op: "arrow_down_enter" },
  { id: "NL-124", ctx: "empty_paragraph", op: "arrow_up_enter" },
  { id: "NL-125", ctx: "empty_paragraph", op: "esc" },
  { id: "NL-126", ctx: "empty_paragraph", op: "click_outside" },
  { id: "NL-127", ctx: "empty_paragraph", op: "no_results" },
  { id: "NL-128", ctx: "empty_paragraph", op: "backspace_to_empty" },
  { id: "NL-129", ctx: "start_nonempty_paragraph", op: "slash_open" },
  { id: "NL-130", ctx: "start_nonempty_paragraph", op: "slash_query" },
  { id: "NL-131", ctx: "start_nonempty_paragraph", op: "arrow_down_enter" },
  { id: "NL-132", ctx: "start_nonempty_paragraph", op: "arrow_up_enter" },
  { id: "NL-133", ctx: "start_nonempty_paragraph", op: "esc" },
  { id: "NL-134", ctx: "start_nonempty_paragraph", op: "click_outside" },
  { id: "NL-135", ctx: "start_nonempty_paragraph", op: "no_results" },
  { id: "NL-136", ctx: "start_nonempty_paragraph", op: "backspace_to_empty" },
  { id: "NL-137", ctx: "middle_paragraph", op: "slash_open" },
  { id: "NL-138", ctx: "middle_paragraph", op: "slash_query" },
  { id: "NL-139", ctx: "middle_paragraph", op: "arrow_down_enter" },
  { id: "NL-140", ctx: "middle_paragraph", op: "arrow_up_enter" },
  { id: "NL-141", ctx: "middle_paragraph", op: "esc" },
  { id: "NL-142", ctx: "middle_paragraph", op: "click_outside" },
  { id: "NL-143", ctx: "middle_paragraph", op: "no_results" },
  { id: "NL-144", ctx: "middle_paragraph", op: "backspace_to_empty" },
  { id: "NL-145", ctx: "end_heading", op: "slash_open" },
  { id: "NL-146", ctx: "end_heading", op: "slash_query" },
  { id: "NL-147", ctx: "end_heading", op: "arrow_down_enter" },
  { id: "NL-148", ctx: "end_heading", op: "arrow_up_enter" },
  { id: "NL-149", ctx: "end_heading", op: "esc" },
  { id: "NL-150", ctx: "end_heading", op: "click_outside" },
];
if (TYPING_CASES.length + SLASH_CASES.length !== 50) {
  throw new Error("Expected 50 cases for NL-101..NL-150");
}
async function syncSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { syncSelectionFromDOM?: () => void }
      | undefined;
    editor?.syncSelectionFromDOM?.();
  });
}
async function setCaretOffset(page: Page, blockId: string, offset: number): Promise<void> {
  await page.evaluate(({ id, wantedOffset }) => {
    const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    if (!block) return;
    const sel = window.getSelection();
    if (!sel) return;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, wantedOffset);
    let target: Text | null = null;
    let local = 0;
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const textNode = n as Text;
      const len = (textNode.textContent ?? "").length;
      if (remaining <= len) {
        target = textNode;
        local = remaining;
        break;
      }
      remaining -= len;
      target = textNode;
      local = len;
    }
    const range = document.createRange();
    if (target) {
      range.setStart(target, local);
    } else {
      range.setStart(block, 0);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }, { id: blockId, wantedOffset: offset });
}
function targetIdForContext(ctx: TypingContext): string {
  return ctx === "todo" ? TODO_ITEM_ID : TARGET_ID;
}
function buildTypingTarget(ctx: TypingContext, text: string): BlockInput {
  if (ctx === "todo") return todoList(LIST_ID, TODO_ITEM_ID, text);
  if (ctx === "blockquote") return { id: TARGET_ID, type: "blockquote", attrs: {}, content: [{ text, marks: [] }], children: [] };
  if (ctx === "code") return { id: TARGET_ID, type: "codeBlock", attrs: { language: "ts" }, content: text, children: [] };
  return { id: TARGET_ID, type: "callout", attrs: { type: "info" }, content: [{ text, marks: [] }], children: [] };
}
function initialText(op: TypingOp): string {
  if (op === "backspace_middle" || op === "delete_forward") return "ABCDE";
  if (op === "backspace_start") return "Start";
  return "Seed";
}
async function readTextOfBlock(page: Page, blockId: string): Promise<string> {
  return page.evaluate((id) => (document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null)?.textContent ?? "", blockId);
}
async function readTopLevelCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll("[data-gotipe-content] > [data-block-id]").length);
}
async function documentContainsText(page: Page, needle: string): Promise<boolean> {
  return page.evaluate((text) => (document.body.textContent ?? "").includes(text), needle);
}
async function setupTypingCase(page: Page, c: { ctx: TypingContext; op: TypingOp }): Promise<{ beforeText: string; beforeTopLevel: number; targetId: string }> {
  const text = initialText(c.op);
  const targetId = targetIdForContext(c.ctx);
  await setNotionContent(page, [paragraph(PREV_ID, "Prev"), buildTypingTarget(c.ctx, text), paragraph(NEXT_ID, "Next")]);
  const caretPos = c.op === "backspace_start" ? "start" : c.op === "backspace_middle" || c.op === "delete_forward" ? "middle" : "end";
  await setCaretAt(page, targetId, caretPos);
  await syncSelection(page);
  return {
    beforeText: await readTextOfBlock(page, targetId),
    beforeTopLevel: await readTopLevelCount(page),
    targetId,
  };
}
async function setupSlashContext(page: Page, ctx: SlashContext): Promise<void> {
  const block =
    ctx === "end_heading"
      ? heading(TARGET_ID, 1, "Heading slash seed ")
      : paragraph(TARGET_ID, ctx === "empty_paragraph" ? "" : ctx === "start_nonempty_paragraph" ? "Paragraph slash seed" : "Paragraph middle slash seed");
  await setNotionContent(page, [block]);
  if (ctx === "start_nonempty_paragraph") {
    await setCaretAt(page, TARGET_ID, "start");
  } else if (ctx === "middle_paragraph") {
    await setCaretOffset(page, TARGET_ID, 10);
  } else {
    await setCaretAt(page, TARGET_ID, "end");
  }
  await syncSelection(page);
}
async function assertSlashMenuNearCaret(page: Page): Promise<void> {
  const info = await page.evaluate(() => {
    const menu = document.querySelector("[data-gotipe-slash-menu]") as HTMLElement | null;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    if (range) range.collapse(true);
    const caretRect = range?.getBoundingClientRect() ?? null;
    const menuRect = menu?.getBoundingClientRect() ?? null;
    if (!menuRect || !caretRect) return null;
    const horizontalDistance = Math.abs(menuRect.left - caretRect.left);
    const belowDistance = Math.abs(menuRect.top - caretRect.bottom);
    const aboveDistance = Math.abs(menuRect.bottom - caretRect.top);
    return {
      topLeftSafe: menuRect.left > 16 && menuRect.top > 16,
      closeToCaret: horizontalDistance < 160 && (belowDistance < 220 || aboveDistance < 220),
    };
  });
  expect(info).not.toBeNull();
  expect(info?.topLeftSafe).toBe(true);
  expect(info?.closeToCaret).toBe(true);
}
test.describe("Notion-like checklist batch NL-101..NL-150", () => {
  test.beforeEach(async ({ page }) => openNotionAndReset(page));
  for (const c of TYPING_CASES) {
    test(`${c.id}: ${c.ctx} (${c.op})`, async ({ page }) => {
      const { beforeText, beforeTopLevel, targetId } = await setupTypingCase(page, c);
      const marker = `mk_${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;
      if (c.op === "type_text") await page.keyboard.type(marker, { delay: 8 });
      if (c.op === "enter") await page.keyboard.press("Enter");
      if (c.op === "shift_enter") await page.keyboard.press("Shift+Enter");
      if (c.op === "backspace_middle" || c.op === "backspace_start") await page.keyboard.press("Backspace");
      if (c.op === "delete_forward") await page.keyboard.press("Delete");
      if (c.op === "type_text") {
        await expect.poll(async () => (await readTextOfBlock(page, targetId)).includes(marker)).toBe(true);
        return;
      }
      if (c.op === "enter") {
        if (c.ctx === "code") {
          await expect.poll(async () => readTopLevelCount(page)).toBe(beforeTopLevel);
          await page.keyboard.type(marker);
          await expect.poll(async () => documentContainsText(page, marker)).toBe(true);
        } else {
          await expect.poll(async () => readTopLevelCount(page)).toBeGreaterThanOrEqual(beforeTopLevel + 1);
          await page.keyboard.type(marker);
          await expect.poll(async () => documentContainsText(page, marker)).toBe(true);
        }
        return;
      }
      if (c.op === "shift_enter") {
        const maxGrowth = c.ctx === "code" ? 0 : 1;
        await expect
          .poll(async () => {
            const current = await readTopLevelCount(page);
            return current >= beforeTopLevel && current <= beforeTopLevel + maxGrowth;
          })
          .toBe(true);
        await page.keyboard.type(marker);
        await expect.poll(async () => documentContainsText(page, marker)).toBe(true);
        return;
      }
      if (c.op === "backspace_middle" || c.op === "delete_forward") {
        await expect.poll(async () => (await readTextOfBlock(page, targetId)).length).toBeLessThan(beforeText.length);
        return;
      }
      const sel = await readSelectionState(page);
      expect(sel.anchorAtRootStart).toBe(false);
      await page.keyboard.type(marker);
      await expect.poll(async () => documentContainsText(page, marker)).toBe(true);
    });
  }
  for (const c of SLASH_CASES) {
    test(`${c.id}: ${c.ctx} (${c.op})`, async ({ page }) => {
      await setupSlashContext(page, c.ctx);
      const marker = `sl_${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;
      if (c.op === "slash_open") {
        await page.keyboard.type("/");
        await expect(page.locator("[data-gotipe-slash-menu]")).toBeVisible();
        await assertSlashMenuNearCaret(page);
        return;
      }
      if (c.op === "slash_query") {
        await page.keyboard.type("/to");
        const menu = page.locator("[data-gotipe-slash-menu]");
        await expect(menu).toBeVisible();
        await expect(menu).toContainText(/To-do List/i);
        const filtered = await page.locator("[data-gotipe-slash-item]").count();
        expect(filtered).toBeGreaterThan(0);
        return;
      }
      if (c.op === "no_results") {
        await page.keyboard.type("/zzzzzz");
        await expect(page.locator("[data-gotipe-slash-menu]")).toBeVisible();
        await expect(page.locator(".gotipe-slash-menu-empty")).toHaveText("No results");
        return;
      }
      if (c.op === "backspace_to_empty") {
        await page.keyboard.type("/");
        const menu = page.locator("[data-gotipe-slash-menu]");
        await expect(menu).toBeVisible();
        const baseline = await page.locator("[data-gotipe-slash-item]").count();
        await page.keyboard.type("to");
        const filtered = await page.locator("[data-gotipe-slash-item]").count();
        expect(filtered).toBeGreaterThan(0);
        expect(filtered).toBeLessThanOrEqual(baseline);
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await expect(menu).toBeVisible();
        const restored = await page.locator("[data-gotipe-slash-item]").count();
        expect(restored).toBeGreaterThanOrEqual(filtered);
        expect(restored).toBeLessThanOrEqual(baseline);
        return;
      }
      await page.keyboard.type("/");
      await expect(page.locator("[data-gotipe-slash-menu]")).toBeVisible();
      if (c.op === "arrow_down_enter") {
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
      }
      if (c.op === "arrow_up_enter") {
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Enter");
      }
      if (c.op === "esc") await page.keyboard.press("Escape");
      if (c.op === "click_outside") await page.mouse.click(12, 12);
      await expect(page.locator("[data-gotipe-slash-menu]")).toBeHidden();
      if (c.op === "click_outside") await page.locator("[data-gotipe-content]").click();
      await page.keyboard.type(marker);
      await expect.poll(async () => documentContainsText(page, marker)).toBe(true);
    });
  }
});
