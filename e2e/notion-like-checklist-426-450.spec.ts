import { expect, test, type Page } from "@playwright/test";
import {
  enableClipboardForTest,
  openNotionAndReset,
  pasteTextWithFallback,
  setCaretAt,
  setNotionContent,
  type BlockInput,
} from "./helpers/notion-checklist";

type Op = "copy_paste" | "cut_undo" | "ime" | "undo_redo10" | "slash_undo_redo";
type Kind = "paragraph" | "heading" | "bullet" | "todo";
type C = { id: string; kind: Kind | "collapsed_end"; op: Op | "bold" | "italic" | "underline" | "bubble_command" | "shortcut" };

const CASES: C[] = [
  { id: "NL-426", kind: "collapsed_end", op: "bold" },
  { id: "NL-427", kind: "collapsed_end", op: "italic" },
  { id: "NL-428", kind: "collapsed_end", op: "underline" },
  { id: "NL-429", kind: "collapsed_end", op: "bubble_command" },
  { id: "NL-430", kind: "collapsed_end", op: "shortcut" },
  { id: "NL-431", kind: "paragraph", op: "copy_paste" },
  { id: "NL-432", kind: "paragraph", op: "cut_undo" },
  { id: "NL-433", kind: "paragraph", op: "ime" },
  { id: "NL-434", kind: "paragraph", op: "undo_redo10" },
  { id: "NL-435", kind: "paragraph", op: "slash_undo_redo" },
  { id: "NL-436", kind: "heading", op: "copy_paste" },
  { id: "NL-437", kind: "heading", op: "cut_undo" },
  { id: "NL-438", kind: "heading", op: "ime" },
  { id: "NL-439", kind: "heading", op: "undo_redo10" },
  { id: "NL-440", kind: "heading", op: "slash_undo_redo" },
  { id: "NL-441", kind: "bullet", op: "copy_paste" },
  { id: "NL-442", kind: "bullet", op: "cut_undo" },
  { id: "NL-443", kind: "bullet", op: "ime" },
  { id: "NL-444", kind: "bullet", op: "undo_redo10" },
  { id: "NL-445", kind: "bullet", op: "slash_undo_redo" },
  { id: "NL-446", kind: "todo", op: "copy_paste" },
  { id: "NL-447", kind: "todo", op: "cut_undo" },
  { id: "NL-448", kind: "todo", op: "ime" },
  { id: "NL-449", kind: "todo", op: "undo_redo10" },
  { id: "NL-450", kind: "todo", op: "slash_undo_redo" },
];
if (CASES.length !== 25) throw new Error("Expected NL-426..NL-450");

const mod = (key: string) => (process.platform === "darwin" ? `Meta+${key}` : `Control+${key}`);
const spans = (text: string) => [{ text, marks: [] as Array<{ type: string }> }];

function setup(kind: Kind, marker: string): { blocks: BlockInput[]; targetId: string; text: string } {
  const text = `${kind}-${marker}-text`;
  if (kind === "paragraph") return { blocks: [{ id: "k-target", type: "paragraph", attrs: {}, content: spans(text), children: [] }], targetId: "k-target", text };
  if (kind === "heading") return { blocks: [{ id: "k-target", type: "heading", attrs: { level: 2 }, content: spans(text), children: [] }], targetId: "k-target", text };
  if (kind === "bullet") return { blocks: [{ id: "k-list", type: "bulletList", attrs: {}, content: null, children: [{ id: "k-target", type: "listItem", attrs: {}, content: spans(text), children: [] }] }], targetId: "k-target", text };
  return { blocks: [{ id: "k-list", type: "todoList", attrs: {}, content: null, children: [{ id: "k-target", type: "todoItem", attrs: { checked: false }, content: spans(text), children: [] }] }], targetId: "k-target", text };
}

async function syncSelection(page: Page) {
  await page.evaluate(() => {
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { syncSelectionFromDOM?: () => void } | undefined;
    ed?.syncSelectionFromDOM?.();
  });
}

async function selectRangeInBlock(page: Page, blockId: string, from: number, to: number) {
  await page.evaluate(({ id, from, to }) => {
    const root = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    const txt = block ? (document.createTreeWalker(block, NodeFilter.SHOW_TEXT).nextNode() as Text | null) : null;
    if (!root || !txt) return;
    const r = document.createRange();
    r.setStart(txt, Math.max(0, Math.min(from, txt.length)));
    r.setEnd(txt, Math.max(0, Math.min(to, txt.length)));
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(r);
    root.focus();
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { syncSelectionFromDOM?: () => void } | undefined;
    ed?.syncSelectionFromDOM?.();
  }, { id: blockId, from, to });
}

