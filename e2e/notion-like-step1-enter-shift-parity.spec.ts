import { expect, test } from "@playwright/test";
import { openNotionAndReset, setNotionContent } from "./helpers/notion-checklist";
import {
  blockquote,
  callout,
  codeBlock,
  getSelectionContext,
  paragraph,
  setCaret,
  syncSelection,
  textOf,
  todoList,
  topLevelCount,
} from "./helpers/notion-step1-parity";

test.describe("Notion-like Step1 parity (Enter/Shift+Enter)", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("blockquote Enter at end exits to paragraph and keeps typing flow", async ({ page }) => {
    const marker = `q_enter_${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [blockquote("q", "Quote seed"), paragraph("tail", "Tail")]);
    await setCaret(page, "q", "end");
    await syncSelection(page);
    await page.keyboard.press("Enter");

    await expect.poll(() => getSelectionContext(page)).toMatchObject({
      blockType: "paragraph",
      parentType: null,
    });
    const sel = await getSelectionContext(page);
    expect(sel.blockId).not.toBeNull();

    await page.keyboard.type(marker);
    await expect.poll(async () => textOf(page, sel.blockId!)).toContain(marker);
    await expect.poll(async () => textOf(page, "q")).toContain("Quote seed");
  });

  test("callout Enter at end exits to paragraph and keeps typing flow", async ({ page }) => {
    const marker = `c_enter_${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [callout("c", "Callout seed"), paragraph("tail", "Tail")]);
    await setCaret(page, "c", "end");
    await syncSelection(page);
    await page.keyboard.press("Enter");

    await expect.poll(() => getSelectionContext(page)).toMatchObject({
      blockType: "paragraph",
      parentType: null,
    });
    const sel = await getSelectionContext(page);
    expect(sel.blockId).not.toBeNull();

    await page.keyboard.type(marker);
    await expect.poll(async () => textOf(page, sel.blockId!)).toContain(marker);
    await expect.poll(async () => textOf(page, "c")).toContain("Callout seed");
  });

  test("code block Enter at end stays in same code block with newline", async ({ page }) => {
    const marker = `code_enter_${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [codeBlock("code", "const a = 1;"), paragraph("tail", "Tail")]);
    await setCaret(page, "code", "end");
    await syncSelection(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type(marker);

    await expect.poll(async () => topLevelCount(page, "codeBlock")).toBe(1);
    await expect.poll(async () => textOf(page, "code")).toContain("const a = 1;\n");
    await expect.poll(async () => textOf(page, "code")).toContain(marker);
  });

  test("todo Enter on non-empty item creates next todo item", async ({ page }) => {
    await setNotionContent(page, [todoList("list", [{ id: "todo-1", text: "First" }])]);
    await setCaret(page, "todo-1", "end");
    await syncSelection(page);
    await page.keyboard.press("Enter");

    await expect
      .poll(async () => page.locator('[data-block-type="todoList"] > [data-block-type="todoItem"]').count())
      .toBe(2);
    await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "todoItem", parentType: "todoList" });
  });

  test("todo Enter on empty item exits list to paragraph", async ({ page }) => {
    await setNotionContent(page, [todoList("list", [{ id: "todo-1", text: "" }])]);
    await setCaret(page, "todo-1", "start");
    await syncSelection(page);
    await page.keyboard.press("Enter");

    await expect.poll(async () => topLevelCount(page, "todoList")).toBe(0);
    await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "paragraph" });
  });

  test("blockquote Shift+Enter keeps blockquote and inserts newline", async ({ page }) => {
    const marker = `q_shift_${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [blockquote("q", "Quote seed")]);
    await setCaret(page, "q", "end");
    await syncSelection(page);
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(marker);

    await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockId: "q", blockType: "blockquote" });
    await expect.poll(async () => textOf(page, "q")).toContain("Quote seed\n");
    await expect.poll(async () => textOf(page, "q")).toContain(marker);
  });

  test("callout Shift+Enter keeps callout and inserts newline", async ({ page }) => {
    const marker = `calloutshift${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [callout("c", "Callout seed")]);
    await setCaret(page, "c", "end");
    await syncSelection(page);
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(marker, { delay: 20 });

    await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockId: "c", blockType: "callout" });
    await expect.poll(async () => textOf(page, "c")).toContain("Callout seed\n");
    await expect.poll(async () => textOf(page, "c")).toContain(marker.slice(0, 8));
  });

  test("code block Shift+Enter inserts newline in same code block", async ({ page }) => {
    const marker = `code_shift_${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [codeBlock("code", "line"), paragraph("tail", "Tail")]);
    await setCaret(page, "code", "end");
    await syncSelection(page);
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type(marker);

    await expect.poll(async () => topLevelCount(page, "codeBlock")).toBe(1);
    await expect.poll(async () => textOf(page, "code")).toContain("line\n");
    await expect.poll(async () => textOf(page, "code")).toContain(marker);
  });
});
