import { type Page, expect, test } from "@playwright/test";

/** The document in its blocks: just what the menu changes — types, IDs, text, children. */
interface Node {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  content: { text: string; marks: { type: string }[] }[] | string | null;
  children: Node[];
}
type Notion = {
  setContent(content: unknown): void;
  getJSON(): { blocks: Node[] };
};

const span = (text: string, ...marks: string[]) => ({
  text,
  marks: marks.map((type) => ({ type, attrs: {} })),
});
const block = (
  id: string,
  type: string,
  content: Node["content"],
  children: Node[] = [],
  attrs: Record<string, unknown> = {},
): Node => ({ id, type, attrs, content, children });
const row = (id: string, text: string, children: Node[] = []) =>
  block(id, "listItem", [span(text)], children);

const DOCUMENT = [
  block("L", "bulletList", null, [
    row("a", "alpha"),
    row("b", "beta", [block("N", "bulletList", null, [row("c", "gamma")])]),
    row("d", "delta"),
  ]),
  block("T", "todoList", null, [
    block("t1", "todoItem", [span("task one")], [], { checked: true }),
    block("t2", "todoItem", [span("task two")], [], { checked: false }),
  ]),
  block("C", "columns", null, [
    block("K1", "column", null, [
      block("CL", "bulletList", null, [row("x", "left one"), row("y", "left two")]),
    ]),
    block("K2", "column", null, [block("r", "paragraph", [span("right")])]),
  ]),
  block("H", "heading", [span("Bold", "bold"), span(" heading", "italic")], [], { level: 2 }),
  block("P", "paragraph", [span("after")]),
];

async function open(page: Page) {
  await page.goto("/#notion");
  await expect(page.locator("[data-gotipe-content]")).toBeVisible();
  await page.evaluate((blocks) => {
    const editor = (window as unknown as { __GOTIPE_NOTION_EDITOR__: Notion })
      .__GOTIPE_NOTION_EDITOR__;
    editor.setContent({ version: 1, blocks });
  }, DOCUMENT);
  await expect(page.locator('[data-block-id="x"]')).toBeVisible();
}
const json = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __GOTIPE_NOTION_EDITOR__: Notion }).__GOTIPE_NOTION_EDITOR__.getJSON()
        .blocks,
  );
const text = (node: Node) =>
  Array.isArray(node.content) ? node.content.map((part) => part.text).join("") : "";
const find = (blocks: Node[], id: string): Node | undefined =>
  blocks.length === 0
    ? undefined
    : (blocks.find((node) => node.id === id) ??
      find(
        blocks.flatMap((node) => node.children),
        id,
      ));
const rows = async (page: Page, id: string) =>
  (find(await json(page), id)?.children ?? []).map(text);

/**
 * Points at the first line of the block, opens its handle's menu and chooses `label`. The grip
 * belongs to `unit`: the block itself, or the row it sits in.
 */
async function choose(page: Page, id: string, label: string, unit = id) {
  const target = page.locator(`[data-block-id="${id}"]`);
  await target.scrollIntoViewIfNeeded();
  await target.hover({ position: { x: 24, y: 6 } });
  const grip = page.locator("[data-gotipe-drag-handle]");
  await expect(grip).toHaveAttribute("data-block-drag", unit);
  await grip.click();
  const menu = page.locator("[data-gotipe-context-menu]");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: label, exact: true }).click();
  await expect(menu).toHaveCount(0);
}

/** One ⌘Z in the document brings back the document before the action. */
async function undoOnce(page: Page, before: Node[]) {
  await page.locator('[data-block-id="P"]').click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => json(page)).toEqual(before);
}

test.describe("Block menu on a list row", () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test("Delete removes the row and its nested rows, not the list; one ⌘Z undoes it", async ({
    page,
  }) => {
    const before = await json(page);
    await choose(page, "b", "Delete");
    expect(await rows(page, "L")).toEqual(["alpha", "delta"]);
    await undoOnce(page, before);
  });

  test("Duplicate copies a nested row into its own list; one ⌘Z undoes it", async ({ page }) => {
    const before = await json(page);
    await choose(page, "c", "Duplicate");
    expect(await rows(page, "N")).toEqual(["gamma", "gamma"]);
    expect(await rows(page, "L")).toEqual(["alpha", "beta", "delta"]);
    await undoOnce(page, before);
  });

  test("a task and a row inside a column are deleted and duplicated alone", async ({ page }) => {
    await choose(page, "t2", "Delete");
    expect(await rows(page, "T")).toEqual(["task one"]);
    await choose(page, "x", "Duplicate");
    expect(await rows(page, "CL")).toEqual(["left one", "left one", "left two"]);
    expect(await rows(page, "K2")).toEqual(["right"]);
  });

  test("the handle of a paragraph inside a row acts on that row, not the list", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const editor = (window as unknown as { __GOTIPE_NOTION_EDITOR__: Notion })
        .__GOTIPE_NOTION_EDITOR__;
      const blocks = editor.getJSON().blocks;
      const b = blocks[0]!.children[1]!;
      // A loose item: the row's own text, then a paragraph of its own.
      b.children = [
        {
          id: "more",
          type: "paragraph",
          attrs: {},
          content: [{ text: "more", marks: [] }],
          children: [],
        },
      ];
      editor.setContent({ version: 1, blocks });
    });
    await choose(page, "more", "Duplicate", "b");
    expect(await rows(page, "L")).toEqual(["alpha", "beta", "beta", "delta"]);
    expect((await json(page)).filter((node) => node.type === "bulletList")).toHaveLength(1);
  });

  test("Delete on the only row of a column's list leaves a paragraph to type in", async ({
    page,
  }) => {
    await choose(page, "x", "Delete");
    await choose(page, "y", "Delete");
    const column = find(await json(page), "K1")!;
    expect(column.children.map((node) => node.type)).toEqual(["paragraph"]);
    await page.locator(`[data-block-id="${column.children[0]!.id}"]`).click();
    await page.keyboard.type("Z");
    await expect.poll(async () => find(await json(page), "K1")!.children.map(text)).toEqual(["Z"]);
  });

  test("Reset Formatting leaves plain text without marks; one ⌘Z undoes it", async ({ page }) => {
    const before = await json(page);
    await choose(page, "H", "Reset Formatting");
    const reset = find(await json(page), "H")!;
    expect(reset.type).toBe("paragraph");
    expect(reset.content).toEqual([{ text: "Bold heading", marks: [] }]);
    await undoOnce(page, before);
  });
});
