import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setCaretAt, setNotionContent, type BlockInput } from "./helpers/notion-checklist";

type Op = "click_checkbox" | "caret_empty" | "type_text" | "enter_nonempty" | "enter_empty" | "todo_to_bullet" | "bullet_to_todo";
type Variant = "undo" | "slash" | "dark";
type C = { id: string; variant: Variant; op: Op };

const CASES: C[] = [
  { id: "NL-371", variant: "undo", op: "caret_empty" },
  { id: "NL-372", variant: "undo", op: "type_text" },
  { id: "NL-373", variant: "undo", op: "enter_nonempty" },
  { id: "NL-374", variant: "undo", op: "enter_empty" },
  { id: "NL-375", variant: "undo", op: "todo_to_bullet" },
  { id: "NL-376", variant: "undo", op: "bullet_to_todo" },
  { id: "NL-377", variant: "slash", op: "click_checkbox" },
  { id: "NL-378", variant: "slash", op: "caret_empty" },
  { id: "NL-379", variant: "slash", op: "type_text" },
  { id: "NL-380", variant: "slash", op: "enter_nonempty" },
  { id: "NL-381", variant: "slash", op: "enter_empty" },
  { id: "NL-382", variant: "slash", op: "todo_to_bullet" },
  { id: "NL-383", variant: "slash", op: "bullet_to_todo" },
  { id: "NL-384", variant: "dark", op: "click_checkbox" },
  { id: "NL-385", variant: "dark", op: "caret_empty" },
  { id: "NL-386", variant: "dark", op: "type_text" },
  { id: "NL-387", variant: "dark", op: "enter_nonempty" },
  { id: "NL-388", variant: "dark", op: "enter_empty" },
  { id: "NL-389", variant: "dark", op: "todo_to_bullet" },
  { id: "NL-390", variant: "dark", op: "bullet_to_todo" },
];

if (CASES.length !== 20) throw new Error("Expected 20 cases for NL-371..NL-390");

function spans(text: string, marks: Array<{ type: string }> = []) {
  return [{ text, marks }];
}

function todoList(listId: string, items: Array<{ id: string; text: string }>): BlockInput {
  return {
    id: listId,
    type: "todoList",
    attrs: {},
    content: null,
    children: items.map((it) => ({ id: it.id, type: "todoItem", attrs: { checked: false }, content: spans(it.text), children: [] })),
  };
}

function bulletList(listId: string, items: Array<{ id: string; text: string }>): BlockInput {
  return {
    id: listId,
    type: "bulletList",
    attrs: {},
    content: null,
    children: items.map((it) => ({ id: it.id, type: "listItem", attrs: {}, content: spans(it.text), children: [] })),
  };
}

async function syncSelection(page: Page) {
  await page.evaluate(() => {
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { syncSelectionFromDOM?: () => void } | undefined;
    ed?.syncSelectionFromDOM?.();
  });
}

async function setTheme(page: Page, mode: "light" | "dark") {
  await page.getByRole("radio", { name: mode === "light" ? "Light theme" : "Dark theme" }).click();
  await expect(page.getByRole("radio", { name: mode === "light" ? "Light theme" : "Dark theme" })).toHaveAttribute("aria-checked", "true");
}

