import { expect, test, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { openNotionAndReset, setNotionContent, type BlockInput } from "./helpers/notion-checklist";
import { undo } from "./helpers/notion-crossblock";

const ARTIFACT_DIR = path.resolve(process.cwd(), "output/playwright/notion-like-headed-gutter-jitter");

function spans(text: string) {
  return [{ text, marks: [] }];
}

function buildDoc(seed: string): BlockInput[] {
  return [
    { id: "h1", type: "heading", attrs: { level: 1 }, content: spans(`${seed}-h1`), children: [] },
    { id: "p1", type: "paragraph", attrs: {}, content: spans(`${seed}-p1`), children: [] },
    {
      id: "bl",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        { id: "li1", type: "listItem", attrs: {}, content: spans(`${seed}-li1`), children: [] },
        { id: "li2", type: "listItem", attrs: {}, content: spans(`${seed}-li2`), children: [] },
      ],
    },
    {
      id: "tl",
      type: "todoList",
      attrs: {},
      content: null,
      children: [
        { id: "ti1", type: "todoItem", attrs: { checked: false }, content: spans(`${seed}-ti1`), children: [] },
      ],
    },
    { id: "code", type: "codeBlock", attrs: { language: "plaintext" }, content: `${seed}-code`, children: [] },
    { id: "quote", type: "blockquote", attrs: {}, content: spans(`${seed}-quote`), children: [] },
    { id: "call", type: "callout", attrs: { tone: "info" }, content: spans(`${seed}-callout`), children: [] },
    { id: "tail", type: "paragraph", attrs: {}, content: spans(`${seed}-tail`), children: [] },
  ];
}

function ensureArtifactsDir() {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function saveShot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  ensureArtifactsDir();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(ARTIFACT_DIR, `${ts}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
}

async function topLevelIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")).map(
      (el) => (el as HTMLElement).getAttribute("data-block-id") ?? "",
    ),
  );
}

async function readHoverPoint(page: Page, blockId: string): Promise<{ textX: number; gutterX: number; y: number }> {
  const point = await page.evaluate((id) => {
    const block = document.querySelector(`[data-gotipe-content] > [data-block-id="${id}"]`) as HTMLElement | null;
    if (!block) return null;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let textLeft = block.getBoundingClientRect().left + 20;
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const text = n.textContent ?? "";
      if (!text.trim()) continue;
      const r = document.createRange();
      r.setStart(n, 0);
      r.setEnd(n, Math.min(1, text.length));
      const rect = r.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        textLeft = rect.left;
        break;
      }
    }
    const br = block.getBoundingClientRect();
    return {
      textX: textLeft + 10,
      gutterX: Math.max(4, textLeft - 28),
      y: br.top + Math.min(20, Math.max(10, br.height / 2)),
    };
  }, blockId);
  expect(point).not.toBeNull();
  return point!;
}

async function jitterHover(page: Page, blockId: string, wobble = 8): Promise<void> {
  const point = await readHoverPoint(page, blockId);
  await page.mouse.move(5, 5);
  await page.mouse.move(point.textX, point.y, { steps: 1 });
  for (let i = 0; i < wobble; i++) {
    const x = point.textX + ((i % 2 === 0 ? 1 : -1) * (6 + (i % 4)));
    const y = point.y + ((i % 3) - 1) * 3;
    await page.mouse.move(x, y, { steps: 1 });
  }
  await page.mouse.move(point.gutterX, point.y, { steps: 1 });
}

async function expectToolbarAligned(page: Page, blockId: string): Promise<void> {
  const handle = page.locator(`[data-block-drag="${blockId}"]`);
  for (let attempt = 0; attempt < 6; attempt++) {
    if (await handle.isVisible()) break;
    await jitterHover(page, blockId, 5);
    await page.waitForTimeout(35);
  }
  await expect(handle).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate((id) => {
        const block = document.querySelector(`[data-gotipe-content] > [data-block-id="${id}"]`) as HTMLElement | null;
        const wrap = document.querySelector(".gotipe-block-toolbar-wrapper") as HTMLElement | null;
        if (!block || !wrap) return "missing";
        const br = block.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        const topOk = Math.abs(wr.top - br.top) < 28;
        const leftOk = wr.left < br.left;
        return `${topOk}|${leftOk}`;
      }, blockId),
    )
    .toBe("true|true");
}

test.describe("Notion-like headed gutter jitter exploratory", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("HEAD-JITTER-001: rapid row-to-row jitter keeps toolbar attached", async ({ page }, testInfo) => {
    const seed = `hj1-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, buildDoc(seed));
    await saveShot(page, testInfo, "head-jitter-001-start");

    const ids = await topLevelIds(page);
    for (let i = 0; i < 40; i++) {
      const blockId = ids[i % ids.length]!;
      await jitterHover(page, blockId, 9);
      await expectToolbarAligned(page, blockId);
    }

    await saveShot(page, testInfo, "head-jitter-001-end");
  });

  test("HEAD-JITTER-002: plus remains clickable after jitter bursts", async ({ page }, testInfo) => {
    const seed = `hj2-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, buildDoc(seed));
    await saveShot(page, testInfo, "head-jitter-002-start");

    const ids = await topLevelIds(page);
    for (let i = 0; i < 16; i++) {
      const blockId = ids[i % ids.length]!;
      const before = await topLevelIds(page);
      await jitterHover(page, blockId, 10);
      await expectToolbarAligned(page, blockId);
      await page.locator('[aria-label="Click to add below. Option-click to add a block above"]').click();
      await expect.poll(() => topLevelIds(page).then((arr) => arr.length)).toBe(before.length + 1);
      await undo(page, 1);
      await expect.poll(() => topLevelIds(page)).toEqual(before);
    }

    await saveShot(page, testInfo, "head-jitter-002-end");
  });

  test("HEAD-JITTER-003: drag-handle context menu stable under jitter", async ({ page }, testInfo) => {
    const seed = `hj3-${Math.random().toString(36).slice(2, 7)}`;
    await setNotionContent(page, buildDoc(seed));
    await saveShot(page, testInfo, "head-jitter-003-start");

    const ids = await topLevelIds(page);
    for (let i = 0; i < 18; i++) {
      const blockId = ids[i % ids.length]!;
      await jitterHover(page, blockId, 8);
      await expectToolbarAligned(page, blockId);
      await page.locator(`[data-block-drag="${blockId}"]`).click();
      await expect(page.locator("[data-gotipe-context-menu]")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-gotipe-context-menu]")).toBeHidden();
    }

    await saveShot(page, testInfo, "head-jitter-003-end");
  });
});
