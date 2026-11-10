import { expect, test, type Page } from "@playwright/test";
import {
  bulletList,
  openNotionAndReset,
  orderedList,
  paragraph,
  setCaretAt,
  setNotionContent,
  todoList,
} from "./helpers/notion-checklist";

const SLASH_MENU = "[data-gotipe-slash-menu]";

type SlashBoundaryCase = {
  title: string;
  itemId: string;
  blocks: Parameters<typeof setNotionContent>[1];
  input: string;
  shouldOpen: boolean;
};

async function topLevelIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]"))
      .map((el) => (el as HTMLElement).getAttribute("data-block-id") ?? ""),
  );
}

async function readBlockRowMetrics(page: Page, blockId: string): Promise<{ textX: number; y: number; gutterX: number } | null> {
  return page.evaluate((id) => {
    const block = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    if (!block) return null;

    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    let textLeft = block.getBoundingClientRect().left + 12;
    while ((n = walker.nextNode())) {
      const text = n.textContent ?? "";
      if (!text.trim()) continue;
      const r = document.createRange();
      r.setStart(n, 0);
      r.setEnd(n, Math.min(1, text.length));
      const rr = r.getBoundingClientRect();
      if (rr.width > 0 || rr.height > 0) {
        textLeft = rr.left;
        break;
      }
    }

    const rect = block.getBoundingClientRect();
    const y = rect.top + Math.min(24, Math.max(10, rect.height / 2));
    return {
      textX: Math.max(8, Math.round(textLeft + 18)),
      y: Math.round(y),
      gutterX: Math.max(4, Math.round(textLeft - 30)),
    };
  }, blockId);
}

async function jaggedHoverOnBlock(page: Page, blockId: string): Promise<void> {
  const metrics = await readBlockRowMetrics(page, blockId);
  expect(metrics).not.toBeNull();

  const jitter = [
    [10, -6],
    [20, 5],
    [14, -3],
    [24, 6],
    [12, -4],
  ] as const;

  await page.mouse.move(4, 4);
  for (const [dx, dy] of jitter) {
    await page.mouse.move(metrics!.textX + dx, metrics!.y + dy, { steps: 1 });
    await page.mouse.move(metrics!.gutterX - 12 + Math.round(dx / 3), metrics!.y + dy, { steps: 1 });
    await page.mouse.move(metrics!.gutterX + (dx % 2 === 0 ? 4 : -4), metrics!.y + Math.round(dy / 2), { steps: 1 });
  }
}

async function readToolbarSnapshot(
  page: Page,
  anchorBlockId: string,
): Promise<{ left: number; top: number; topDelta: number } | null> {
  return page.evaluate((id) => {
    const toolbar = document.querySelector(".gotipe-block-toolbar-wrapper") as HTMLElement | null;
    const anchor = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    if (!toolbar || !anchor) return null;
    const tr = toolbar.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    return {
      left: Math.round(tr.left),
      top: Math.round(tr.top),
      topDelta: Math.abs(Math.round(tr.top - ar.top)),
    };
  }, anchorBlockId);
}

async function seedToolbarSurface(page: Page): Promise<void> {
  await setNotionContent(page, [
    paragraph("s2-top", "surface"),
    bulletList("s2-b-list", "s2-b-item", "bullet row"),
    orderedList("s2-o-list", "s2-o-item", "ordered row"),
    todoList("s2-t-list", "s2-t-item", "todo row"),
    paragraph("s2-tail", "tail"),
  ]);
}

async function seedItemLevelToolbarSurface(page: Page): Promise<void> {
  await setNotionContent(page, [
    paragraph("ix-p", "lead"),
    {
      id: "ix-b-list",
      type: "bulletList",
      attrs: {},
      content: null,
      children: [
        { id: "ix-li-1", type: "listItem", attrs: {}, content: [{ text: "item 1", marks: [] }], children: [] },
        { id: "ix-li-2", type: "listItem", attrs: {}, content: [{ text: "item 2", marks: [] }], children: [] },
        { id: "ix-li-3", type: "listItem", attrs: {}, content: [{ text: "item 3", marks: [] }], children: [] },
      ],
    },
    {
      id: "ix-t-list",
      type: "todoList",
      attrs: {},
      content: null,
      children: [
        { id: "ix-ti-1", type: "todoItem", attrs: { checked: false }, content: [{ text: "todo 1", marks: [] }], children: [] },
        { id: "ix-ti-2", type: "todoItem", attrs: { checked: false }, content: [{ text: "todo 2", marks: [] }], children: [] },
      ],
    },
    paragraph("ix-tail", "tail"),
  ]);
}

