import { expect, test, type Page } from "@playwright/test";
import { clickTodoTextGap,
  enableClipboardForTest,
  openNotionAndReset,
  pasteTextWithFallback,
  setCaretAt,
  setNotionContent,
  type BlockInput,
} from "./helpers/notion-checklist";

type Op = "type_text" | "enter_nonempty" | "enter_empty" | "todo_to_bullet" | "bullet_to_todo" | "click_checkbox" | "caret_empty";
type Variant = "inline" | "empty" | "paste" | "undo_click";

type C = { id: string; variant: Variant; op: Op };

const CASES: C[] = [
  { id: "NL-351", variant: "inline", op: "type_text" },
  { id: "NL-352", variant: "inline", op: "enter_nonempty" },
  { id: "NL-353", variant: "inline", op: "enter_empty" },
  { id: "NL-354", variant: "inline", op: "todo_to_bullet" },
  { id: "NL-355", variant: "inline", op: "bullet_to_todo" },
  { id: "NL-356", variant: "empty", op: "click_checkbox" },
  { id: "NL-357", variant: "empty", op: "caret_empty" },
  { id: "NL-358", variant: "empty", op: "type_text" },
  { id: "NL-359", variant: "empty", op: "enter_nonempty" },
  { id: "NL-360", variant: "empty", op: "enter_empty" },
  { id: "NL-361", variant: "empty", op: "todo_to_bullet" },
  { id: "NL-362", variant: "empty", op: "bullet_to_todo" },
  { id: "NL-363", variant: "paste", op: "click_checkbox" },
  { id: "NL-364", variant: "paste", op: "caret_empty" },
  { id: "NL-365", variant: "paste", op: "type_text" },
  { id: "NL-366", variant: "paste", op: "enter_nonempty" },
  { id: "NL-367", variant: "paste", op: "enter_empty" },
  { id: "NL-368", variant: "paste", op: "todo_to_bullet" },
  { id: "NL-369", variant: "paste", op: "bullet_to_todo" },
  { id: "NL-370", variant: "undo_click", op: "click_checkbox" },
];

if (CASES.length !== 20) throw new Error("Expected 20 cases for NL-351..NL-370");

function spans(text: string, marks: Array<{ type: string; attrs?: Record<string, unknown> }> = []) {
  return [{ text, marks }];
}

function todoList(listId: string, items: Array<{ id: string; text: string; marks?: Array<{ type: string }> }>): BlockInput {
  return {
    id: listId,
    type: "todoList",
    attrs: {},
    content: null,
    children: items.map((it) => ({ id: it.id, type: "todoItem", attrs: { checked: false }, content: spans(it.text, it.marks ?? []), children: [] })),
  };
}

function bulletList(listId: string, items: Array<{ id: string; text: string; marks?: Array<{ type: string }> }>): BlockInput {
  return {
    id: listId,
    type: "bulletList",
    attrs: {},
    content: null,
    children: items.map((it) => ({ id: it.id, type: "listItem", attrs: {}, content: spans(it.text, it.marks ?? []), children: [] })),
  };
}

async function syncSelection(page: Page) {
  await page.evaluate(() => {
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { syncSelectionFromDOM?: () => void } | undefined;
    ed?.syncSelectionFromDOM?.();
  });
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

const clickTodoLeftZone = clickTodoTextGap;

async function getSelectionContext(page: Page): Promise<{ blockType: string | null; parentType: string | null }> {
  return page.evaluate(() => {
    const sel = window.getSelection();
    const el = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
    const block = el?.closest("[data-block-id]") as HTMLElement | null;
    const parent = block?.parentElement?.closest("[data-block-id]") as HTMLElement | null;
    return { blockType: block?.getAttribute("data-block-type") ?? null, parentType: parent?.getAttribute("data-block-type") ?? null };
  });
}

async function pasteText(page: Page, text: string) {
  await pasteTextWithFallback(page, text);
}

async function setupVariant(page: Page, variant: Variant, mode: "empty" | "nonempty", marker: string, op: Op): Promise<string> {
  if (op === "bullet_to_todo") {
    if (variant === "inline") {
      await setNotionContent(page, [bulletList("b-inline", [{ id: "b-inline-main", text: `inline-${marker}`, marks: [{ type: "bold" }, { type: "italic" }] }])]);
      return "b-inline-main";
    }
    if (variant === "empty") {
      await setNotionContent(page, [bulletList("b-empty", [{ id: "b-empty-main", text: mode === "empty" ? "" : `seed-${marker}` }])]);
      return "b-empty-main";
    }
    await setNotionContent(page, [bulletList("b-paste", [{ id: "b-paste-main", text: "" }])]);
    await setCaretAt(page, "b-paste-main", "start");
    await syncSelection(page);
    await pasteText(page, `pasteb-${marker}`);
    return "b-paste-main";
  }

  if (variant === "inline") {
    await setNotionContent(page, [todoList("t-inline", [{ id: "t-inline-main", text: `inline-${marker}`, marks: [{ type: "bold" }, { type: "italic" }] }, { id: "t-inline-empty", text: "" }])]);
    return mode === "empty" ? "t-inline-empty" : "t-inline-main";
  }

  if (variant === "empty") {
    await setNotionContent(page, [todoList("t-empty", [{ id: "t-empty-main", text: mode === "empty" ? "" : `seed-${marker}` }, { id: "t-empty-tail", text: `tail-${marker}` }])]);
    return "t-empty-main";
  }

  if (variant === "paste") {
    await setNotionContent(page, [todoList("t-paste", [{ id: "t-paste-main", text: "" }])]);
    await clickTodoLeftZone(page, "t-paste-main");
    await syncSelection(page);
    await setCaretAt(page, "t-paste-main", "start");
    await syncSelection(page);
    await pasteText(page, `paste-${marker}`);
    await expect.poll(async () => page.evaluate((id) => ((document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null)?.textContent ?? ""), "t-paste-main")).toContain(`paste-${marker}`);
    if (mode === "empty") {
      await setCaretAt(page, "t-paste-main", "end");
      await syncSelection(page);
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() =>
        document.querySelectorAll('[data-block-type="todoList"] > [data-block-type="todoItem"]').length,
      )).toBeGreaterThan(1);
      return await page.evaluate(() => {
        const ids = Array.from(document.querySelectorAll('[data-block-type="todoList"] > [data-block-type="todoItem"]')).map((el) => el.getAttribute("data-block-id") || "");
        return ids[ids.length - 1] || "t-paste-main";
      });
    }
    return "t-paste-main";
  }

  await setNotionContent(page, [todoList("t-undo", [{ id: "t-undo-main", text: `undo-${marker}` }])]);
  await setCaretAt(page, "t-undo-main", "end");
  await syncSelection(page);
  await page.keyboard.type("-tmp");
  await page.evaluate(() => {
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean; redo?: () => boolean } | undefined;
    ed?.undo?.();
    ed?.redo?.();
  });
  return "t-undo-main";
}