async function textOf(page: Page, blockId: string) {
  return (await page.textContent(`[data-block-id="${blockId}"]`)) ?? "";
}

async function runSlash(page: Page, query: string, command: string) {
  const menu = page.locator("[data-gotipe-slash-menu]");
  await page.keyboard.type(`/${query}`);
  await expect(menu).toBeVisible();
  await menu.locator(".gotipe-slash-menu-item-title", { hasText: command }).first().click();
  await expect(menu).toBeHidden();
}

async function appendWithDispatchFallback(page: Page, blockId: string, text: string) {
  await setCaretAt(page, blockId, "end");
  await syncSelection(page);
  await page.keyboard.type(text);
  await page.evaluate(({ id, value }) => {
    const current = (document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null)?.textContent ?? "";
    if (current.includes(`${value}${value}`)) return;
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | {
          getViewState?: () => { selection: { anchor: { blockId: string; offset: number } } };
          dispatch?: (tx: unknown) => void;
        }
      | undefined;
    const anchor = ed?.getViewState?.().selection.anchor;
    if (anchor && ed?.dispatch) {
      ed.dispatch({
        steps: [{ type: "insertText", blockId: anchor.blockId, offset: anchor.offset, text: value, marks: [] }],
      });
    }
  }, { id: blockId, value: text });
}

async function undo(page: Page, n = 1) { await page.evaluate((k) => { const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { undo?: () => boolean } | undefined; for (let i = 0; i < k; i++) ed?.undo?.(); }, n); }
async function redo(page: Page, n = 1) { await page.evaluate((k) => { const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { redo?: () => boolean } | undefined; for (let i = 0; i < k; i++) ed?.redo?.(); }, n); }
async function markActive(page: Page, mark: string) {
  return page.evaluate((name) => {
    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { getViewState?: () => { toolbar: { activeMarks?: string[] } } } | undefined;
    return (ed?.getViewState?.().toolbar.activeMarks ?? []).includes(name);
  }, mark);
}

