import { expect, test, type Page } from "@playwright/test";
import {
  bulletList,
  clickBlockAt,
  dragSelectionBetween,
  heading,
  openNotionAndReset,
  orderedList,
  paragraph,
  readSelectionState,
  setCaretAt,
  setNotionContent,
  todoList,
  type BlockInput,
} from "./helpers/notion-checklist";

const PREV_ID = "batch2-prev";
const NEXT_ID = "batch2-next";
const TARGET_ID = "batch2-target";
const LIST_ID = "batch2-list";

const CARET_CASES = [
  { id: "NL-051", context: "todo_empty", op: "click_end" },
  { id: "NL-052", context: "todo_empty", op: "arrow_left_start" },
  { id: "NL-053", context: "todo_empty", op: "arrow_right_end" },
  { id: "NL-054", context: "todo_empty", op: "drag_to_next" },
  { id: "NL-055", context: "todo_text", op: "click_start" },
  { id: "NL-056", context: "todo_text", op: "click_middle" },
  { id: "NL-057", context: "todo_text", op: "click_end" },
  { id: "NL-058", context: "todo_text", op: "arrow_left_start" },
  { id: "NL-059", context: "todo_text", op: "arrow_right_end" },
  { id: "NL-060", context: "todo_text", op: "drag_to_next" },
] as const;

type CaretContext = (typeof CARET_CASES)[number]["context"];
type CaretOp = (typeof CARET_CASES)[number]["op"];

const CARET_CONTEXT_TEXT: Record<CaretContext, string> = {
  todo_empty: "",
  todo_text: "Todo item text",
};

type TypingContext = "p_empty" | "p_text" | "h1" | "h3" | "bullet" | "ordered" | "todo";
type TypingOp = "type_text" | "enter" | "shift_enter" | "backspace_middle" | "backspace_start" | "delete_forward";

const ALL_TYPING_OPS: TypingOp[] = [
  "type_text",
  "enter",
  "shift_enter",
  "backspace_middle",
  "backspace_start",
  "delete_forward",
];

const TYPING_CONTEXTS: Array<{ ctx: TypingContext; ops: TypingOp[] }> = [
  { ctx: "p_empty", ops: ALL_TYPING_OPS },
  { ctx: "p_text", ops: ALL_TYPING_OPS },
  { ctx: "h1", ops: ALL_TYPING_OPS },
  { ctx: "h3", ops: ALL_TYPING_OPS },
  { ctx: "bullet", ops: ALL_TYPING_OPS },
  { ctx: "ordered", ops: ALL_TYPING_OPS },
  { ctx: "todo", ops: ["type_text", "enter", "shift_enter", "backspace_middle"] },
];

const TYPING_CASES: Array<{ id: string; ctx: TypingContext; op: TypingOp }> = [];
let seq = 61;
for (const { ctx, ops } of TYPING_CONTEXTS) {
  for (const op of ops) {
    TYPING_CASES.push({ id: `NL-${String(seq).padStart(3, "0")}`, ctx, op });
    seq += 1;
  }
}
if (seq !== 101) throw new Error(`Expected NL-061..NL-100, got NL-${String(seq - 1).padStart(3, "0")}`);

type TypingState = {
  totalBlocks: number;
  targetText: string;
  targetExists: boolean;
  listChildren: number;
};

async function syncSelectionFromDom(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { syncSelectionFromDOM?: () => void }
      | undefined;
    editor?.syncSelectionFromDOM?.();
  });
}

function makeTarget(ctx: TypingContext, text: string): BlockInput {
  if (ctx === "p_empty" || ctx === "p_text") return paragraph(TARGET_ID, text);
  if (ctx === "h1") return heading(TARGET_ID, 1, text);
  if (ctx === "h3") return heading(TARGET_ID, 3, text);
  if (ctx === "bullet") return bulletList(LIST_ID, TARGET_ID, text);
  if (ctx === "ordered") return orderedList(LIST_ID, TARGET_ID, text);
  return todoList(LIST_ID, TARGET_ID, text);
}

