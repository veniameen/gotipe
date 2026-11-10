import { expect, test, type Page } from "@playwright/test";
import {
  bulletList,
  clickBlockAt,
  heading,
  openNotionAndReset,
  paragraph,
  setCaretAt,
  setNotionContent,
  todoList,
  type BlockInput,
} from "./helpers/notion-checklist";

const TARGET_ID = "batch4-target";
const LIST_ID = "batch4-list";
const OPS = [
  "slash_open",
  "slash_query",
  "arrow_down_enter",
  "arrow_up_enter",
  "esc",
  "click_outside",
  "no_results",
  "backspace_to_empty",
] as const;

type Op = (typeof OPS)[number];
type Ctx = "end_heading" | "bullet_empty" | "todo_text" | "after_paste" | "near_bottom" | "near_right" | "dark_theme";

const CASES: Array<{ id: string; ctx: Ctx; op: Op }> = [
  { id: "NL-151", ctx: "end_heading", op: "no_results" },
  { id: "NL-152", ctx: "end_heading", op: "backspace_to_empty" },
];
let seq = 153;
for (const ctx of ["bullet_empty", "todo_text", "after_paste", "near_bottom", "near_right", "dark_theme"] as const) {
  for (const op of OPS) {
    CASES.push({ id: `NL-${seq}`, ctx, op });
    seq += 1;
  }
}
if (seq !== 201 || CASES.length !== 50) throw new Error("Expected NL-151..NL-200 (50 cases)");

async function syncSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { syncSelectionFromDOM?: () => void }
      | undefined;
    editor?.syncSelectionFromDOM?.();
  });
}

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.getByRole("banner").getByRole("radio", { name: theme === "dark" ? "Dark theme" : "Light theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function setupContext(page: Page, ctx: Ctx): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await setTheme(page, "light");

  if (ctx === "end_heading") {
    await setNotionContent(page, [heading(TARGET_ID, 1, "Heading slash seed ")]);
    await setCaretAt(page, TARGET_ID, "end");
    await syncSelection(page);
    return;
  }

  if (ctx === "bullet_empty") {
    await setNotionContent(page, [bulletList(LIST_ID, TARGET_ID, "")]);
    await setCaretAt(page, TARGET_ID, "start");
    await syncSelection(page);
    return;
  }

  if (ctx === "todo_text") {
    await setNotionContent(page, [todoList(LIST_ID, TARGET_ID, "Todo seed text ")]);
    await setCaretAt(page, TARGET_ID, "start");
    await syncSelection(page);
    return;
  }

  if (ctx === "after_paste") {
    // Deterministic post-paste state: inserted text with caret at end.
    await setNotionContent(page, [paragraph(TARGET_ID, "Pasted seed text ")]);
    await setCaretAt(page, TARGET_ID, "end");
    await syncSelection(page);
    return;
  }

  if (ctx === "near_bottom") {
    await page.setViewportSize({ width: 1280, height: 420 });
    const blocks: BlockInput[] = [];
    for (let i = 0; i < 16; i += 1) blocks.push(paragraph(`nb-${i}`, `line-${i}`));
    blocks.push(paragraph(TARGET_ID, "Bottom seed "));
    await setNotionContent(page, blocks);
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      window.scrollBy({ top: rect.top - window.innerHeight + 46, behavior: "instant" as ScrollBehavior });
    }, TARGET_ID);
    await setCaretAt(page, TARGET_ID, "end");
    await syncSelection(page);
    return;
  }

  if (ctx === "near_right") {
    await page.setViewportSize({ width: 1024, height: 720 });
    await setNotionContent(page, [paragraph(TARGET_ID, "Right edge seed ")]);
    await clickBlockAt(page, TARGET_ID, "end");
    await syncSelection(page);
    return;
  }

  await setNotionContent(page, [paragraph(TARGET_ID, "Dark seed ")]);
  await setTheme(page, "dark");
  await setCaretAt(page, TARGET_ID, "end");
  await syncSelection(page);
}