async function runSlash(page: Page, query: "todo" | "bullet", command: "To-do List" | "Bullet List") {
  const menu = page.locator("[data-gotipe-slash-menu]");
  await page.keyboard.type(`/${query}`);
  await expect(menu).toBeVisible();
  const item = menu.locator(".gotipe-slash-menu-item-title", { hasText: command }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(menu).toBeHidden();
}

async function clickTodoLeftZone(page: Page, blockId: string) {
  const p = await page.evaluate((id) => {
    const item = document.querySelector(`[data-block-id="${id}"][data-block-type="todoItem"]`) as HTMLElement | null;
    const cb = item?.querySelector('input[type="checkbox"]') as HTMLElement | null;
    if (!item || !cb) return null;
    const ir = item.getBoundingClientRect();
    const cr = cb.getBoundingClientRect();
    return { x: Math.max(ir.left + 1, cr.left - 3), y: cr.top + cr.height / 2 };
  }, blockId);
  if (!p) throw new Error(`Cannot click left zone for ${blockId}`);
  await page.mouse.click(p.x, p.y);
}

async function getSelectionContext(page: Page): Promise<{ blockType: string | null; parentType: string | null }> {
  return page.evaluate(() => {
    const sel = window.getSelection();
    const el = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
    const block = el?.closest("[data-block-id]") as HTMLElement | null;
    const parent = block?.parentElement?.closest("[data-block-id]") as HTMLElement | null;
    return { blockType: block?.getAttribute("data-block-type") ?? null, parentType: parent?.getAttribute("data-block-type") ?? null };
  });
}

async function firstTodoId(page: Page): Promise<string> {
  const id = await page.evaluate(() => document.querySelector('[data-block-type="todoList"] > [data-block-type="todoItem"]')?.getAttribute("data-block-id") || "");
  if (!id) throw new Error("No todo item found");
  return id;
}

async function firstBulletId(page: Page): Promise<string> {
  const id = await page.evaluate(() => document.querySelector('[data-block-type="bulletList"] > [data-block-type="listItem"]')?.getAttribute("data-block-id") || "");
  if (!id) throw new Error("No bullet item found");
  return id;
}

async function setupVariant(page: Page, variant: Variant, mode: "empty" | "nonempty", marker: string, op: Op): Promise<string> {
  if (variant === "dark") await setTheme(page, "dark");

  if (variant === "slash") {
    await setNotionContent(page, [{ id: "s-root", type: "paragraph", attrs: {}, content: spans(""), children: [] }]);
    await setCaretAt(page, "s-root", "start");
    await syncSelection(page);
    if (op === "bullet_to_todo") {
      await runSlash(page, "bullet", "Bullet List");
      const bulletId = await firstBulletId(page);
      if (mode === "nonempty") {
        await setCaretAt(page, bulletId, "end");
        await syncSelection(page);
        await page.keyboard.type(`slashb-${marker}`);
      }
      return bulletId;
    }

    await runSlash(page, "todo", "To-do List");
    const todoId = await firstTodoId(page);
    if (mode === "nonempty") {
      await setCaretAt(page, todoId, "end");
      await syncSelection(page);
      await page.keyboard.type(`slash-${marker}`);
    }
    return todoId;
  }

  if (op === "bullet_to_todo") {
    await setNotionContent(page, [bulletList("b-main", [{ id: "b-main-item", text: `bullet-${marker}` }])]);
    if (variant === "undo") {
      await setCaretAt(page, "b-main-item", "end");
      await syncSelection(page);
      await page.keyboard.type("-tmp");
      await page.evaluate(() => {
        const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean; redo?: () => boolean } | undefined;
        ed?.undo?.();
        ed?.redo?.();
      });
    }
    return "b-main-item";
  }

  const seed = mode === "empty" ? "" : `todo-${marker}`;
  await setNotionContent(page, [todoList("t-main", [{ id: "t-main-item", text: seed }])]);
  if (variant === "undo") {
    if (mode === "empty") {
      await page.evaluate(() => {
        const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
          | {
              undo?: () => boolean;
              redo?: () => boolean;
              dispatch?: (tx: unknown) => void;
            }
          | undefined;
        if (!ed?.dispatch) return;
        ed.dispatch({ steps: [{ type: "insertText", blockId: "t-main-item", offset: 0, text: "tmp", marks: [] }] });
        ed.dispatch({ steps: [{ type: "deleteText", blockId: "t-main-item", from: 0, to: 3 }] });
        ed?.undo?.();
        ed?.redo?.();
      });
    } else {
      await setCaretAt(page, "t-main-item", "end");
      await syncSelection(page);
      await page.keyboard.type("-tmp");
      await page.evaluate(() => {
        const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean; redo?: () => boolean } | undefined;
        ed?.undo?.();
        ed?.redo?.();
      });
    }
  }
  return "t-main-item";
}