function initialText(ctx: TypingContext, op: TypingOp): string {
  if (op === "backspace_middle" || op === "delete_forward") return "ABCDE";
  if (op === "backspace_start") return ctx === "p_empty" ? "A" : "Item";
  if (op === "type_text") return ctx === "p_empty" ? "" : "Seed";
  if (op === "shift_enter") return ctx === "p_empty" ? "Line" : "Seed";
  if (op === "enter") {
    if (ctx === "bullet" || ctx === "ordered" || ctx === "todo") return "Item";
    return ctx === "p_empty" ? "" : "Seed";
  }
  return "";
}

async function readTypingState(page: Page): Promise<TypingState> {
  return page.evaluate(({ targetId, listId }) => {
    const target = document.querySelector(`[data-block-id="${targetId}"]`) as HTMLElement | null;
    const list = document.querySelector(`[data-block-id="${listId}"]`) as HTMLElement | null;
    const listChildren = list
      ? Array.from(list.children).filter(
          (el) => el instanceof HTMLElement && (el as HTMLElement).hasAttribute("data-block-id"),
        ).length
      : 0;

    return {
      totalBlocks: document.querySelectorAll("[data-block-id]").length,
      targetText: target?.textContent ?? "",
      targetExists: !!target,
      listChildren,
    };
  }, { targetId: TARGET_ID, listId: LIST_ID });
}

async function setupTypingCase(page: Page, ctx: TypingContext, op: TypingOp): Promise<TypingState> {
  const text = initialText(ctx, op);
  await setNotionContent(page, [
    paragraph(PREV_ID, "Prev context"),
    makeTarget(ctx, text),
    paragraph(NEXT_ID, "Next context"),
  ]);

  if (op === "backspace_start") {
    await setCaretAt(page, TARGET_ID, "start");
  } else if (op === "backspace_middle" || op === "delete_forward") {
    await setCaretAt(page, TARGET_ID, "middle");
  } else {
    await setCaretAt(page, TARGET_ID, "end");
  }
  await syncSelectionFromDom(page);

  return readTypingState(page);
}

async function assertCaretCase(page: Page, op: CaretOp, targetLength: number): Promise<void> {
  if (op === "click_start") {
    await expect.poll(async () => {
      const s = await readSelectionState(page);
      return `${s.anchorBlockId}|${s.focusBlockId}|${s.collapsed}|${s.anchorOffset}|${s.anchorAtRootStart}`;
    }).toBe(`${TARGET_ID}|${TARGET_ID}|true|0|false`);
    return;
  }
  if (op === "click_middle") {
    await expect.poll(async () => {
      const s = await readSelectionState(page);
      const middleOk = targetLength === 0 ? s.anchorOffset === 0 : s.anchorOffset > 0 && s.anchorOffset <= targetLength;
      return `${s.anchorBlockId === TARGET_ID}|${s.focusBlockId === TARGET_ID}|${s.collapsed}|${middleOk}|${s.anchorAtRootStart}`;
    }).toBe("true|true|true|true|false");
    return;
  }
  if (op === "click_end") {
    await expect.poll(async () => {
      const s = await readSelectionState(page);
      const minExpected = targetLength === 0 ? 0 : Math.floor(targetLength / 2);
      return `${s.anchorBlockId === TARGET_ID}|${s.focusBlockId === TARGET_ID}|${s.collapsed}|${s.anchorOffset >= minExpected}|${s.anchorAtRootStart}`;
    }).toBe("true|true|true|true|false");
    return;
  }
  if (op === "arrow_left_start") {
    await expect.poll(async () => {
      const s = await readSelectionState(page);
      const onAllowedBlock = s.anchorBlockId === PREV_ID || s.anchorBlockId === TARGET_ID;
      return `${s.collapsed}|${onAllowedBlock}|${s.anchorAtRootStart}`;
    }).toBe("true|true|false");
    return;
  }
  if (op === "arrow_right_end") {
    await expect.poll(async () => {
      const s = await readSelectionState(page);
      const onAllowedBlock = s.anchorBlockId === TARGET_ID || s.anchorBlockId === NEXT_ID;
      return `${s.collapsed}|${onAllowedBlock}|${s.anchorAtRootStart}`;
    }).toBe("true|true|false");
    return;
  }
  await expect.poll(async () => {
    const s = await readSelectionState(page);
    const ids = new Set([s.anchorBlockId, s.focusBlockId]);
    return `${ids.has(NEXT_ID)}|${s.anchorAtRootStart}`;
  }).toBe("true|false");
}