test.describe("Notion-like checklist batch NL-351..NL-370", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
    await page.getByRole("banner").getByRole("radio", { name: "Light theme" }).click();
    await enableClipboardForTest(page);
  });

  for (const c of CASES) {
    test(`${c.id}: ${c.variant} (${c.op})`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;
      const mode: "empty" | "nonempty" = c.op === "caret_empty" || c.op === "enter_empty" ? "empty" : "nonempty";
      const targetId = await setupVariant(page, c.variant, mode, marker, c.op);

      if (c.op === "click_checkbox") {
        const before = await page.isChecked(`[data-block-id="${targetId}"] input[type="checkbox"]`);
        const textBefore = await page.textContent(`[data-block-id="${targetId}"]`);
        await page.click(`[data-block-id="${targetId}"] input[type="checkbox"]`);
        await expect(page.locator(`[data-block-id="${targetId}"] input[type="checkbox"]`)).toHaveJSProperty("checked", !before);
        expect((await page.textContent(`[data-block-id="${targetId}"]`)) ?? "").toBe(textBefore ?? "");
        return;
      }

      if (c.op === "caret_empty") {
        await clickTodoLeftZone(page, targetId);
        await expect.poll(async () => page.evaluate((id) => {
          const item = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
          const host = item?.querySelector("[data-gotipe-todo-content]");
          const cb = item?.querySelector('input[type="checkbox"]');
          const sel = window.getSelection();
          if (!item || !host || !sel || sel.rangeCount === 0) return "null";
          const a = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
          const inHost = host === sel.anchorNode || host.contains(a ?? null);
          const onCb = !!(cb && (cb === sel.anchorNode || cb.contains(a ?? null)));
          return `${inHost}|${onCb}`;
        }, targetId)).toBe("true|false");
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
        await expect(page.locator(`[data-block-id="${targetId}"]`)).toContainText(`typed_${marker}`);
        const m = await page.evaluate((id) => {
          const item = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
          const cb = item?.querySelector('input[type="checkbox"]') as HTMLElement | null;
          const host = item?.querySelector("[data-gotipe-todo-content]") as HTMLElement | null;
          if (!cb || !host) return null;
          const a = cb.getBoundingClientRect();
          const b = host.getBoundingClientRect();
          return { centerDiff: Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)), gap: b.left - a.right };
        }, targetId);
        expect(m?.centerDiff ?? 99).toBeLessThan(8);
        expect(m?.gap ?? 0).toBeGreaterThan(6);
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
        await page.keyboard.press("Enter");
        await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "paragraph" });
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="paragraph"]').count()).toBeGreaterThan(0);
        return;
      }

      await setCaretAt(page, targetId, "start");
      await syncSelection(page);
      if (c.op === "todo_to_bullet") {
        await runSlash(page, "bullet", "Bullet List");
        await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "listItem", parentType: "bulletList" });
      } else {
        await runSlash(page, "todo", "To-do List");
        await expect.poll(() => getSelectionContext(page)).toMatchObject({ blockType: "todoItem", parentType: "todoList" });
      }
    });
  }
});
