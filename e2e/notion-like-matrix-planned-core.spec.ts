import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setNotionContent, type BlockInput } from "./helpers/notion-checklist";

function spans(text: string) {
  return [{ text, marks: [] as Array<{ type: string; attrs?: Record<string, unknown> }> }];
}

async function openSlashMenu(page: Page, query: string): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  const typed = `/${query}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.type(typed, { delay: 10 });
    try {
      await expect(menu).toBeVisible({ timeout: 1200 });
      return;
    } catch {
      for (let i = 0; i < typed.length; i++) {
        await page.keyboard.press("Backspace");
      }
      await page.waitForTimeout(40);
    }
  }

  // Fallback path: open menu with "/" first, then type query into the search.
  await page.keyboard.type("/", { delay: 10 });
  await expect(menu).toBeVisible();
  const search = menu.locator(".gotipe-slash-menu-search");
  if (await search.isVisible()) {
    await search.fill(query);
  } else {
    await page.keyboard.type(query, { delay: 10 });
  }
  await expect(menu).toBeVisible();
}

async function runSlashByEnter(page: Page, query: string): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  await openSlashMenu(page, query);
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
}

async function runSlashByClick(page: Page, query: string, commandName: string): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  await openSlashMenu(page, query);
  const item = menu.locator(".gotipe-slash-menu-item-title", { hasText: commandName }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(menu).toBeHidden();
}

async function getLeafByMarker(page: Page, marker: string): Promise<{
  blockType: string | null;
  parentType: string | null;
  hasBoldMark: boolean;
  text: string;
} | null> {
  return page.evaluate((needle) => {
    type Block = {
      type: string;
      content: unknown;
      children: Block[];
    };
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { getViewState?: () => { blocks: Block[] } }
      | undefined;
    const blocks = editor?.getViewState?.().blocks ?? [];

    const plainText = (content: unknown): string => {
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content.map((s) => (typeof s?.text === "string" ? s.text : "")).join("");
      }
      return "";
    };

    const walk = (nodes: Block[], parentType: string | null): {
      blockType: string | null;
      parentType: string | null;
      hasBoldMark: boolean;
      text: string;
    } | null => {
      for (const node of nodes) {
        const inChildren = walk(node.children ?? [], node.type);
        if (inChildren) return inChildren;

        const text = plainText(node.content);
        if (!text.includes(needle)) continue;
        const hasBoldMark =
          Array.isArray(node.content) &&
          node.content.some((span) =>
            typeof span?.text === "string" &&
            span.text.includes(needle) &&
            Array.isArray(span?.marks) &&
            span.marks.some((mark) => mark?.type === "bold"),
          );
        return {
          blockType: node.type,
          parentType,
          hasBoldMark,
          text,
        };
      }
      return null;
    };

    return walk(blocks, null);
  }, marker);
}

async function getSelectionContext(page: Page): Promise<{ blockType: string | null; parentType: string | null }> {
  return page.evaluate(() => {
    const sel = window.getSelection();
    const anchor = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
    const block = anchor?.closest("[data-block-id]") as HTMLElement | null;
    const parent = block?.parentElement?.closest("[data-block-id]") as HTMLElement | null;
    return {
      blockType: block?.getAttribute("data-block-type") ?? null,
      parentType: parent?.getAttribute("data-block-type") ?? null,
    };
  });
}

async function setEditorSelection(page: Page, blockId: string, offset = 0): Promise<void> {
  await page.evaluate(({ blockId, offset }) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | {
          setSelection?: (selection: {
            anchor: { blockId: string; offset: number };
            head: { blockId: string; offset: number };
          }) => void;
        }
      | undefined;
    editor?.setSelection?.({
      anchor: { blockId, offset },
      head: { blockId, offset },
    });
  }, { blockId, offset });
}

test.describe("Notion-like planned matrix cases", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("SLASH-011: slash + Enter in empty paragraph creates target block and keeps caret", async ({ page }) => {
    const marker = `s011_${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [{ id: "p", type: "paragraph", attrs: {}, content: spans(""), children: [] }]);
    await setEditorSelection(page, "p", 0);

    await runSlashByEnter(page, "h1");
    await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "heading", parentType: null });

    await page.keyboard.type(marker);
    const heading = page.locator('[data-gotipe-content] > [data-block-type="heading"]').first();
    await expect(heading).toContainText(marker);
  });

  test("SLASH-015: slash in list item with marks keeps marks intact", async ({ page }) => {
    const marker = `s015_${Math.random().toString(36).slice(2, 7)}`;
    const listWithMarks: BlockInput = {
      id: "list",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        {
          id: "li",
          type: "listItem",
          attrs: {},
          content: [
            { text: marker, marks: [{ type: "bold", attrs: {} }] },
            { text: " plain", marks: [] },
          ],
          children: [],
        },
      ],
    };

    await setNotionContent(page, [listWithMarks]);
    await setEditorSelection(page, "li", 0);
    await runSlashByClick(page, "text", "Text");

    const leaf = await getLeafByMarker(page, marker);
    expect(leaf?.blockType).toBe("paragraph");
    expect(leaf?.parentType).toBeNull();
    expect(leaf?.hasBoldMark).toBe(true);
    expect(leaf?.text).toContain(" plain");
  });

  test("SLASH-016: slash while range-selected stays stable and applies transform", async ({ page }) => {
    const text = "alpha beta gamma";
    const rangeWord = "beta";
    const marker = `s016_${Math.random().toString(36).slice(2, 7)}`;
    const from = text.indexOf(rangeWord);
    const to = from + rangeWord.length;

    await setNotionContent(page, [{ id: "p", type: "paragraph", attrs: {}, content: spans(text), children: [] }]);
    await page.evaluate(({ from, to }) => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | {
            setSelection?: (selection: {
              anchor: { blockId: string; offset: number };
              head: { blockId: string; offset: number };
            }) => void;
          }
        | undefined;
      editor?.setSelection?.({
        anchor: { blockId: "p", offset: from },
        head: { blockId: "p", offset: to },
      });
    }, { from, to });

    await runSlashByEnter(page, "h2");
    await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "heading", parentType: null });

    await page.keyboard.type(` ${marker}`);
    const h2 = page.locator('[data-gotipe-content] > [data-block-type="heading"]').first();
    await expect(h2).toContainText("alpha");
    await expect(h2).toContainText("gamma");
    await expect(h2).toContainText(marker);
  });

  test("ENTER-010: undo/redo after slash transform restores tree correctly", async ({ page }) => {
    const marker = `e010_${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, [{ id: "p", type: "paragraph", attrs: {}, content: spans(marker), children: [] }]);
    await setEditorSelection(page, "p", 0);

    await runSlashByClick(page, "bullet", "Bullet List");
    await expect.poll(() => getLeafByMarker(page, marker)).toMatchObject({
      blockType: "listItem",
      parentType: "bulletList",
    });

    await page.evaluate(() => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | { undo?: () => boolean; redo?: () => boolean }
        | undefined;
      editor?.undo?.();
    });
    await expect.poll(() => getLeafByMarker(page, marker)).toMatchObject({
      blockType: "paragraph",
      parentType: null,
    });

    await page.evaluate(() => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | { undo?: () => boolean; redo?: () => boolean }
        | undefined;
      editor?.redo?.();
    });
    await expect.poll(() => getLeafByMarker(page, marker)).toMatchObject({
      blockType: "listItem",
      parentType: "bulletList",
    });
  });
});
