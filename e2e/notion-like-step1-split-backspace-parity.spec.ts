import { expect, test } from "@playwright/test";
import { openNotionAndReset, setNotionContent } from "./helpers/notion-checklist";
import {
  blockquote,
  callout,
  getSelectionContext,
  paragraph,
  setCaret,
  syncSelection,
  textOf,
  todoList,
  topLevelCount,
} from "./helpers/notion-step1-parity";

test.describe("Notion-like Step1 parity (Split/Backspace)", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("blockquote Enter in middle splits to paragraph without losing tail", async ({ page }) => {
    await setNotionContent(page, [blockquote("q", "ABCD")]);
    await setCaret(page, "q", "middle");
    await syncSelection(page);
    await page.keyboard.press("Enter");

    await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "paragraph" });
    const sel = await getSelectionContext(page);
    expect(sel.blockId).not.toBeNull();

    const left = await textOf(page, "q");
    const right = await textOf(page, sel.blockId!);
    expect((left + right).replace(/\n/g, "")).toBe("ABCD");
  });

  test("callout Enter in middle splits to paragraph without losing tail", async ({ page }) => {
    await setNotionContent(page, [callout("c", "ABCD")]);
    await setCaret(page, "c", "middle");
    await syncSelection(page);
    await page.keyboard.press("Enter");

    await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "paragraph" });
    const sel = await getSelectionContext(page);
    expect(sel.blockId).not.toBeNull();

    const left = await textOf(page, "c");
    const right = await textOf(page, sel.blockId!);
    expect((left + right).replace(/\n/g, "")).toBe("ABCD");
  });

  test("blockquote double Enter does not create second quote block", async ({ page }) => {
    await setNotionContent(page, [blockquote("q", "Quote seed")]);
    await setCaret(page, "q", "end");
    await syncSelection(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    await expect.poll(async () => topLevelCount(page, "blockquote")).toBe(1);
    await expect.poll(async () => topLevelCount(page, "paragraph")).toBeGreaterThanOrEqual(2);
  });

  test("callout double Enter does not create second callout block", async ({ page }) => {
    await setNotionContent(page, [callout("c", "Callout seed")]);
    await setCaret(page, "c", "end");
    await syncSelection(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    await expect.poll(async () => topLevelCount(page, "callout")).toBe(1);
    await expect.poll(async () => topLevelCount(page, "paragraph")).toBeGreaterThanOrEqual(2);
  });

  test("Backspace at start of second todo item lifts it to paragraph", async ({ page }) => {
    const secondText = `todo_second_${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [
      todoList("list", [{ id: "todo-1", text: "First" }, { id: "todo-2", text: secondText }]),
    ]);
    await setCaret(page, "todo-2", "start");
    await syncSelection(page);
    await page.keyboard.press("Backspace");

    await expect
      .poll(async () =>
        page.locator('[data-gotipe-content] > [data-block-type="paragraph"]', { hasText: secondText }).count(),
      )
      .toBeGreaterThan(0);
    await expect.poll(async () => textOf(page, "todo-1")).toContain("First");
  });

  test("Backspace at start of blockquote merges into previous paragraph", async ({ page }) => {
    await setNotionContent(page, [paragraph("prev", "Prev"), blockquote("q", "Quote")]);
    await setCaret(page, "q", "start");
    await syncSelection(page);
    await page.keyboard.press("Backspace");

    await expect.poll(async () => topLevelCount(page, "blockquote")).toBe(0);
    await expect.poll(async () => textOf(page, "prev")).toContain("PrevQuote");
  });

  test("todo Enter then Enter exits list on second press", async ({ page }) => {
    await setNotionContent(page, [todoList("list", [{ id: "todo-1", text: "Seed" }])]);
    await setCaret(page, "todo-1", "end");
    await syncSelection(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    await expect.poll(async () => topLevelCount(page, "todoList")).toBe(1);
    await expect.poll(async () => topLevelCount(page, "paragraph")).toBeGreaterThanOrEqual(1);
    await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "paragraph" });
  });
});
