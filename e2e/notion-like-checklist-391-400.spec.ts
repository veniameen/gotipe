import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setNotionContent, type BlockInput } from "./helpers/notion-checklist";

type Op = "bold" | "italic" | "underline" | "bubble_command" | "shortcut";
type BlockKind = "paragraph" | "heading";
type C = { id: string; block: BlockKind; op: Op };

const CASES: C[] = [
  { id: "NL-391", block: "paragraph", op: "bold" },
  { id: "NL-392", block: "paragraph", op: "italic" },
  { id: "NL-393", block: "paragraph", op: "underline" },
  { id: "NL-394", block: "paragraph", op: "bubble_command" },
  { id: "NL-395", block: "paragraph", op: "shortcut" },
  { id: "NL-396", block: "heading", op: "bold" },
  { id: "NL-397", block: "heading", op: "italic" },
  { id: "NL-398", block: "heading", op: "underline" },
  { id: "NL-399", block: "heading", op: "bubble_command" },
  { id: "NL-400", block: "heading", op: "shortcut" },
];

if (CASES.length !== 10) throw new Error("Expected 10 cases for NL-391..NL-400");

function spans(text: string) {
  return [{ text, marks: [] as Array<{ type: string }> }];
}

function makeBlock(kind: BlockKind, id: string, text: string): BlockInput {
  if (kind === "heading") {
    return { id, type: "heading", attrs: { level: 2 }, content: spans(text), children: [] };
  }
  return { id, type: "paragraph", attrs: {}, content: spans(text), children: [] };
}

async function setTheme(page: Page, mode: "light" | "dark") {
  await page.getByRole("radio", { name: mode === "light" ? "Light theme" : "Dark theme" }).click();
  await expect(page.getByRole("radio", { name: mode === "light" ? "Light theme" : "Dark theme" })).toHaveAttribute("aria-checked", "true");
}

async function selectRange(page: Page, blockId: string, from: number, to: number) {
  await page.evaluate(({ id, from, to }) => {
    const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    const root = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    if (!block || !root) return;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) texts.push(n as Text);
    if (texts.length === 0) return;

    const total = texts.map((t) => t.textContent?.length ?? 0).reduce((a, b) => a + b, 0);
    const start = Math.max(0, Math.min(from, total));
    const end = Math.max(start, Math.min(to, total));

    let acc = 0;
    let sNode: Text = texts[0]!;
    let eNode: Text = texts[texts.length - 1]!;
    let sOff = 0;
    let eOff = (eNode.textContent ?? "").length;

    for (const t of texts) {
      const len = (t.textContent ?? "").length;
      if (acc + len >= start && sNode === texts[0]) {
        sNode = t;
        sOff = start - acc;
      }
      if (acc + len >= end) {
        eNode = t;
        eOff = end - acc;
        break;
      }
      acc += len;
    }

    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStart(sNode, sOff);
    range.setEnd(eNode, eOff);
    sel.removeAllRanges();
    sel.addRange(range);
    root.focus();

    const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { syncSelectionFromDOM?: () => void } | undefined;
    ed?.syncSelectionFromDOM?.();
  }, { id: blockId, from, to });
}

async function selectionState(page: Page): Promise<{ collapsed: boolean; blockType: string | null }> {
  return page.evaluate(() => {
    const sel = window.getSelection();
    const el = sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
    const block = el?.closest("[data-block-id]") as HTMLElement | null;
    return { collapsed: sel?.isCollapsed ?? true, blockType: block?.getAttribute("data-block-type") ?? null };
  });
}

async function expectMarkActive(page: Page, mark: "bold" | "italic" | "underline" | "code") {
  await expect.poll(async () =>
    page.evaluate((m) => {
      const ed = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as { getViewState?: () => { toolbar: { activeMarks?: string[] } } } | undefined;
      return (ed?.getViewState?.().toolbar.activeMarks ?? []).includes(m);
    }, mark),
  ).toBe(true);
}

async function runBubbleMark(page: Page, mark: "bold" | "italic" | "underline" | "code") {
  const bubble = page.locator("[data-gotipe-bubble-menu]");
  await expect(bubble).toBeVisible();
  await bubble.locator(`[data-mark="${mark}"]`).click();
}

test.describe("Notion-like checklist batch NL-391..NL-400", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
    await setTheme(page, "light");
  });

  for (const c of CASES) {
    test(`${c.id}: ${c.block} (${c.op})`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;
      const text = `${c.block}-${marker}-sample-text`;
      const blockId = `${c.id.toLowerCase()}-block`;

      await setNotionContent(page, [makeBlock(c.block, blockId, text)]);
      await selectRange(page, blockId, 0, Math.min(12, text.length));

      if (c.op === "bold") {
        await runBubbleMark(page, "bold");
        await expectMarkActive(page, "bold");
        await expect(page.locator(`[data-block-id="${blockId}"] strong`)).toHaveCount(1);
      } else if (c.op === "italic") {
        await runBubbleMark(page, "italic");
        await expectMarkActive(page, "italic");
        await expect(page.locator(`[data-block-id="${blockId}"] em`)).toHaveCount(1);
      } else if (c.op === "underline") {
        await runBubbleMark(page, "underline");
        await expectMarkActive(page, "underline");
        await expect(page.locator(`[data-block-id="${blockId}"] u`)).toHaveCount(1);
      } else if (c.op === "bubble_command") {
        await runBubbleMark(page, "code");
        await expectMarkActive(page, "code");
        await expect(page.locator(`[data-block-id="${blockId}"] code`)).toHaveCount(1);
      } else {
        const combo = c.block === "paragraph"
          ? (process.platform === "darwin" ? "Meta+B" : "Control+B")
          : (process.platform === "darwin" ? "Meta+I" : "Control+I");
        await page.keyboard.press(combo);
        await expectMarkActive(page, c.block === "paragraph" ? "bold" : "italic");
      }

      await expect.poll(() => selectionState(page)).toMatchObject({ collapsed: false, blockType: c.block === "heading" ? "heading" : "paragraph" });
    });
  }
});