test.describe("Notion-like Step2 parity regressions", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("slash boundary behavior in bullet/todo rows matches Notion baseline", async ({ page }) => {
    const cases: SlashBoundaryCase[] = [
      {
        title: "bullet inline slash does not open",
        itemId: "b-item",
        blocks: [bulletList("b-list", "b-item", "alpha")],
        input: "/to",
        shouldOpen: false,
      },
      {
        title: "bullet boundary slash opens",
        itemId: "b-item",
        blocks: [bulletList("b-list", "b-item", "alpha")],
        input: " /to",
        shouldOpen: true,
      },
      {
        title: "todo inline slash does not open",
        itemId: "t-item",
        blocks: [todoList("t-list", "t-item", "alpha")],
        input: "/to",
        shouldOpen: false,
      },
      {
        title: "todo boundary slash opens",
        itemId: "t-item",
        blocks: [todoList("t-list", "t-item", "alpha")],
        input: " /to",
        shouldOpen: true,
      },
    ];

    const slashMenu = page.locator(SLASH_MENU);

    for (const c of cases) {
      await test.step(c.title, async () => {
        await setNotionContent(page, c.blocks);
        await setCaretAt(page, c.itemId, "end");
        await page.keyboard.type(c.input, { delay: 10 });

        if (c.shouldOpen) {
          await expect(slashMenu).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(slashMenu).toBeHidden();
        } else {
          await page.waitForTimeout(150);
          await expect(slashMenu).toBeHidden();
        }
      });
    }
  });

  test("jagged fast-hover keeps + and drag handle clickable on list rows", async ({ page }) => {
    for (const blockId of ["s2-b-list", "s2-o-list", "s2-t-list"]) {
      await test.step(`plus works after jagged hover on ${blockId}`, async () => {
        await seedToolbarSurface(page);
        const before = await topLevelIds(page);
        const itemId = blockId.replace("-list", "-item");
        const list = page.locator(`[data-gotipe-content] > [data-block-id="${blockId}"]`);
        const rows = list.locator(":scope > [data-block-id]");
        await expect(rows).toHaveCount(1);

        await jaggedHoverOnBlock(page, itemId);
        const toolbar = page.locator(".gotipe-block-toolbar-wrapper");
        await expect(toolbar).toBeVisible();
        await toolbar.locator('[aria-label="Click to add below. Option-click to add a block above"]').click();

        // The handle belongs to the item row; adding below retains its list parent.
        await expect(rows).toHaveCount(2);
        expect(await topLevelIds(page)).toEqual(before);
        await expect(rows.nth(0)).toHaveAttribute("data-block-id", itemId);
        await expect(rows.nth(1)).toHaveAttribute("data-block-type", blockId === "s2-t-list" ? "todoItem" : "listItem");
        await page.keyboard.press("Escape");
        await page.keyboard.type("new row");
        await expect(rows.nth(1)).toContainText("new row");
        await expect(rows.nth(0)).not.toContainText("new row");
      });

      await test.step(`drag menu works after jagged hover on ${blockId}`, async () => {
        await seedToolbarSurface(page);
        await jaggedHoverOnBlock(page, blockId.replace("-list", "-item"));

        const toolbar = page.locator(".gotipe-block-toolbar-wrapper");
        await expect(toolbar).toBeVisible();
        await toolbar.locator("[data-gotipe-drag-handle]").click();
        await expect(page.locator("[data-gotipe-context-menu]")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("[data-gotipe-context-menu]")).not.toBeVisible();
      });
    }
  });

  test("toolbar uses fixed X rail across block types and item rows", async ({ page }) => {
    await seedItemLevelToolbarSurface(page);
    const targets = ["ix-p", "ix-li-1", "ix-li-2", "ix-li-3", "ix-ti-1", "ix-ti-2", "ix-tail"];
    const xs: number[] = [];

    for (const id of targets) {
      await jaggedHoverOnBlock(page, id);
      await expect(page.locator(".gotipe-block-toolbar-wrapper")).toBeVisible();
      const snap = await readToolbarSnapshot(page, id);
      expect(snap).not.toBeNull();
      expect(snap!.topDelta).toBeLessThan(40);
      xs.push(snap!.left);
    }

    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread).toBeLessThanOrEqual(2);
  });

  test("toolbar tracks each list item row, not only list container top", async ({ page }) => {
    await seedItemLevelToolbarSurface(page);

    const itemIds = ["ix-li-1", "ix-li-2", "ix-li-3", "ix-ti-1", "ix-ti-2"];
    const tops: number[] = [];

    for (const id of itemIds) {
      await jaggedHoverOnBlock(page, id);
      await expect(page.locator(".gotipe-block-toolbar-wrapper")).toBeVisible();
      const snap = await readToolbarSnapshot(page, id);
      expect(snap).not.toBeNull();
      expect(snap!.topDelta).toBeLessThan(40);
      tops.push(snap!.top);
    }

    // Must move between rows; if toolbar is glued to list container top, deltas collapse.
    const deltas = tops.slice(1).map((top, i) => Math.abs(top - tops[i]!));
    expect(deltas.some((d) => d > 8)).toBe(true);
  });
});
