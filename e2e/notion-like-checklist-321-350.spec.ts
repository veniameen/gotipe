import { expect, test, type Page } from "@playwright/test";
import { clickTodoTextGap, openNotionAndReset, setCaretAt, setNotionContent, type BlockInput } from "./helpers/notion-checklist";

type TodoVariant = "first" | "middle" | "last" | "long" | "inline";
type TodoOp = "click_checkbox" | "caret_empty" | "type_text" | "enter_nonempty" | "enter_empty" | "todo_to_bullet" | "bullet_to_todo";

type MarkerContext = {
  blockType: string | null;
  parentType: string | null;
};

const TODO_CASES: Array<{ id: string; variant: TodoVariant; op: TodoOp }> = [];
const FULL_OPS: TodoOp[] = ["click_checkbox", "caret_empty", "type_text", "enter_nonempty", "enter_empty", "todo_to_bullet", "bullet_to_todo"];
let nextId = 321;
for (const variant of ["first", "middle", "last", "long"] as const) {
  for (const op of FULL_OPS) {
    TODO_CASES.push({ id: `NL-${nextId}`, variant, op });
    nextId += 1;
  }
}
for (const op of ["click_checkbox", "caret_empty"] as const) {
  TODO_CASES.push({ id: `NL-${nextId}`, variant: "inline", op });
  nextId += 1;
}
if (TODO_CASES.length !== 30 || nextId !== 351) throw new Error("Expected NL-321..NL-350");

function spans(text: string, marks: Array<{ type: string; attrs?: Record<string, unknown> }> = []) {
  return [{ text, marks }];
}

function todoListCustom(listId: string, items: Array<{ id: string; content: ReturnType<typeof spans>; checked?: boolean }>): BlockInput {
  return {
    id: listId,
    type: "todoList",
    attrs: {},
    content: null,
    children: items.map((item) => ({
      id: item.id,
      type: "todoItem",
      attrs: { checked: !!item.checked },
      content: item.content,
      children: [],
    })),
  };
}

function bulletListCustom(listId: string, items: Array<{ id: string; text: string }>): BlockInput {
  return {
    id: listId,
    type: "bulletList",
    attrs: {},
    content: null,
    children: items.map((item) => ({
      id: item.id,
      type: "listItem",
      attrs: {},
      content: spans(item.text),
      children: [],
    })),
  };
}

async function syncSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { syncSelectionFromDOM?: () => void }
      | undefined;
    editor?.syncSelectionFromDOM?.();
  });
}

async function runSlashCommand(page: Page, query: "bullet" | "todo", command: "Bullet List" | "To-do List"): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  await page.keyboard.type(`/${query}`);
  await expect(menu).toBeVisible();
  const item = menu.locator(".gotipe-slash-menu-item-title", { hasText: command }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(menu).toBeHidden();
}

async function readMarkerContext(page: Page, marker: string): Promise<MarkerContext | null> {
  return page.evaluate((needle) => {
    const blocks = Array.from(document.querySelectorAll("[data-block-id]")) as HTMLElement[];
    const leaf = blocks.find((el) => {
      const selfHas = (el.textContent ?? "").includes(needle);
      if (!selfHas) return false;
      const childHas = Array.from(el.querySelectorAll("[data-block-id]")).some((child) => {
        if (!(child instanceof HTMLElement) || child === el) return false;
        return (child.textContent ?? "").includes(needle);
      });
      return !childHas;
    });
    if (!leaf) return null;
    const parent = leaf.parentElement?.closest("[data-block-id]") as HTMLElement | null;
    return {
      blockType: leaf.getAttribute("data-block-type"),
      parentType: parent?.getAttribute("data-block-type") ?? null,
    };
  }, marker);
}

const clickTodoLeftZone = clickTodoTextGap;

