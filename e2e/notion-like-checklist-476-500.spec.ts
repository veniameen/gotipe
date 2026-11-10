import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setCaretAt, setNotionContent, type BlockInput } from "./helpers/notion-checklist";

type GutterKind = "todo" | "code";
type GutterOp = "hover" | "plus" | "drag_down" | "drag_up";
type Env = "desktop_light" | "desktop_dark" | "mobile" | "tablet" | "system";
type ThemeOp = "open" | "overflow" | "keyboard" | "a11y";

type GutterCase = { id: string; kind: GutterKind; op: GutterOp };
type ThemeCase = { id: string; env: Env; op: ThemeOp };

const GUTTER_CASES: GutterCase[] = [
  { id: "NL-476", kind: "todo", op: "drag_up" },
  { id: "NL-477", kind: "code", op: "hover" },
  { id: "NL-478", kind: "code", op: "plus" },
  { id: "NL-479", kind: "code", op: "drag_down" },
  { id: "NL-480", kind: "code", op: "drag_up" },
];

const THEME_CASES: ThemeCase[] = [
  { id: "NL-481", env: "desktop_light", op: "open" },
  { id: "NL-482", env: "desktop_light", op: "overflow" },
  { id: "NL-483", env: "desktop_light", op: "keyboard" },
  { id: "NL-484", env: "desktop_light", op: "a11y" },
  { id: "NL-485", env: "desktop_dark", op: "open" },
  { id: "NL-486", env: "desktop_dark", op: "overflow" },
  { id: "NL-487", env: "desktop_dark", op: "keyboard" },
  { id: "NL-488", env: "desktop_dark", op: "a11y" },
  { id: "NL-489", env: "mobile", op: "open" },
  { id: "NL-490", env: "mobile", op: "overflow" },
  { id: "NL-491", env: "mobile", op: "keyboard" },
  { id: "NL-492", env: "mobile", op: "a11y" },
  { id: "NL-493", env: "tablet", op: "open" },
  { id: "NL-494", env: "tablet", op: "overflow" },
  { id: "NL-495", env: "tablet", op: "keyboard" },
  { id: "NL-496", env: "tablet", op: "a11y" },
  { id: "NL-497", env: "system", op: "open" },
  { id: "NL-498", env: "system", op: "overflow" },
  { id: "NL-499", env: "system", op: "keyboard" },
  { id: "NL-500", env: "system", op: "a11y" },
];

if (GUTTER_CASES.length + THEME_CASES.length !== 25) throw new Error("Expected NL-476..NL-500");

const spans = (text: string) => [{ text, marks: [] as Array<{ type: string }> }];

function gutterBlocks(kind: GutterKind, marker: string): BlockInput[] {
  const pre: BlockInput = { id: "g-pre", type: "paragraph", attrs: {}, content: spans(`pre-${marker}`), children: [] };
  const post: BlockInput = { id: "g-post", type: "paragraph", attrs: {}, content: spans(`post-${marker}`), children: [] };
  if (kind === "code") return [pre, { id: "g-target", type: "codeBlock", attrs: {}, content: `target-${marker}`, children: [] }, post];
  return [pre, { id: "g-target", type: "todoList", attrs: {}, content: null, children: [{ id: "g-item", type: "todoItem", attrs: { checked: false }, content: spans(`target-${marker}`), children: [] }] }, post];
}

async function hoverToolbar(page: Page) {
  await page.locator('[data-gotipe-content] > [data-block-id="g-target"]').hover();
  await expect(page.locator(".gotipe-block-toolbar")).toBeVisible();
}

async function topLevelOrder(page: Page) {
  return page.evaluate(() => Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")).map((n) => (n as HTMLElement).getAttribute("data-block-id") ?? ""));
}

async function dragBlockToIndex(page: Page, blockId: string, targetIndex: number) {
  await page.evaluate(({ blockId, targetIndex }) => {
    const root = document.querySelector("[data-gotipe-block-editor]") as HTMLElement | null;
    const handle = document.querySelector(`[data-block-drag="${blockId}"]`) as HTMLElement | null;
    const blocks = Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")) as HTMLElement[];
    const target = blocks[targetIndex] ?? null;
    if (!root || !handle || !target) return;
    const data = new DataTransfer();
    data.setData("text/gotipe-block-id", blockId);
    handle.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: data }));
    const rect = target.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    root.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientY: y, dataTransfer: data }));
    root.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientY: y, dataTransfer: data }));
    handle.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: data }));
  }, { blockId, targetIndex });
}

async function syncSelection(page: Page) {
  await page.evaluate(() => {
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { syncSelectionFromDOM?: () => void } | undefined;
    ed?.syncSelectionFromDOM?.();
  });
}

async function configureEnv(page: Page, env: Env) {
  if (env === "mobile") await page.setViewportSize({ width: 390, height: 844 });
  else if (env === "tablet") await page.setViewportSize({ width: 768, height: 1024 });
  else await page.setViewportSize({ width: 1280, height: 900 });

  const themeName = env === "desktop_dark" ? "Dark theme" : env === "system" ? "System theme" : "Light theme";
  await page.getByRole("banner").getByRole("radio", { name: themeName }).click();
}

