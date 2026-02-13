import { expect, test, type Page } from "@playwright/test";
import {
  bulletList,
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
  clickBlockAt,
} from "./helpers/notion-checklist";

const PREV_ID = "ctx-prev";
const NEXT_ID = "ctx-next";
const TARGET_ID = "ctx-target";
const PREV_TEXT = "Prev anchor";
const NEXT_TEXT = "Next anchor";

type OpKey =
  | "click_start"
  | "click_middle"
  | "click_end"
  | "arrow_left_start"
  | "arrow_right_end"
  | "drag_to_next";

type ContextKey =
  | "p_empty"
  | "p_text"
  | "p_mixed"
  | "h1"
  | "h2"
  | "bullet_text"
  | "bullet_empty"
  | "ordered_text"
  | "todo_empty";

type ContextDef = {
  key: ContextKey;
  title: string;
  targetLength: number;
  makeTarget: () => BlockInput;
};

const mixedSpans = [
  { text: "Mix ", marks: [{ type: "bold", attrs: {} }] },
  { text: "style", marks: [{ type: "italic", attrs: {} }] },
];

const CONTEXTS: Record<ContextKey, ContextDef> = {
  p_empty: { key: "p_empty", title: "empty paragraph", targetLength: 0, makeTarget: () => paragraph(TARGET_ID, "") },
  p_text: { key: "p_text", title: "paragraph text", targetLength: "Simple paragraph".length, makeTarget: () => paragraph(TARGET_ID, "Simple paragraph") },
  p_mixed: {
    key: "p_mixed",
    title: "paragraph mixed marks",
    targetLength: mixedSpans.map((s) => s.text).join("").length,
    makeTarget: () => ({ id: TARGET_ID, type: "paragraph", attrs: {}, content: mixedSpans, children: [] }),
  },
  h1: { key: "h1", title: "heading 1", targetLength: "Heading level one".length, makeTarget: () => heading(TARGET_ID, 1, "Heading level one") },
  h2: { key: "h2", title: "heading 2", targetLength: "Heading level two".length, makeTarget: () => heading(TARGET_ID, 2, "Heading level two") },
  bullet_text: { key: "bullet_text", title: "bullet item text", targetLength: "Bullet item text".length, makeTarget: () => bulletList("ctx-list", TARGET_ID, "Bullet item text") },
  bullet_empty: { key: "bullet_empty", title: "bullet item empty", targetLength: 0, makeTarget: () => bulletList("ctx-list", TARGET_ID, "") },
  ordered_text: { key: "ordered_text", title: "ordered item text", targetLength: "Ordered item text".length, makeTarget: () => orderedList("ctx-list", TARGET_ID, "Ordered item text") },
  todo_empty: { key: "todo_empty", title: "todo item empty", targetLength: 0, makeTarget: () => todoList("ctx-list", TARGET_ID, "") },
};

const OPS: OpKey[] = [
  "click_start",
  "click_middle",
  "click_end",
  "arrow_left_start",
  "arrow_right_end",
  "drag_to_next",
];

type CaseDef = { id: string; context: ContextKey; op: OpKey };

const CASES: CaseDef[] = [];
let seq = 1;
for (const ctx of ["p_empty", "p_text", "p_mixed", "h1", "h2", "bullet_text", "bullet_empty", "ordered_text"] as const) {
  for (const op of OPS) {
    CASES.push({ id: `NL-${String(seq).padStart(3, "0")}`, context: ctx, op });
    seq += 1;
  }
}
for (const op of ["click_start", "click_middle"] as const) {
  CASES.push({ id: `NL-${String(seq).padStart(3, "0")}`, context: "todo_empty", op });
  seq += 1;
}
if (seq !== 51) throw new Error(`Expected 50 cases for NL-001..NL-050, got ${seq - 1}`);

async function assertByOp(page: Page, op: OpKey, targetLength: number): Promise<void> {
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
      const middleValid = targetLength === 0 ? s.anchorOffset === 0 : s.anchorOffset > 0 && s.anchorOffset <= targetLength;
      return `${s.anchorBlockId === TARGET_ID}|${s.focusBlockId === TARGET_ID}|${s.collapsed}|${middleValid}|${s.anchorAtRootStart}`;
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
      return `${s.anchorBlockId === PREV_ID}|${s.focusBlockId === PREV_ID}|${s.collapsed}|${s.anchorOffset >= PREV_TEXT.length - 1}`;
    }).toBe("true|true|true|true");
    return;
  }
  if (op === "arrow_right_end") {
    await expect.poll(async () => {
      const s = await readSelectionState(page);
      return `${s.anchorBlockId}|${s.focusBlockId}|${s.collapsed}|${s.anchorOffset}`;
    }).toBe(`${NEXT_ID}|${NEXT_ID}|true|0`);
    return;
  }
  await expect.poll(async () => {
    const s = await readSelectionState(page);
    const ids = new Set([s.anchorBlockId, s.focusBlockId]);
    return `${s.collapsed}|${ids.has(TARGET_ID)}|${ids.has(NEXT_ID)}`;
  }).toBe("false|true|true");
}

test.describe("Notion-like checklist batch NL-001..NL-050", () => {
  test.beforeEach(async ({ page }) => openNotionAndReset(page));

  for (const c of CASES) {
    test(`${c.id}: ${CONTEXTS[c.context].title} (${c.op})`, async ({ page }) => {
      const context = CONTEXTS[c.context];
      await setNotionContent(page, [paragraph(PREV_ID, PREV_TEXT), context.makeTarget(), paragraph(NEXT_ID, NEXT_TEXT)]);

      if (c.op === "click_start") await clickBlockAt(page, TARGET_ID, "start");
      if (c.op === "click_middle") await clickBlockAt(page, TARGET_ID, "middle");
      if (c.op === "click_end") await clickBlockAt(page, TARGET_ID, "end");
      if (c.op === "arrow_left_start") {
        await setCaretAt(page, TARGET_ID, "start");
        await page.keyboard.press("ArrowLeft");
      }
      if (c.op === "arrow_right_end") {
        await setCaretAt(page, TARGET_ID, "end");
        await page.keyboard.press("ArrowRight");
      }
      if (c.op === "drag_to_next") {
        await dragSelectionBetween(page, TARGET_ID, NEXT_ID);
      }

      await assertByOp(page, c.op, context.targetLength);
    });
  }
});
