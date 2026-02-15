import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setNotionContent, type BlockInput } from "./helpers/notion-checklist";

function spans(text: string) {
  return [{ text, marks: [] as Array<{ type: string; attrs?: Record<string, unknown> }> }];
}

async function setEditorSelection(page: Page, blockId: string, offset: number): Promise<void> {
  await page.evaluate(({ blockId, offset }) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | {
          setSelection?: (selection: {
            anchor: { blockId: string; offset: number };
            head: { blockId: string; offset: number };
          }) => void;
          focus?: () => void;
        }
      | undefined;

    editor?.setSelection?.({
      anchor: { blockId, offset },
      head: { blockId, offset },
    });
    editor?.focus?.();
  }, { blockId, offset });
}

async function openSlashMenu(page: Page, query = ""): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  const candidates = [`/${query}`, ` /${query}`];

  for (const typed of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.keyboard.type(typed, { delay: 8 });
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
  }

  for (const typed of ["/", " /"]) {
    await page.keyboard.type(typed, { delay: 8 });
    try {
      await expect(menu).toBeVisible({ timeout: 1200 });
      if (query.length > 0) {
        await page.keyboard.type(query, { delay: 8 });
        await expect(menu).toBeVisible();
      }
      return;
    } catch {
      for (let i = 0; i < typed.length; i++) {
        await page.keyboard.press("Backspace");
      }
      await page.waitForTimeout(40);
    }
  }
  await expect(menu).toBeVisible();
}

function buildParagraphs(count: number, prefix: string): BlockInput[] {
  const blocks: BlockInput[] = [];
  for (let i = 0; i < count; i++) {
    blocks.push({
      id: `${prefix}-${i}`,
      type: "paragraph",
      attrs: {},
      content: spans(`${prefix} line ${i}`),
      children: [],
    });
  }
  return blocks;
}