async function assertMenuPlacement(page: Page, ctx: Ctx): Promise<void> {
  const info = await page.evaluate(() => {
    const menu = document.querySelector("[data-gotipe-slash-menu]") as HTMLElement | null;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
    if (range) range.collapse(true);
    const caret = range?.getBoundingClientRect() ?? null;
    const menuRect = menu?.getBoundingClientRect() ?? null;
    const bg = menu ? getComputedStyle(menu).backgroundColor : null;
    const rootTheme = document.documentElement.getAttribute("data-theme");
    if (!caret || !menuRect) return null;
    return {
      vw: window.innerWidth,
      topLeftSafe: menuRect.left > 8 && menuRect.top > 8,
      rightSafe: menuRect.right <= window.innerWidth - 4,
      caretX: caret.left,
      menuTop: menuRect.top,
      caretTop: caret.top,
      bg,
      rootTheme,
    };
  });

  expect(info).not.toBeNull();
  expect(info?.topLeftSafe).toBe(true);
  expect(info?.rightSafe).toBe(true);

  if (ctx === "near_bottom") expect((info?.menuTop ?? 9999) <= (info?.caretTop ?? 0) + 8).toBe(true);
  if (ctx === "near_right") expect((info?.caretX ?? 0) > (info?.vw ?? 0) * 0.25).toBe(true);
  if (ctx === "dark_theme") {
    expect(info?.rootTheme).toBe("dark");
    expect(info?.bg ?? "").not.toContain("255, 255, 255");
  }
}

async function closePathStillEditable(page: Page, id: string, op: Op): Promise<void> {
  await expect(page.locator("[data-gotipe-slash-menu]")).toBeHidden();
  if (op === "click_outside") await page.locator("[data-gotipe-content]").click();
  const marker = `mk_${id.toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;
  await page.keyboard.type(marker);
  await expect.poll(async () =>
    page.evaluate((needle) => (document.body.textContent ?? "").includes(needle), marker),
  ).toBe(true);
}

test.describe("Notion-like checklist batch NL-151..NL-200", () => {
  test.beforeEach(async ({ page }) => openNotionAndReset(page));

  for (const c of CASES) {
    test(`${c.id}: ${c.ctx} (${c.op})`, async ({ page }) => {
      await setupContext(page, c.ctx);

      if (c.op === "slash_open") {
        await page.keyboard.type("/");
        await expect(page.locator("[data-gotipe-slash-menu]")).toBeVisible();
        await assertMenuPlacement(page, c.ctx);
        return;
      }

      if (c.op === "slash_query") {
        await page.keyboard.type("/to");
        const menu = page.locator("[data-gotipe-slash-menu]");
        await expect(menu).toBeVisible();
        await expect(menu).toContainText(/To-do List/i);
        return;
      }

      if (c.op === "no_results") {
        await page.keyboard.type("/zzzzzz");
        await expect(page.locator("[data-gotipe-slash-menu]")).toBeVisible();
        await expect(page.locator(".gotipe-slash-menu-empty")).toHaveText("No results");
        return;
      }

      if (c.op === "backspace_to_empty") {
        await page.keyboard.type("/");
        const menu = page.locator("[data-gotipe-slash-menu]");
        await expect(menu).toBeVisible();
        const baseline = await page.locator("[data-gotipe-slash-item]").count();
        await page.keyboard.type("to");
        const filtered = await page.locator("[data-gotipe-slash-item]").count();
        expect(filtered).toBeGreaterThan(0);
        expect(filtered).toBeLessThanOrEqual(baseline);
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Backspace");
        await expect(menu).toBeVisible();
        const restored = await page.locator("[data-gotipe-slash-item]").count();
        expect(restored).toBeGreaterThanOrEqual(filtered);
        expect(restored).toBeLessThanOrEqual(baseline);
        return;
      }

      await page.keyboard.type("/");
      await expect(page.locator("[data-gotipe-slash-menu]")).toBeVisible();
      await assertMenuPlacement(page, c.ctx);

      if (c.op === "arrow_down_enter") {
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
      } else if (c.op === "arrow_up_enter") {
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Enter");
      } else if (c.op === "esc") {
        await page.keyboard.press("Escape");
      } else if (c.op === "click_outside") {
        await page.mouse.click(12, 12);
      }

      await closePathStillEditable(page, c.id, c.op);
    });
  }
});