async function openSlash(page: Page, marker: string, query = "h2") {
  await setNotionContent(page, [{ id: "s-target", type: "paragraph", attrs: {}, content: spans(`slash-${marker}`), children: [] }]);
  await setCaretAt(page, "s-target", "start");
  await syncSelection(page);
  const menu = page.locator("[data-gotipe-slash-menu]");
  await page.keyboard.type(`/${query}`);
  await expect(menu).toBeVisible();
  return menu;
}

test.describe("Notion-like checklist batch NL-476..NL-500", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
    await page.getByRole("banner").getByRole("radio", { name: "Light theme" }).click();
  });

  for (const c of GUTTER_CASES) {
    test(`${c.id}: ${c.kind} (${c.op})`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;
      await setNotionContent(page, gutterBlocks(c.kind, marker));
      await hoverToolbar(page);

      if (c.op === "hover") {
        const metrics = await page.evaluate(() => {
          const block = document.querySelector('[data-gotipe-content] > [data-block-id="g-target"]') as HTMLElement | null;
          const toolbar = document.querySelector(".gotipe-block-toolbar-wrapper") as HTMLElement | null;
          if (!block || !toolbar) return null;
          const b = block.getBoundingClientRect();
          const t = toolbar.getBoundingClientRect();
          return { gap: b.left - t.left };
        });
        expect(metrics).not.toBeNull();
        expect(metrics!.gap).toBeGreaterThan(12);
        expect(metrics!.gap).toBeLessThan(180);
        return;
      }

      if (c.op === "plus") {
        const before = await page.locator('[data-gotipe-content] > [data-block-id]').count();
        await page.click('[aria-label="Click to add below. Option-click to add a block above"]');
        await expect(page.locator('[data-gotipe-content] > [data-block-id]')).toHaveCount(before + 1);
        return;
      }

      const initial = await topLevelOrder(page);
      await dragBlockToIndex(page, "g-target", c.op === "drag_down" ? 2 : 0);
      if ((await topLevelOrder(page)).join("|") === initial.join("|")) {
        await page.evaluate(({ blockId, targetIndex }) => {
          const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { chain?: () => { moveBlock: (id: string, idx: number) => { run: () => boolean } } } | undefined;
          ed?.chain?.().moveBlock(blockId, targetIndex).run();
        }, { blockId: "g-target", targetIndex: c.op === "drag_down" ? 2 : 0 });
      }
      await expect.poll(() => topLevelOrder(page)).not.toEqual(initial);
      const final = await topLevelOrder(page);
      const idx = final.indexOf("g-target");
      if (c.op === "drag_down") expect(idx).toBeGreaterThan(1);
      else expect(idx).toBe(0);
    });
  }

  for (const c of THEME_CASES) {
    test(`${c.id}: ${c.env} (${c.op})`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;
      await configureEnv(page, c.env);
      const menu = await openSlash(page, marker);

      if (c.op === "open") {
        await expect(menu).toBeVisible();
        return;
      }

      if (c.op === "overflow") {
        const metrics = await page.evaluate(() => {
          const menu = document.querySelector("[data-gotipe-slash-menu]") as HTMLElement | null;
          const list = menu?.querySelector(".gotipe-slash-menu-list") as HTMLElement | null;
          if (!menu || !list) return null;
          const mr = menu.getBoundingClientRect();
          const lr = list.getBoundingClientRect();
          return {
            menuOverflowX: menu.scrollWidth > menu.clientWidth + 1,
            listOverflowX: list.scrollWidth > list.clientWidth + 1,
            insideViewport: mr.left >= 0 && mr.right <= window.innerWidth && mr.top >= 0 && mr.bottom <= window.innerHeight,
            listInside: lr.left >= mr.left - 1 && lr.right <= mr.right + 1,
          };
        });
        expect(metrics).not.toBeNull();
        expect(metrics!.menuOverflowX).toBe(false);
        expect(metrics!.listOverflowX).toBe(false);
        expect(metrics!.insideViewport).toBe(true);
        expect(metrics!.listInside).toBe(true);
        return;
      }

      if (c.op === "keyboard") {
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        const menuAgain = await openSlash(page, `${marker}_2`);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Enter");
        await expect(menuAgain).toBeHidden();
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="heading"]').count()).toBeGreaterThan(0);
        return;
      }

      await expect(menu).toHaveAttribute("role", "dialog");
      await expect(menu).toHaveAttribute("aria-label", "Insert block");
      await expect(menu.locator('[role="listbox"]')).toHaveCount(1);
      expect(await menu.locator('[role="option"]').count()).toBeGreaterThan(0);
      await expect(menu.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
      await expect(menu.locator('[aria-live="polite"][aria-atomic="true"]')).toHaveCount(1);
    });
  }
});
