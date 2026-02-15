import { expect, test, type Page } from "@playwright/test";

type TopLevelBlock = {
  id: string;
  type: string;
};

type BlockMetrics = {
  top: number;
  y: number;
  textAnchorLeft: number;
};

const TARGET_TYPES = [
  "heading",
  "paragraph",
  "bulletList",
  "codeBlock",
  "callout",
  "blockquote",
  "todoList",
  "divider",
] as const;

async function openNotion(page: Page) {
  await page.goto("/#notion");
  await expect(page.locator('[data-gotipe-nav="notion"]')).toHaveClass(/active/);
  await expect(page.locator("[data-gotipe-content]")).toBeVisible();
}

async function readTopLevelBlocks(page: Page): Promise<TopLevelBlock[]> {
  return page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")) as HTMLElement[];
    return blocks.map((el) => ({
      id: el.getAttribute("data-block-id") ?? "",
      type: el.getAttribute("data-block-type") ?? "",
    }));
  });
}

async function readBlockMetrics(page: Page, id: string): Promise<BlockMetrics | null> {
  return page.evaluate((blockId) => {
    const block = document.querySelector(`[data-gotipe-content] > [data-block-id="${blockId}"]`) as HTMLElement | null;
    if (!block) return null;

    const getTextAnchorLeft = (blockEl: HTMLElement): number => {
      const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const text = n.textContent ?? "";
        if (!text.trim()) continue;
        const r = document.createRange();
        r.setStart(n, 0);
        r.setEnd(n, Math.min(1, text.length));
        const rr = r.getBoundingClientRect();
        if (rr.width > 0 || rr.height > 0) return rr.left;
      }
      return blockEl.getBoundingClientRect().left;
    };

    const rect = block.getBoundingClientRect();
    return {
      top: rect.top,
      y: rect.top + Math.min(24, Math.max(10, rect.height / 2)),
      textAnchorLeft: getTextAnchorLeft(block),
    };
  }, id);
}

async function getTargetByType(page: Page, type: string): Promise<TopLevelBlock> {
  const blocks = await readTopLevelBlocks(page);
  const target = blocks.find((b) => b.type === type) ?? null;
  expect(target, `Missing top-level block of type: ${type}`).not.toBeNull();
  return target!;
}

async function fastHoverBlock(page: Page, blockId: string): Promise<void> {
  const targetLocator = page.locator(`[data-gotipe-content] > [data-block-id="${blockId}"]`);
  await targetLocator.scrollIntoViewIfNeeded();

  const metrics = await readBlockMetrics(page, blockId);
  expect(metrics).not.toBeNull();

  const textX = Math.max(8, (metrics?.textAnchorLeft ?? 0) + 12);
  const gutterX = Math.max(4, (metrics?.textAnchorLeft ?? 0) - 28);
  const y = metrics?.y ?? 10;

  // Fast movement pattern: outside -> text -> left gutter near toolbar
  await page.mouse.move(4, 4);
  await page.mouse.move(textX, y, { steps: 1 });
  await page.mouse.move(gutterX, y, { steps: 1 });
}

async function expectToolbarOnBlock(page: Page, blockId: string): Promise<void> {
  const toolbar = page.locator(".gotipe-block-toolbar-wrapper");
  await expect(toolbar).toBeVisible();
  await expect(toolbar.locator('[aria-label="Click to add below. Option-click to add a block above"]')).toBeVisible();
  await expect(toolbar.locator("[data-gotipe-drag-handle]")).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate((id) => {
        const block = document.querySelector(`[data-gotipe-content] > [data-block-id="${id}"]`) as HTMLElement | null;
        const content = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
        const topLevel = Array.from(
          document.querySelectorAll("[data-gotipe-content] > [data-block-id]"),
        ) as HTMLElement[];
        const wrapper = document.querySelector(".gotipe-block-toolbar-wrapper") as HTMLElement | null;
        if (!block || !wrapper || !content) return "missing";

        const br = block.getBoundingClientRect();
        const candidateLefts = topLevel
          .filter((el) => (el.getAttribute("data-block-type") ?? "") !== "divider")
          .map((el) => el.getBoundingClientRect().left);
        const columnLeft = candidateLefts.length > 0
          ? Math.min(...candidateLefts)
          : content.getBoundingClientRect().left;
        const wr = wrapper.getBoundingClientRect();
        const topOk = Math.abs(wr.top - br.top) < 24;
        const expectedLeft = Math.round(columnLeft - 45);
        const leftOk = Math.abs(Math.round(wr.left) - expectedLeft) <= 2;
        return `${topOk}|${leftOk}`;
      }, blockId),
    )
    .toBe("true|true");
}

async function readTopLevelSnapshot(page: Page): Promise<{ ids: string[]; types: string[] }> {
  return page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")) as HTMLElement[];
    return {
      ids: blocks.map((b) => b.getAttribute("data-block-id") ?? ""),
      types: blocks.map((b) => b.getAttribute("data-block-type") ?? ""),
    };
  });
}

