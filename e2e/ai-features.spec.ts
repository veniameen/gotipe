import { type Page, expect, test } from "@playwright/test";

async function setup(page: Page, first = "First paragraph", last = "Last paragraph") {
  await page.goto("/#ai");
  await expect(page.locator('[data-gotipe-example="ai"]')).toBeVisible();
  await page.waitForFunction(() => !!window.__GOTIPE_EDITOR__);
  await page.evaluate(
    ({ first, last }) => {
      const editor = window.__GOTIPE_EDITOR__!;
      editor.setContent({
        version: 1,
        blocks: [first, last].map((text, index) => ({
          id: `ai-test-${index}`,
          type: "paragraph",
          attrs: {},
          content: [{ text, marks: [] }],
          children: [],
        })),
      });
      editor.setSelection({
        anchor: { blockId: "ai-test-0", offset: 0 },
        head: { blockId: "ai-test-0", offset: 0 },
      });
    },
    { first, last },
  );
}
async function open(page: Page) {
  await page.locator('[data-block-id="ai-test-0"]').click();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog", { name: "AI command bar" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "AI prompt" })).toBeFocused();
}
const content = (page: Page) => page.evaluate(() => window.__GOTIPE_EDITOR__!.getJSON());

test("AI keyboard ownership, empty state, Escape and read-only", async ({ page }) => {
  await setup(page);
  await page.locator("h1").click();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog", { name: "AI command bar" })).toHaveCount(0);
  await open(page);
  await expect(page.getByRole("button", { name: "Submit AI command" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "AI command bar" })).toHaveCount(0);
  await page.evaluate(() => window.__GOTIPE_EDITOR__!.setEditable(false));
  await page.locator('[data-block-id="ai-test-0"]').click();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByRole("dialog", { name: "AI command bar" })).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.__GOTIPE_EDITOR__!.getText()))
    .toBe("First paragraph\nLast paragraph");
});

test("generated paragraph goes after the requested block and is one undo", async ({ page }) => {
  await setup(page);
  const before = await content(page);
  await open(page);
  await page.getByRole("textbox", { name: "AI prompt" }).fill("volcanoes");
  await page.getByRole("button", { name: "Submit AI command" }).click();
  await expect(page.getByRole("button", { name: "Submit AI command" })).toBeDisabled();
  await expect(page.locator("[data-gotipe-ai-status]")).toBeVisible();
  await expect.poll(async () => (await content(page)).blocks.length).toBe(3);
  const after = await content(page);
  expect(after.blocks[0]!.id).toBe("ai-test-0");
  expect(after.blocks[2]!.id).toBe("ai-test-1");
  expect(JSON.stringify(after.blocks[1]!.content)).toContain("volcanoes");
  await expect(page.getByRole("dialog", { name: "AI command bar" })).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await content(page)).blocks).toEqual(before.blocks);
});

test("cancelling a running request leaves no partial block or undo entry", async ({ page }) => {
  await setup(page);
  const before = await content(page);
  await open(page);
  await page.getByRole("textbox", { name: "AI prompt" }).fill("cancel this generation");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Cancel AI command" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel AI command" }).click();
  await expect(page.locator("[data-gotipe-ai-status]")).toHaveCount(0);
  // Waiting past the provider's next chunk proves an ignored late result cannot insert.
  await page.waitForTimeout(1200);
  expect((await content(page)).blocks).toEqual(before.blocks);
  expect(await page.evaluate(() => window.__GOTIPE_EDITOR__!.getViewState().toolbar.canUndo)).toBe(
    false,
  );
});

test("provider failure keeps prompt visible, supports retry and never inserts partial output", async ({
  page,
}) => {
  await setup(page);
  const before = await content(page);
  await page.evaluate(async () => {
    const mockAiProvider = window.__GOTIPE_AI_PROVIDER__!;
    mockAiProvider.generateParagraph = async function* () {
      yield "partial";
      throw new Error("Temporary mock provider failure");
    };
  });
  await open(page);
  await page.getByRole("textbox", { name: "AI prompt" }).fill("retry topic");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Temporary mock provider failure");
  await expect(page.getByRole("textbox", { name: "AI prompt" })).toHaveValue("retry topic");
  expect((await content(page)).blocks).toEqual(before.blocks);
  await page.evaluate(async () => {
    const mockAiProvider = window.__GOTIPE_AI_PROVIDER__!;
    mockAiProvider.generateParagraph = async function* () {
      yield "Recovered";
    };
  });
  await page.getByRole("button", { name: "Submit AI command" }).click();
  await expect
    .poll(async () => JSON.stringify((await content(page)).blocks))
    .toContain("Recovered");
});

test("proofread accepts all corrections atomically and undo restores original text", async ({
  page,
}) => {
  await setup(page, "To be determined soon", "Another to be determined item");
  const before = await content(page);
  await page.getByRole("button", { name: "Proofread", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: "AI suggestions" })).toBeVisible();
  await page.getByRole("button", { name: "Accept all suggestions" }).click();
  await expect
    .poll(() => page.evaluate(() => window.__GOTIPE_EDITOR__!.getText()))
    .toBe("yet to be finalized soon\nAnother yet to be finalized item");
  await page.locator('[data-block-id="ai-test-0"]').click();
  await page.keyboard.press("ControlOrMeta+z");
  expect((await content(page)).blocks).toEqual(before.blocks);
});

test("ghost completion accepts only in the owning editor and stays inside a resized viewport", async ({
  page,
}) => {
  await setup(page, "Hello", "Last paragraph");
  await page.locator('[data-block-id="ai-test-0"]').click();
  await page.keyboard.press("End");
  await page.keyboard.type(" world");
  const ghost = page.locator("[data-gotipe-ghost-text]");
  await expect(ghost).toBeVisible({ timeout: 5000 });
  await page.setViewportSize({ width: 375, height: 720 });
  await expect(ghost).toBeVisible();
  const bounds = await ghost.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  const text = await ghost.textContent();
  await page.keyboard.press("Tab");
  await expect
    .poll(() => page.evaluate(() => window.__GOTIPE_EDITOR__!.getText()))
    .toContain(`Hello world${text}`);
});

test("AI controls fit at 320px in light and dark with a long error", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await setup(page);
  await page.evaluate(async () => {
    const mockAiProvider = window.__GOTIPE_AI_PROVIDER__!;
    mockAiProvider.generateParagraph = async function* () {
      yield "";
      throw new Error("A-long-provider-error-without-spaces-".repeat(8));
    };
  });
  for (const theme of ["light", "dark"]) {
    const themeControl = page.getByRole("banner").getByRole("radio", {
      name: theme === "dark" ? "Dark theme" : "Light theme",
      exact: true,
    });
    await themeControl.click();
    await expect(themeControl).toHaveAttribute("aria-checked", "true");
    await open(page);
    await page.getByRole("textbox", { name: "AI prompt" }).fill("topic");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toBeVisible();
    const bar = page.getByRole("dialog", { name: "AI command bar" });
    const bounds = await bar.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    for (const button of await bar.getByRole("button").all()) {
      const rect = await button.boundingBox();
      expect(rect!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    }
    expect(await bar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/ai-320-${theme}.png`, fullPage: true });
    await page.getByRole("button", { name: "Close AI command bar" }).click();
  }
});
