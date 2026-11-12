import { test, expect } from "@playwright/test";

const BASE = "/?view=block#basic";

test.describe("Phase 3.9-3.13: Callout + Image + Table + Toggle + Columns", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE);
    await page.waitForSelector("[data-gotipe-content]");
    await page.waitForFunction(() => (window as any).__GOTIPE_EDITOR__);
  });

  // --- Full page screenshot ---
  test("Full page renders all block types", async ({ page }) => {
    await page.waitForTimeout(500);
    await page.screenshot({
      path: test.info().outputPath("phase3-full-page.png"),
      fullPage: true,
    });
  });

  // --- 3.9: Callout ---
  test("Callout block renders with emoji and content", async ({ page }) => {
    const callout = page.locator('[data-block-type="callout"]');
    await expect(callout.first()).toBeVisible();

    // Has emoji
    const emoji = callout.first().locator(".gotipe-callout-emoji");
    await expect(emoji).toBeVisible();
    const emojiText = await emoji.textContent();
    expect(emojiText).toBeTruthy();

    // Has content
    const content = callout.first().locator(".gotipe-callout-content");
    await expect(content).toBeVisible();
    const contentText = await content.textContent();
    expect(contentText!.length).toBeGreaterThan(0);

    // Screenshot
    await callout.first().screenshot({
      path: test.info().outputPath("phase3-callout.png"),
    });
  });

  // --- 3.10: Image ---
  test("Image block with src renders img element", async ({ page }) => {
    const images = page.locator('[data-block-type="image"]');
    const imageCount = await images.count();
    expect(imageCount).toBeGreaterThanOrEqual(1);

    // First image should have an <img> with src
    const firstImage = images.first();
    await expect(firstImage).toBeVisible();
    const img = firstImage.locator("img");
    const imgCount = await img.count();
    expect(imgCount).toBe(1);

    // Screenshot
    await firstImage.screenshot({
      path: test.info().outputPath("phase3-image-with-src.png"),
    });
  });

  test("Image block without src shows placeholder", async ({ page }) => {
    const images = page.locator('[data-block-type="image"]');
    // The second image block has no src
    const placeholderImage = images.nth(1);
    await expect(placeholderImage).toBeVisible();

    const placeholder = placeholderImage.locator(".gotipe-image-placeholder");
    await expect(placeholder).toBeVisible();
    const placeholderText = await placeholder.textContent();
    expect(placeholderText).toContain("Add an image");

    // Screenshot
    await placeholderImage.screenshot({
      path: test.info().outputPath("phase3-image-placeholder.png"),
    });
  });

  test("Image block has figcaption when caption provided", async ({ page }) => {
    const firstImage = page.locator('[data-block-type="image"]').first();
    const caption = firstImage.locator("figcaption");
    const captionCount = await caption.count();
    expect(captionCount).toBe(1);
    const captionText = await caption.textContent();
    expect(captionText).toContain("A sample image from Picsum");
  });

  // --- 3.11: Table ---
  test("Table block renders with header row and data rows", async ({ page }) => {
    const table = page.locator('[data-block-type="table"]');
    await expect(table.first()).toBeVisible();

    // Should contain <table>
    const tableEl = table.first().locator("table");
    await expect(tableEl).toBeVisible();

    // Should have header cells (<th>)
    const headerCells = table.first().locator("th");
    const headerCount = await headerCells.count();
    expect(headerCount).toBe(3); // 3 columns

    // Should have data cells (<td>)
    const dataCells = table.first().locator("td");
    const dataCount = await dataCells.count();
    expect(dataCount).toBe(9); // 3 rows x 3 columns

    // Verify header content
    const h1 = await headerCells.nth(0).textContent();
    const h2 = await headerCells.nth(1).textContent();
    const h3 = await headerCells.nth(2).textContent();
    expect(h1).toContain("Feature");
    expect(h2).toContain("Status");
    expect(h3).toContain("Notes");

    // Screenshot
    await table.first().screenshot({
      path: test.info().outputPath("phase3-table.png"),
    });
  });

  test("Table has proper styling (rules between rows, quiet header)", async ({ page }) => {
    const table = page.locator('[data-block-type="table"]');
    await expect(table.first()).toBeVisible();

    // GoTipe Atlas, frame 9: no frame and no fill; the head stands apart by a stronger rule under
    // it and by quieter, heavier text.
    const look = await table.first().evaluate((el) => {
      const th = getComputedStyle(el.querySelector("th")!);
      const td = getComputedStyle(el.querySelector("td")!);
      return {
        headRule: th.borderBottomStyle,
        headRuleColor: th.borderBottomColor,
        rowRuleColor: td.borderBottomColor,
        headColor: th.color,
        cellColor: td.color,
        headWeight: Number(th.fontWeight),
        sideRule: td.borderLeftStyle,
      };
    });
    expect(look.headRule).toBe("solid");
    expect(look.headRuleColor).not.toBe(look.rowRuleColor);
    expect(look.headColor).not.toBe(look.cellColor);
    expect(look.headWeight).toBeGreaterThanOrEqual(500);
    expect(look.sideRule).toBe("none");
  });

  // --- 3.12: Toggle ---
  test("Toggle block renders as <details> with <summary>", async ({ page }) => {
    const toggles = page.locator('[data-block-type="toggle"]');
    const count = await toggles.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // First toggle should be open
    const firstToggle = toggles.first();
    await expect(firstToggle).toBeVisible();

    // Check it's a <details> element
    const tagName = await firstToggle.evaluate((el) =>
      el.tagName.toLowerCase()
    );
    expect(tagName).toBe("details");

    // Check it has <summary>
    const summary = firstToggle.locator("summary");
    await expect(summary).toBeVisible();
    const summaryText = await summary.textContent();
    expect(summaryText).toContain("Click to expand/collapse");

    // First toggle is open - should show children
    const isOpen = await firstToggle.evaluate((el) =>
      el.hasAttribute("open")
    );
    expect(isOpen).toBe(true);

    // Screenshot of open toggle
    await firstToggle.screenshot({
      path: test.info().outputPath("phase3-toggle-open.png"),
    });
  });

  test("Closed toggle hides its children", async ({ page }) => {
    const toggles = page.locator('[data-block-type="toggle"]');
    // Second toggle should be closed
    const closedToggle = toggles.nth(1);
    await expect(closedToggle).toBeVisible();

    const isOpen = await closedToggle.evaluate((el) =>
      el.hasAttribute("open")
    );
    expect(isOpen).toBe(false);

    // Screenshot of closed toggle
    await closedToggle.screenshot({
      path: test.info().outputPath("phase3-toggle-closed.png"),
    });
  });

  test("Toggle children are visible when open", async ({ page }) => {
    const firstToggle = page.locator('[data-block-type="toggle"]').first();

    // Check that nested content is visible
    const nestedParagraph = firstToggle.locator('[data-block-type="paragraph"]');
    await expect(nestedParagraph.first()).toBeVisible();

    const nestedList = firstToggle.locator('[data-block-type="bulletList"]');
    await expect(nestedList.first()).toBeVisible();
  });

  // --- 3.13: Columns ---
  test("Columns block renders with side-by-side layout", async ({ page }) => {
    const columns = page.locator('[data-block-type="columns"]');
    await expect(columns.first()).toBeVisible();

    // Should have .gotipe-columns class
    const hasClass = await columns
      .first()
      .evaluate((el) => el.classList.contains("gotipe-columns"));
    expect(hasClass).toBe(true);

    // Should contain 2 column children
    const columnChildren = columns
      .first()
      .locator('[data-block-type="column"]');
    expect(await columnChildren.count()).toBe(2);

    // Screenshot
    await columns.first().screenshot({
      path: test.info().outputPath("phase3-columns.png"),
    });
  });

  test("Columns have flex layout (side-by-side)", async ({ page }) => {
    const columns = page.locator('[data-block-type="columns"]').first();
    await expect(columns).toBeVisible();

    const display = await columns.evaluate(
      (el) => getComputedStyle(el).display
    );
    expect(display).toBe("flex");

    // Each column should have flex: 1
    const col1 = columns.locator('[data-block-type="column"]').first();
    const col2 = columns.locator('[data-block-type="column"]').nth(1);

    const col1Flex = await col1.evaluate(
      (el) => getComputedStyle(el).flexGrow
    );
    const col2Flex = await col2.evaluate(
      (el) => getComputedStyle(el).flexGrow
    );
    expect(col1Flex).toBe("1");
    expect(col2Flex).toBe("1");
  });

  test("Columns contain nested content", async ({ page }) => {
    const columns = page.locator('[data-block-type="columns"]').first();
    const col1 = columns.locator('[data-block-type="column"]').first();
    const col2 = columns.locator('[data-block-type="column"]').nth(1);

    // Left column has heading
    const leftHeading = col1.locator("h3");
    await expect(leftHeading).toBeVisible();
    const leftText = await leftHeading.textContent();
    expect(leftText).toContain("Left Column");

    // Right column has heading
    const rightHeading = col2.locator("h3");
    await expect(rightHeading).toBeVisible();
    const rightText = await rightHeading.textContent();
    expect(rightText).toContain("Right Column");
  });
});