async function setupTodoVariant(page: Page, variant: TodoVariant, mode: "empty" | "nonempty", marker: string): Promise<string> {
  const longText = `long_${marker}_${"x".repeat(120)}`;
  if (variant === "inline") {
    const targetId = mode === "empty" ? "todo-inline-empty" : "todo-inline-main";
    await setNotionContent(page, [
      todoListCustom("todo-inline-list", [
        { id: "todo-inline-main", content: [{ text: `inline-${marker}`, marks: [{ type: "bold" }, { type: "italic" }] }] },
        { id: "todo-inline-empty", content: spans("") },
      ]),
    ]);
    return targetId;
  }

  if (variant === "long") {
    const targetId = mode === "empty" ? "todo-long-empty" : "todo-long-main";
    await setNotionContent(page, [
      todoListCustom("todo-long-list", [
        { id: "todo-long-main", content: spans(longText) },
        { id: "todo-long-empty", content: spans(mode === "empty" ? "" : `tail-${marker}`) },
      ]),
    ]);
    return targetId;
  }

  const index = variant === "first" ? 0 : variant === "middle" ? 1 : 2;
  const ids = ["todo-row-1", "todo-row-2", "todo-row-3"];
  const texts = [`a-${marker}`, `b-${marker}`, `c-${marker}`];
  texts[index] = mode === "empty" ? "" : `target-${marker}`;
  await setNotionContent(page, [
    todoListCustom("todo-main-list", ids.map((id, i) => ({ id, content: spans(texts[i]!) }))),
  ]);
  return ids[index]!;
}

async function setupBulletVariant(page: Page, variant: Exclude<TodoVariant, "inline">, marker: string): Promise<string> {
  if (variant === "long") {
    await setNotionContent(page, [
      bulletListCustom("bullet-long-list", [{ id: "bullet-long-main", text: `long_${marker}_${"y".repeat(120)}` }]),
    ]);
    return "bullet-long-main";
  }
  const index = variant === "first" ? 0 : variant === "middle" ? 1 : 2;
  const ids = ["bullet-row-1", "bullet-row-2", "bullet-row-3"];
  await setNotionContent(page, [
    bulletListCustom(
      "bullet-main-list",
      ids.map((id, i) => ({ id, text: i === index ? `target-${marker}` : `seed-${i}-${marker}` })),
    ),
  ]);
  return ids[index]!;
}