test.describe("Notion-like checklist batch NL-371..NL-390", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
    await setTheme(page, "light");
  });

  for (const c of CASES) {
    test(`${c.id}: ${c.variant} (${c.op})`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;
      const mode: "empty" | "nonempty" = c.op === "caret_empty" || c.op === "enter_empty" ? "empty" : "nonempty";
      const targetId = await setupVariant(page, c.variant, mode, marker, c.op);

      if (c.op === "click_checkbox") {
        const before = await page.isChecked(`[data-block-id="${targetId}"] input[type="checkbox"]`);
        await page.click(`[data-block-id="${targetId}"] input[type="checkbox"]`);
        await expect(page.locator(`[data-block-id="${targetId}"] input[type="checkbox"]`)).toHaveJSProperty("checked", !before);
        return;
      }
      if (c.op === "caret_empty") {
        await clickTodoLeftZone(page, targetId);
        await expect.poll(async () => page.evaluate((id) => {
          const item = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
          const host = item?.querySelector("[data-gotipe-todo-content]");
          const sel = window.getSelection();
          if (!item || !host || !sel || sel.rangeCount === 0) return false;
          const a = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
          return host === sel.anchorNode || host.contains(a ?? null);
        }, targetId)).toBe(true);
        return;
      }
      if (c.op === "type_text") {
        if (mode === "empty") {
          await clickTodoLeftZone(page, targetId);
        } else {
          await setCaretAt(page, targetId, "end");
        }
        await syncSelection(page);
        await page.keyboard.type(`typed_${marker}`);
        await expect(page.locator(`[data-block-id="${targetId}"]`)).toContainText(`typed_${marker}`);
        return;
      }
      if (c.op === "enter_nonempty") {
        const before = await page.evaluate((id) => document.querySelector(`[data-block-id="${id}"]`)?.parentElement?.querySelectorAll('[data-block-type="todoItem"]').length ?? 0, targetId);
        await setCaretAt(page, targetId, "end");
        await syncSelection(page);
        await page.keyboard.press("Enter");
        await expect.poll(async () => page.evaluate((id) => document.querySelector(`[data-block-id="${id}"]`)?.parentElement?.querySelectorAll('[data-block-type="todoItem"]').length ?? 0, targetId)).toBeGreaterThan(before);
        return;
      }
      if (c.op === "enter_empty") {
        await clickTodoLeftZone(page, targetId);
        await syncSelection(page);
        const before = await page.evaluate((id) => document.querySelector(`[data-block-id="${id}"]`)?.parentElement?.querySelectorAll('[data-block-type="todoItem"]').length ?? 0, targetId);
        await page.keyboard.press("Enter");
        await expect.poll(async () => page.evaluate(({ id, prevCount }) => {
          const still = !!document.querySelector(`[data-block-id="${id}"]`);
          const count = document.querySelector('[data-block-type="todoList"]')?.querySelectorAll(':scope > [data-block-type="todoItem"]').length ?? prevCount - 1;
          const pCount = document.querySelectorAll('[data-gotipe-content] > [data-block-type="paragraph"]').length;
          return !still && count === prevCount - 1 && pCount > 0;
        }, { id: targetId, prevCount: before })).toBe(true);
        return;
      }

      if (c.op === "todo_to_bullet") {
        await clickTodoLeftZone(page, targetId);
        await syncSelection(page);
        await runSlash(page, "bullet", "Bullet List");
        await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "listItem", parentType: "bulletList" });
      } else {
        await page.evaluate((id) => {
          const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
            | { setSelection?: (sel: unknown) => void }
            | undefined;
          ed?.setSelection?.({
            anchor: { blockId: id, offset: 0 },
            head: { blockId: id, offset: 0 },
          });
        }, targetId);
        await runSlash(page, "todo", "To-do List");
        await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "todoItem", parentType: "todoList" });
      }
    });
  }
});