test.describe("Notion-like planned UI matrix cases", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("SLASH-019: slash near viewport bottom flips menu above caret", async ({ page }) => {
    const blocks = buildParagraphs(44, "s019");
    const last = blocks[blocks.length - 1]!;
    last.content = spans("");

    await setNotionContent(page, blocks);
    await page.evaluate((blockId) => {
      const block = document.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
      block?.scrollIntoView({ block: "end", behavior: "instant" });
      window.scrollBy({ top: 160, behavior: "instant" });
    }, last.id);
    await setEditorSelection(page, last.id, 0);
    await page.waitForTimeout(80);

    await openSlashMenu(page);
    await page.waitForTimeout(220);

    const metrics = await page.evaluate(() => {
      const menu = document.querySelector("[data-gotipe-slash-menu]") as HTMLElement | null;
      const sel = window.getSelection();
      if (!menu || !sel || sel.rangeCount === 0) return null;

      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      const caretRect = range.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewportPad = 12;
      const spaceBelow = window.innerHeight - caretRect.bottom - viewportPad;
      const distanceToBelow = Math.abs(menuRect.top - caretRect.bottom);
      const distanceToAbove = Math.abs(menuRect.bottom - caretRect.top);

      return {
        spaceBelow,
        distanceToBelow,
        distanceToAbove,
        caretTop: caretRect.top,
        caretBottom: caretRect.bottom,
        menuTop: menuRect.top,
        menuBottom: menuRect.bottom,
        menuHeight: menuRect.height,
        viewportHeight: window.innerHeight,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.spaceBelow ?? 999).toBeLessThan((metrics?.menuHeight ?? 0) - 8);
    expect(metrics?.distanceToAbove ?? 9999).toBeLessThanOrEqual((metrics?.distanceToBelow ?? 0) + 1);
    expect(metrics?.menuTop ?? 9999).toBeLessThan((metrics?.caretTop ?? 0) + 2);
    expect(metrics?.menuTop ?? -1).toBeGreaterThanOrEqual(0);
    expect(metrics?.menuBottom ?? 0).toBeLessThanOrEqual((metrics?.viewportHeight ?? 0) + 1);
  });

  test("UI-007: slash menu keeps layout stable on narrow mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await setNotionContent(page, [{ id: "u007", type: "paragraph", attrs: {}, content: spans(""), children: [] }]);
    await setEditorSelection(page, "u007", 0);

    await openSlashMenu(page);

    const metrics = await page.evaluate(() => {
      const menu = document.querySelector("[data-gotipe-slash-menu]") as HTMLElement | null;
      if (!menu) return null;
      const rect = menu.getBoundingClientRect();
      const maxAllowed = Math.min(300, window.innerWidth * 0.9);

      return {
        menuWidth: rect.width,
        maxAllowed,
        menuLeft: rect.left,
        menuRight: rect.right,
        viewportWidth: window.innerWidth,
        menuHasHorizontalOverflow: menu.scrollWidth > menu.clientWidth + 1,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.menuWidth ?? 0).toBeLessThanOrEqual((metrics?.maxAllowed ?? 0) + 1);
    expect(metrics?.menuLeft ?? -1).toBeGreaterThanOrEqual(0);
    expect(metrics?.menuRight ?? 0).toBeLessThanOrEqual((metrics?.viewportWidth ?? 0) + 1);
    expect(metrics?.menuHasHorizontalOverflow).toBe(false);
  });

  test("UI-008: long slash command titles are truncated with ellipsis without layout break", async ({ page }) => {
    const longTitle = "QA Long Command Title That Must Truncate Without Breaking Slash Menu Layout Integrity";
    const query = "qa-long-title";

    const patched = await page.evaluate(({ longTitle, query }) => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | { getSlashCommands?: () => Array<Record<string, unknown>> }
        | undefined;
      if (!editor || typeof editor.getSlashCommands !== "function") return false;
      const marker = "__qaLongTitlePatched__";
      if ((editor as Record<string, unknown>)[marker]) return true;

      const original = editor.getSlashCommands.bind(editor);
      (editor as Record<string, unknown>).getSlashCommands = () => {
        const base = original();
        if (base.some((cmd) => cmd?.name === longTitle)) return base;
        base.push({
          name: longTitle,
          aliases: [query],
          icon: "type",
          group: "insert",
          execute: () => {},
        });
        return base;
      };
      (editor as Record<string, unknown>)[marker] = true;
      return true;
    }, { longTitle, query });

    expect(patched).toBe(true);
    const firstBlock = page.locator("[data-gotipe-content] > [data-block-id]").first();
    const box = await firstBlock.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 10, box.y + Math.max(8, box.height / 2));
    }
    await page.waitForTimeout(40);

    await setNotionContent(page, [{ id: "u008", type: "paragraph", attrs: {}, content: spans(""), children: [] }]);
    await setEditorSelection(page, "u008", 0);
    await openSlashMenu(page, query);

    const longTitleItem = page.locator(".gotipe-slash-menu-item-title", { hasText: longTitle }).first();
    await expect(longTitleItem).toBeVisible();

    const metrics = await page.evaluate((longTitle) => {
      const menu = document.querySelector("[data-gotipe-slash-menu]") as HTMLElement | null;
      if (!menu) return null;
      const titleEl = Array.from(menu.querySelectorAll(".gotipe-slash-menu-item-title")).find((el) =>
        (el.textContent ?? "").includes(longTitle),
      ) as HTMLElement | undefined;
      if (!titleEl) return null;
      const row = titleEl.closest(".gotipe-slash-menu-item") as HTMLElement | null;
      if (!row) return null;

      const titleRect = titleEl.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const titleStyles = getComputedStyle(titleEl);

      return {
        textOverflow: titleStyles.textOverflow,
        whiteSpace: titleStyles.whiteSpace,
        overflowX: titleStyles.overflowX,
        titleScrollWidth: titleEl.scrollWidth,
        titleClientWidth: titleEl.clientWidth,
        rowScrollWidth: row.scrollWidth,
        rowClientWidth: row.clientWidth,
        menuScrollWidth: menu.scrollWidth,
        menuClientWidth: menu.clientWidth,
        titleRight: titleRect.right,
        menuRight: menuRect.right,
      };
    }, longTitle);

    expect(metrics).not.toBeNull();
    expect(metrics?.textOverflow).toBe("ellipsis");
    expect(metrics?.whiteSpace).toBe("nowrap");
    expect(["hidden", "clip"]).toContain(metrics?.overflowX ?? "");
    expect((metrics?.titleScrollWidth ?? 0) > (metrics?.titleClientWidth ?? 0)).toBe(true);
    expect(metrics?.rowScrollWidth ?? 999).toBeLessThanOrEqual((metrics?.rowClientWidth ?? 0) + 1);
    expect(metrics?.menuScrollWidth ?? 999).toBeLessThanOrEqual((metrics?.menuClientWidth ?? 0) + 1);
    expect(metrics?.titleRight ?? 9999).toBeLessThanOrEqual((metrics?.menuRight ?? 0) + 1);
  });
});
