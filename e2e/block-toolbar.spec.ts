import { expect, test, type Page } from "@playwright/test";

async function openNotion(page: Page) {
  await page.goto("/#notion");
  await expect(page.locator('[data-gotipe-nav="notion"]')).toHaveClass(/active/);
  await expect(page.locator("[data-gotipe-content]")).toBeVisible();
}

async function hoverFirstTopLevelBlock(page: Page) {
  const block = page.locator("[data-gotipe-content] > [data-block-id]").first();
  await block.hover();
  await expect(page.locator(".gotipe-block-toolbar")).toBeVisible();
}

test.describe("Block toolbar", () => {
  test.beforeEach(async ({ page }) => {
    await openNotion(page);
  });

  test("shows drag handle and add button on block hover", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await expect(page.locator("[data-gotipe-drag-handle]")).toBeVisible();
    await expect(page.locator('[aria-label="Add block below"]')).toBeVisible();
  });

  test("add button inserts new block", async ({ page }) => {
    const blocks = page.locator("[data-gotipe-content] > [data-block-id]");
    const before = await blocks.count();

    await hoverFirstTopLevelBlock(page);
    await page.click('[aria-label="Add block below"]');

    await expect(blocks).toHaveCount(before + 1);
  });

  test("toolbar remains clickable when moving from block text into left gutter", async ({ page }) => {
    const blocks = page.locator("[data-gotipe-content] > [data-block-id]");
    const before = await blocks.count();

    const points = await page.evaluate(() => {
      const block = document.querySelector("[data-gotipe-content] > [data-block-id]") as HTMLElement | null;
      if (!block) return null;
      const rect = block.getBoundingClientRect();
      return {
        startX: rect.left + Math.min(120, Math.max(24, rect.width / 3)),
        startY: rect.top + Math.min(24, Math.max(10, rect.height / 2)),
      };
    });
    expect(points).not.toBeNull();

    await page.mouse.move(points!.startX, points!.startY);
    await expect(page.locator(".gotipe-block-toolbar")).toBeVisible();

    const addButton = page.locator('[aria-label="Add block below"]');
    const addBox = await addButton.boundingBox();
    expect(addBox).not.toBeNull();

    await page.mouse.move(addBox!.x + addBox!.width / 2, addBox!.y + addBox!.height / 2, { steps: 12 });
    await expect(addButton).toBeVisible();
    await page.mouse.click(addBox!.x + addBox!.width / 2, addBox!.y + addBox!.height / 2);

    await expect(blocks).toHaveCount(before + 1);
  });

  test("drag handle click opens context menu", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await expect(page.locator("[data-gotipe-context-menu]")).toBeVisible();
  });

  test("context menu shows all actions", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    const menu = page.locator("[data-gotipe-context-menu]");
    await expect(menu).toContainText("Delete");
    await expect(menu).toContainText("Duplicate");
    await expect(menu).toContainText("Reset Formatting");
    await expect(menu).toContainText("Copy to Clipboard");
  });

  test("context menu closes on Escape", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await expect(page.locator("[data-gotipe-context-menu]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-gotipe-context-menu]")).not.toBeVisible();
  });

  test("context menu closes on outside click", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await expect(page.locator("[data-gotipe-context-menu]")).toBeVisible();
    await page.click("body", { position: { x: 12, y: 12 } });
    await expect(page.locator("[data-gotipe-context-menu]")).not.toBeVisible();
  });

  test("Delete removes the block", async ({ page }) => {
    const blocks = page.locator("[data-gotipe-content] > [data-block-id]");
    const before = await blocks.count();

    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await page.click('[data-gotipe-context-menu] button:has-text("Delete")');

    await expect(blocks).toHaveCount(before - 1);
  });

  test("Duplicate creates a copy of the block", async ({ page }) => {
    const blocks = page.locator("[data-gotipe-content] > [data-block-id]");
    const before = await blocks.count();

    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await page.click('[data-gotipe-context-menu] button:has-text("Duplicate")');

    await expect(blocks).toHaveCount(before + 1);
  });

  test("toolbar has correct ARIA role", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    const toolbar = page.locator(".gotipe-block-toolbar");
    await expect(toolbar).toHaveAttribute("role", "toolbar");
    await expect(toolbar).toHaveAttribute("aria-label", "Block actions");
  });

  test("context menu has role=menu and role=menuitem items", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    const menu = page.locator("[data-gotipe-context-menu]");
    await expect(menu).toHaveAttribute("role", "menu");
    await expect(menu.locator('[role="menuitem"]')).toHaveCount(4);
  });
});

test.describe("Drag and drop", () => {
  test.beforeEach(async ({ page }) => {
    await openNotion(page);
  });

  test("drag handle has draggable attribute", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await expect(page.locator("[data-gotipe-drag-handle]")).toHaveAttribute("draggable", "true");
  });

  test("drop indicator style exists", async ({ page }) => {
    const hasRule = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && rule.selectorText?.includes("gotipe-drop-indicator")) {
              return true;
            }
          }
        } catch {
          // Cross-origin stylesheet access can throw.
        }
      }
      return false;
    });
    expect(hasRule).toBe(true);
  });

  test("drag handle has touch support label", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await expect(page.locator("[data-gotipe-drag-handle]")).toHaveAttribute(
      "aria-label",
      "Drag to reorder block",
    );
  });
});