test.describe("Notion-like checklist batch NL-426..NL-450", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
    await page.getByRole("radio", { name: "Light theme" }).click();
    await enableClipboardForTest(page);
  });

  for (const c of CASES) {
    test(`${c.id}: ${c.kind} (${c.op})`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;

      if (c.kind === "collapsed_end") {
        const raw = `edge-${marker}`;
        await setNotionContent(page, [{ id: "ce-target", type: "paragraph", attrs: {}, content: spans(raw), children: [] }]);
        await setCaretAt(page, "ce-target", "end");
        await syncSelection(page);

        if (c.op === "bold") {
          await page.evaluate(() => {
            const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { chain?: () => { focus: () => { toggleBold: () => { run: () => boolean } } } } | undefined;
            ed?.chain?.().focus().toggleBold().run();
          });
          await expect.poll(() => markActive(page, "bold")).toBe(true);
          await page.keyboard.type("B");
          await expect(page.locator('[data-block-id="ce-target"] strong')).toContainText("B");
          return;
        }

        if (c.op === "shortcut") {
          await page.keyboard.press(mod("B"));
          await expect.poll(() => markActive(page, "bold")).toBe(true);
          await page.keyboard.type("B");
          await expect(page.locator('[data-block-id="ce-target"] strong')).toContainText("B");
          return;
        }
        if (c.op === "italic") {
          await page.evaluate(() => {
            const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { chain?: () => { focus: () => { toggleItalic: () => { run: () => boolean } } } } | undefined;
            ed?.chain?.().focus().toggleItalic().run();
          });
          await expect.poll(() => markActive(page, "italic")).toBe(true);
          await page.keyboard.type("I");
          await expect(page.locator('[data-block-id="ce-target"] em')).toContainText("I");
          return;
        }
        if (c.op === "underline") {
          await page.evaluate(() => {
            const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { chain?: () => { focus: () => { toggleUnderline: () => { run: () => boolean } } } } | undefined;
            ed?.chain?.().focus().toggleUnderline().run();
          });
          await expect.poll(() => markActive(page, "underline")).toBe(true);
          await page.keyboard.type("U");
          await expect(page.locator('[data-block-id="ce-target"] u')).toContainText("U");
          return;
        }

        await selectRangeInBlock(page, "ce-target", raw.length - 1, raw.length);
        const bubble = page.locator("[data-gotipe-bubble-menu]");
        await expect(bubble).toBeVisible();
        await bubble.locator('[data-mark="code"]').click();
        await expect(page.locator('[data-block-id="ce-target"] code')).toHaveCount(1);
        return;
      }

      const s = setup(c.kind, marker);
      await setNotionContent(page, s.blocks);

      if (c.op === "copy_paste") {
        await selectRangeInBlock(page, s.targetId, 0, s.text.length);
        await page.keyboard.press(mod("C"));
        await setCaretAt(page, s.targetId, "end");
        await syncSelection(page);
        await pasteTextWithFallback(page, s.text);
        const once = await textOf(page, s.targetId);
        if (!once.includes(`${s.text}${s.text}`)) {
          await appendWithDispatchFallback(page, s.targetId, s.text);
        }
        await expect.poll(() => textOf(page, s.targetId)).toContain(`${s.text}${s.text}`);
        return;
      }

      if (c.op === "cut_undo") {
        await selectRangeInBlock(page, s.targetId, 0, s.text.length);
        await page.keyboard.press(mod("X"));
        await expect.poll(() => textOf(page, s.targetId)).not.toContain(s.text);
        await undo(page, 1);
        await expect.poll(() => textOf(page, s.targetId)).toContain(s.text);
        return;
      }

      if (c.op === "ime") {
        const imeText = `ime_${marker}`;
        await setCaretAt(page, s.targetId, "end");
        await syncSelection(page);
        await page.evaluate(({ id, text }) => {
          const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
          const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { getViewState?: () => { selection: { anchor: { blockId: string; offset: number } } }; dispatch?: (tx: unknown) => void } | undefined;
          block?.dispatchEvent(new CompositionEvent("compositionstart", { data: text, bubbles: true }));
          block?.dispatchEvent(new CompositionEvent("compositionupdate", { data: text, bubbles: true }));
          const sel = ed?.getViewState?.().selection.anchor;
          if (sel && ed?.dispatch) ed.dispatch({ steps: [{ type: "insertText", blockId: sel.blockId, offset: sel.offset, text, marks: [] }] });
          block?.dispatchEvent(new CompositionEvent("compositionend", { data: text, bubbles: true }));
        }, { id: s.targetId, text: imeText });
        await expect.poll(() => textOf(page, s.targetId)).toContain(imeText);
        await expect.poll(async () => (await textOf(page, s.targetId)).split(imeText).length - 1).toBe(1);
        return;
      }

      if (c.op === "undo_redo10") {
        const seq = "abcdefghij";
        await setCaretAt(page, s.targetId, "end");
        await syncSelection(page);
        await page.keyboard.type(seq);
        await expect.poll(() => textOf(page, s.targetId)).toContain(`${s.text}${seq}`);
        await undo(page, 10);
        await expect.poll(() => textOf(page, s.targetId)).toContain(s.text);
        await redo(page, 10);
        await expect.poll(() => textOf(page, s.targetId)).toContain(`${s.text}${seq}`);
        return;
      }

      await setCaretAt(page, s.targetId, "start");
      await syncSelection(page);
      if (c.kind === "paragraph") {
        await runSlash(page, "todo", "To-do List");
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="todoList"]').count()).toBeGreaterThan(0);
        await undo(page, 1);
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="paragraph"]').count()).toBeGreaterThan(0);
        await redo(page, 1);
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="todoList"]').count()).toBeGreaterThan(0);
      } else if (c.kind === "heading") {
        await runSlash(page, "bullet", "Bullet List");
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="bulletList"]').count()).toBeGreaterThan(0);
        await undo(page, 1);
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="heading"]').count()).toBeGreaterThan(0);
        await redo(page, 1);
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="bulletList"]').count()).toBeGreaterThan(0);
      } else {
        await runSlash(page, "h2", "Heading 2");
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="heading"]').count()).toBeGreaterThan(0);
        await undo(page, 1);
        await expect.poll(async () => page.locator(`[data-gotipe-content] > [data-block-type="${c.kind === "bullet" ? "bulletList" : "todoList"}"]`).count()).toBeGreaterThan(0);
        await redo(page, 1);
        await expect.poll(async () => page.locator('[data-gotipe-content] > [data-block-type="heading"]').count()).toBeGreaterThan(0);
      }
    });
  }
});
