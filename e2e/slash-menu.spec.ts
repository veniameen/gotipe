import { expect, test, type Page } from "@playwright/test";

async function openNotion(page: Page) {
  await page.goto("/#notion");
  await expect(page.locator('[data-gotipe-nav="notion"]')).toHaveClass(/active/);
  await expect(page.locator("[data-gotipe-content]")).toBeVisible();
}

async function setCaretToEndOfFirstParagraph(page: Page) {
  await page.evaluate(() => {
    const editor = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const paragraph = editor?.querySelector("p");
    if (!editor || !paragraph) return;

    const sel = window.getSelection();
    if (!sel) return;

    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let lastText: Node | null = null;
    let current: Node | null;
    while ((current = walker.nextNode())) {
      lastText = current;
    }

    const range = document.createRange();
    if (lastText) {
      range.setStart(lastText, (lastText.textContent ?? "").length);
    } else {
      range.setStart(paragraph, paragraph.childNodes.length);
    }
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
  });
}

async function openSlashMenuOnFreshLine(page: Page) {
  await setCaretToEndOfFirstParagraph(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await expect(page.locator("[data-gotipe-slash-menu]")).toBeVisible();
}

test.describe("Slash menu", () => {
  test.beforeEach(async ({ page }) => {
    await openNotion(page);
  });

  test("opens near slash caret and stays in viewport", async ({ page }) => {
    await openSlashMenuOnFreshLine(page);

    const state = await page.evaluate(() => {
      const menu = document.querySelector("[data-gotipe-slash-menu]") as HTMLElement | null;
      const content = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
      if (!menu || !content) return null;

      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      let slashNode: Node | null = null;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if ((node.textContent ?? "").startsWith("/")) {
          slashNode = node;
          break;
        }
      }
      if (!slashNode) return null;

      const slashRange = document.createRange();
      slashRange.setStart(slashNode, 0);
      slashRange.setEnd(slashNode, 1);
      const slashRect = slashRange.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();

      return {
        menuLeft: menuRect.left,
        menuTop: menuRect.top,
        menuWidth: menuRect.width,
        menuHeight: menuRect.height,
        slashLeft: slashRect.left,
        slashTop: slashRect.top,
        slashBottom: slashRect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    expect(state).not.toBeNull();
    expect(Math.abs((state?.menuLeft ?? 0) - (state?.slashLeft ?? 0))).toBeLessThan(64);
    const distanceToBelow = Math.abs((state?.menuTop ?? 0) - (state?.slashBottom ?? 0));
    const distanceToAbove = Math.abs(((state?.menuTop ?? 0) + (state?.menuHeight ?? 0)) - (state?.slashTop ?? 0));
    // WebKit can report slightly larger caret/menu distance due line box rounding.
    expect(Math.min(distanceToBelow, distanceToAbove)).toBeLessThan(128);
    expect(state?.menuLeft ?? -1).toBeGreaterThanOrEqual(0);
    expect((state?.menuLeft ?? 0) + (state?.menuWidth ?? 0)).toBeLessThanOrEqual((state?.viewportWidth ?? 0) + 1);
    expect(state?.menuTop ?? -1).toBeGreaterThanOrEqual(0);
    expect((state?.menuTop ?? 0) + (state?.menuHeight ?? 0)).toBeLessThanOrEqual((state?.viewportHeight ?? 0) + 1);
  });

  test("keeps compact width and no horizontal overflow", async ({ page }) => {
    await openSlashMenuOnFreshLine(page);

    const metrics = await page.evaluate(() => {
      const menu = document.querySelector("[data-gotipe-slash-menu]") as HTMLElement | null;
      if (!menu) return null;
      const rect = menu.getBoundingClientRect();
      return {
        width: rect.width,
        maxAllowed: Math.min(300, window.innerWidth * 0.9),
        hasHorizontalOverflow: menu.scrollWidth > menu.clientWidth + 1,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.width ?? 0).toBeLessThanOrEqual((metrics?.maxAllowed ?? 0) + 1);
    expect(metrics?.hasHorizontalOverflow).toBe(false);
  });

  test("supports fuzzy filtering from slash query", async ({ page }) => {
    await setCaretToEndOfFirstParagraph(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type("/h2");
    await expect(page.locator("[data-gotipe-slash-menu]")).toBeVisible();

    const selectedTitle = page.locator(".gotipe-slash-menu-item.selected .gotipe-slash-menu-item-title").first();
    await expect(selectedTitle).toContainText("Heading 2");
  });

  test("navigates with arrows and closes on Escape", async ({ page }) => {
    await openSlashMenuOnFreshLine(page);

    const selected = page.locator(".gotipe-slash-menu-item.selected .gotipe-slash-menu-item-title").first();
    const firstTitle = (await selected.textContent()) ?? "";
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(async () => ((await selected.textContent()) ?? "").trim())
      .not.toBe(firstTitle.trim());

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-gotipe-slash-menu]")).toBeHidden();
  });

  test("executes selected command on Enter", async ({ page }) => {
    await setCaretToEndOfFirstParagraph(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type("/h1");
    await expect(page.locator("[data-gotipe-slash-menu]")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-gotipe-slash-menu]")).toBeHidden();

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const sel = window.getSelection();
          const anchorEl =
            sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
          const blockEl = anchorEl?.closest("[data-block-id]");
          return blockEl?.tagName ?? null;
        });
      })
      .toBe("H1");
  });

  test("closes on outside click", async ({ page }) => {
    await openSlashMenuOnFreshLine(page);
    await page.click("body", { position: { x: 12, y: 12 } });
    await expect(page.locator("[data-gotipe-slash-menu]")).toBeHidden();
  });
});