test.describe("Notion-like checklist batch NL-051..NL-100", () => {
  test.beforeEach(async ({ page }) => openNotionAndReset(page));

  for (const c of CARET_CASES) {
    test(`${c.id}: ${c.context} (${c.op})`, async ({ page }) => {
      const text = CARET_CONTEXT_TEXT[c.context];
      await setNotionContent(page, [paragraph(PREV_ID, "Prev anchor"), todoList(LIST_ID, TARGET_ID, text), paragraph(NEXT_ID, "Next anchor")]);

      if (c.op === "click_start") await clickBlockAt(page, TARGET_ID, "start");
      if (c.op === "click_middle") await clickBlockAt(page, TARGET_ID, "middle");
      if (c.op === "click_end") await clickBlockAt(page, TARGET_ID, "end");
      if (c.op === "arrow_left_start") {
        await setCaretAt(page, TARGET_ID, "start");
        await syncSelectionFromDom(page);
        await page.keyboard.press("ArrowLeft");
      }
      if (c.op === "arrow_right_end") {
        await setCaretAt(page, TARGET_ID, "end");
        await syncSelectionFromDom(page);
        await page.keyboard.press("ArrowRight");
      }
      if (c.op === "drag_to_next") await dragSelectionBetween(page, TARGET_ID, NEXT_ID);

      await assertCaretCase(page, c.op, text.length);
    });
  }

  for (const c of TYPING_CASES) {
    test(`${c.id}: ${c.ctx} (${c.op})`, async ({ page }) => {
      const before = await setupTypingCase(page, c.ctx, c.op);

      if (c.op === "type_text") {
        const marker = `mk_${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;
        await page.keyboard.type(marker, { delay: 8 });
        await expect.poll(async () => (await readTypingState(page)).targetText.includes(marker)).toBe(true);
        await expect.poll(async () => (await readSelectionState(page)).anchorBlockId).toBe(TARGET_ID);
        return;
      }

      if (c.op === "enter") await page.keyboard.press("Enter");
      if (c.op === "shift_enter") await page.keyboard.press("Shift+Enter");
      if (c.op === "backspace_middle" || c.op === "backspace_start") await page.keyboard.press("Backspace");
      if (c.op === "delete_forward") await page.keyboard.press("Delete");

      const after = await readTypingState(page);
      const sel = await readSelectionState(page);

      if (c.op === "enter") {
        expect(after.totalBlocks).toBeGreaterThan(before.totalBlocks);
        expect(sel.anchorAtRootStart).toBe(false);
        return;
      }

      if (c.op === "shift_enter") {
        expect(after.totalBlocks).toBeGreaterThanOrEqual(before.totalBlocks);
        expect(sel.anchorBlockId).not.toBeNull();
        return;
      }

      if (c.op === "backspace_middle" || c.op === "delete_forward") {
        expect(after.targetExists).toBe(true);
        expect(after.targetText.length).toBeLessThan(before.targetText.length);
        expect(sel.anchorAtRootStart).toBe(false);
        return;
      }

      if (c.op === "backspace_start") {
        const marker = `bs_${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 6)}`;
        await page.keyboard.type(marker, { delay: 8 });
        await expect.poll(async () =>
          page.evaluate(() => (document.querySelector("[data-gotipe-content]") as HTMLElement | null)?.textContent ?? ""),
        ).toContain(marker);
        return;
      }

      expect(after.totalBlocks).toBeGreaterThan(0);
      expect(sel.collapsed).toBe(true);
      expect(sel.anchorBlockId !== null || sel.anchorAtRootStart).toBe(true);
    });
  }
});
