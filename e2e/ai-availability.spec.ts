import { type Page, expect, test } from "@playwright/test";

/** Opens an example with one paragraph and selects its text, so the formatting bubble shows. */
async function selectParagraph(page: Page, url: string, example: string) {
  await page.goto(url);
  await page.waitForSelector(`[data-gotipe-example="${example}"]`);
  await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
  await page.evaluate(() =>
    window.__GOTIPE_EDITOR__!.setContent({
      version: 1,
      blocks: [
        {
          id: "ai-words",
          type: "paragraph",
          attrs: {},
          content: [{ text: "Plain words", marks: [] }],
          children: [],
        },
      ],
    }),
  );
  await page.locator('[data-block-id="ai-words"]').click();
  await page.keyboard.press("ControlOrMeta+a");
  const bubble = page.locator("[data-gotipe-bubble-menu]");
  await expect(bubble.locator('[data-mark="bold"]')).toBeVisible();
  return bubble;
}

test("an editor without the AI extension has no Improve, no ⌘J and no AI line", async ({
  page,
}) => {
  // The basic example leaves `showAiCommandBar` at its default and has no AI extension.
  const bubble = await selectParagraph(page, "/?view=block#basic", "basic");
  await expect(bubble.locator(".gotipe-bubble-model")).toHaveCount(0);
  await expect(bubble.locator("button").first()).toHaveClass(/gotipe-block-type-trigger/);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ControlOrMeta+j");
  await expect(page.locator("[data-gotipe-ai-command-bar]")).toHaveCount(0);
  await expect(page.locator("[data-gotipe-ai-status]")).toHaveCount(0);
  await expect(page.getByText("AI is not available")).toHaveCount(0);
});

test("with the AI extensions Improve leads the bubble and ⌘J opens the bar", async ({ page }) => {
  const bubble = await selectParagraph(page, "/#ai", "ai");
  await expect(bubble.locator("button").first()).toHaveClass(/gotipe-bubble-model/);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ControlOrMeta+j");
  await expect(page.getByRole("dialog", { name: "AI command bar" })).toBeVisible();
});