async function readListChildSnapshot(page: Page, listId: string): Promise<{ ids: string[]; types: string[] }> {
  return page.evaluate((id) => {
    const list = document.querySelector(`[data-gotipe-content] > [data-block-id="${id}"]`) as HTMLElement | null;
    if (!list) return { ids: [], types: [] };
    const rows = Array.from(list.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-block-id"),
    );
    return {
      ids: rows.map((row) => row.getAttribute("data-block-id") ?? ""),
      types: rows.map((row) => row.getAttribute("data-block-type") ?? ""),
    };
  }, listId);
}

test.describe("Block toolbar fast-hover reliability", () => {
  test.beforeEach(async ({ page }) => {
    await openNotion(page);
  });

  test("rapid sweep across all top-level blocks keeps toolbar responsive", async ({ page }) => {
    const blocks = await readTopLevelBlocks(page);
    expect(blocks.length).toBeGreaterThan(6);

    for (const target of blocks) {
      await fastHoverBlock(page, target.id);
      await expectToolbarOnBlock(page, target.id);
    }
  });

  for (const type of TARGET_TYPES) {
    test(`plus button works after fast hover on ${type}`, async ({ page }) => {
      const target = await getTargetByType(page, type);
      const before = await readTopLevelSnapshot(page);
      const beforeList = type === "bulletList" || type === "todoList"
        ? await readListChildSnapshot(page, target.id)
        : null;
      const index = before.ids.indexOf(target.id);
      expect(index).toBeGreaterThanOrEqual(0);

      await fastHoverBlock(page, target.id);
      await expectToolbarOnBlock(page, target.id);

      await page.locator('[aria-label="Click to add below. Option-click to add a block above"]').click();

      if (type === "bulletList" || type === "todoList") {
        await expect
          .poll(async () => (await readTopLevelSnapshot(page)).ids.length)
          .toBe(before.ids.length);
        await expect
          .poll(async () => (await readListChildSnapshot(page, target.id)).ids.length)
          .toBe((beforeList?.ids.length ?? 0) + 1);

        const listAfter = await readListChildSnapshot(page, target.id);
        const expectedChildType = type === "todoList" ? "todoItem" : "listItem";
        expect(listAfter.types.every((childType) => childType === expectedChildType)).toBe(true);
      } else {
        await expect
          .poll(async () => (await readTopLevelSnapshot(page)).ids.length)
          .toBe(before.ids.length + 1);

        const after = await readTopLevelSnapshot(page);
        expect(after.ids[index]).toBe(target.id);
        expect(after.types[index + 1]).toBe("paragraph");
      }
    });
  }

  for (const type of TARGET_TYPES) {
    test(`drag handle opens context menu after fast hover on ${type}`, async ({ page }) => {
      const target = await getTargetByType(page, type);

      await fastHoverBlock(page, target.id);
      await expectToolbarOnBlock(page, target.id);

      await page.locator("[data-gotipe-drag-handle]").click();
      await expect(page.locator("[data-gotipe-context-menu]")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-gotipe-context-menu]")).not.toBeVisible();
    });
  }

  test("orderedList supports fast hover + plus/drag in custom document", async ({ page }) => {
    const ok = await page.evaluate(() => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | { setContent?: (content: unknown) => void }
        | undefined;
      if (!editor?.setContent) return false;

      editor.setContent({
        version: 1,
        blocks: [
          {
            id: "custom-title",
            type: "heading",
            attrs: { level: 2 },
            content: [{ text: "Ordered test", marks: [] }],
            children: [],
          },
          {
            id: "custom-ordered",
            type: "orderedList",
            attrs: {},
            content: null,
            children: [
              {
                id: "custom-li-1",
                type: "listItem",
                attrs: {},
                content: [{ text: "First item", marks: [] }],
                children: [],
              },
              {
                id: "custom-li-2",
                type: "listItem",
                attrs: {},
                content: [{ text: "Second item", marks: [] }],
                children: [],
              },
            ],
          },
          {
            id: "custom-tail",
            type: "paragraph",
            attrs: {},
            content: [{ text: "Tail", marks: [] }],
            children: [],
          },
        ],
      });
      return true;
    });
    expect(ok).toBe(true);

    const target = await getTargetByType(page, "orderedList");
    const before = await readTopLevelSnapshot(page);
    const beforeRows = await readListChildSnapshot(page, target.id);
    const idx = before.ids.indexOf(target.id);
    expect(idx).toBeGreaterThanOrEqual(0);

    await fastHoverBlock(page, target.id);
    await expectToolbarOnBlock(page, target.id);

    await page.locator("[data-gotipe-drag-handle]").click();
    await expect(page.locator("[data-gotipe-context-menu]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-gotipe-context-menu]")).not.toBeVisible();

    await page.locator('[aria-label="Click to add below. Option-click to add a block above"]').click();
    await expect.poll(async () => (await readTopLevelSnapshot(page)).ids.length).toBe(before.ids.length);
    await expect.poll(async () => (await readListChildSnapshot(page, target.id)).ids.length).toBe(beforeRows.ids.length + 1);

    const after = await readTopLevelSnapshot(page);
    expect(after.ids[idx]).toBe(target.id);
    const rowsAfter = await readListChildSnapshot(page, target.id);
    expect(rowsAfter.types.every((rowType) => rowType === "listItem")).toBe(true);
  });
});