test.describe("Notion-like checklist batch NL-321..NL-350", () => {
  test.beforeEach(async ({ page }) => openNotionAndReset(page));

  for (const c of TODO_CASES) {
    test(`${c.id}: ${c.variant} (${c.op})`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;

      if (c.op === "bullet_to_todo") {
        const targetId = await setupBulletVariant(page, c.variant as Exclude<TodoVariant, "inline">, marker);
        await setCaretAt(page, targetId, "start");
        await syncSelection(page);
        await runSlashCommand(page, "todo", "To-do List");
        const ctx = await readMarkerContext(page, marker);
        expect(ctx?.blockType).toBe("todoItem");
        expect(ctx?.parentType).toBe("todoList");
        return;
      }

      const mode: "empty" | "nonempty" = c.op === "caret_empty" || c.op === "enter_empty" || (c.op === "type_text" && c.variant !== "long") ? "empty" : "nonempty";
      const targetId = await setupTodoVariant(page, c.variant, mode, marker);

      if (c.op === "click_checkbox") {
        const before = await page.evaluate((id) => {
          const item = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
          const cb = item?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
          return { text: item?.textContent ?? "", checked: cb?.checked ?? false };
        }, targetId);
        await page.locator(`[data-block-id="${targetId}"] input[type="checkbox"]`).click();
        const after = await page.evaluate((id) => {
          const item = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
          const cb = item?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
          return { text: item?.textContent ?? "", checked: cb?.checked ?? false };
        }, targetId);
        expect(after.text).toBe(before.text);
        expect(after.checked).toBe(!before.checked);
        return;
      }

      if (c.op === "caret_empty") {
        await clickTodoLeftZone(page, targetId);
        await expect.poll(async () =>
          page.evaluate((id) => {
            const item = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
            const host = item?.querySelector("[data-gotipe-todo-content]");
            const cb = item?.querySelector('input[type="checkbox"]');
            const sel = window.getSelection();
            if (!item || !host || !sel || sel.rangeCount === 0) return "null";
            const a = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
            const inHost = host === sel.anchorNode || host.contains(a ?? null);
            const onCb = !!(cb && (cb === sel.anchorNode || cb.contains(a ?? null)));
            return `${inHost}|${sel.anchorNode === item && sel.anchorOffset === 0}|${onCb}`;
          }, targetId),
        ).toBe("true|false|false");
        return;
      }

      if (c.op === "type_text") {
        if (mode === "empty") {
          await clickTodoLeftZone(page, targetId);
          await syncSelection(page);
        } else {
          await setCaretAt(page, targetId, "end");
          await syncSelection(page);
        }
        await page.keyboard.type(`typed_${marker}`);
        await expect.poll(async () =>
          page.evaluate(
            ({ id, needle }) => ((document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null)?.textContent ?? "").includes(needle),
            { id: targetId, needle: `typed_${marker}` },
          ),
        ).toBe(true);
        const metrics = await page.evaluate((id) => {
          const item = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
          const cb = item?.querySelector('input[type="checkbox"]') as HTMLElement | null;
          const host = item?.querySelector("[data-gotipe-todo-content]") as HTMLElement | null;
          if (!cb || !host) return null;
          const a = cb.getBoundingClientRect();
          const b = host.getBoundingClientRect();
          return { centerDiff: Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)), gap: b.left - a.right };
        }, targetId);
        expect(metrics?.centerDiff ?? 99).toBeLessThan(8);
        expect(metrics?.gap ?? 0).toBeGreaterThan(6);
        return;
      }

      if (c.op === "enter_nonempty") {
        const before = await page.evaluate((id) => document.querySelector(`[data-block-id="${id}"]`)?.parentElement?.querySelectorAll('[data-block-type="todoItem"]').length ?? 0, targetId);
        await setCaretAt(page, targetId, "end");
        await syncSelection(page);
        await page.keyboard.press("Enter");
        await expect.poll(async () =>
          page.evaluate((id) => document.querySelector(`[data-block-id="${id}"]`)?.parentElement?.querySelectorAll('[data-block-type="todoItem"]').length ?? 0, targetId),
        ).toBeGreaterThan(before);
        return;
      }

      if (c.op === "enter_empty") {
        const beforeCount = await page.evaluate((id) => document.querySelector(`[data-block-id="${id}"]`)?.parentElement?.querySelectorAll('[data-block-type="todoItem"]').length ?? 0, targetId);
        await clickTodoLeftZone(page, targetId);
        await syncSelection(page);
        await page.keyboard.press("Enter");
        await expect.poll(async () =>
          page.evaluate(({ id, prevCount }) => {
            const lifted = document.querySelector(`[data-block-id="${id}"][data-block-type="paragraph"]`);
            const listCount = document.querySelectorAll('[data-block-type="todoList"] > [data-block-type="todoItem"]').length;
            const paragraphCount = document.querySelectorAll('[data-gotipe-content] > [data-block-type="paragraph"]').length;
            return !!lifted && listCount === prevCount - 1 && paragraphCount > 0;
          }, { id: targetId, prevCount: beforeCount }),
        ).toBe(true);
        return;
      }

      await setCaretAt(page, targetId, "start");
      await syncSelection(page);
      await runSlashCommand(page, "bullet", "Bullet List");
      const ctx = await readMarkerContext(page, marker);
      expect(ctx?.blockType).toBe("listItem");
      expect(ctx?.parentType).toBe("bulletList");
    });
  }
});
