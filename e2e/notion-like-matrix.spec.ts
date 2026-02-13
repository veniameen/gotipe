import { expect, test, type Page } from "@playwright/test";

type BlockContext = {
  blockType: string | null;
  parentType: string | null;
  tagName: string | null;
  text: string;
  height: number;
};

type SelectionContext = {
  blockType: string | null;
  parentType: string | null;
};

type TodoCaretState = {
  inTextHost: boolean;
  atItemStart: boolean;
  onCheckbox: boolean;
  anchorOffset: number;
};

function marker(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

async function openNotion(page: Page) {
  await page.goto("/#notion");
  await expect(page.locator('[data-gotipe-nav="notion"]')).toHaveClass(/active/);
  await expect(page.locator("[data-gotipe-content]")).toBeVisible();
}

async function resetNotionDocument(page: Page) {
  const ok = await page.evaluate(() => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { setContent?: (content: unknown) => void }
      | undefined;
    if (!editor || typeof editor.setContent !== "function") return false;
    editor.setContent({
      version: 1,
      blocks: [
        {
          id: "qa-root",
          type: "paragraph",
          attrs: {},
          content: [{ text: "", marks: [] }],
          children: [],
        },
      ],
    });
    return true;
  });

  expect(ok).toBe(true);
  await expect
    .poll(async () =>
      page.evaluate(
        () => document.querySelectorAll("[data-gotipe-content] > [data-block-id]").length,
      ),
    )
    .toBeGreaterThan(0);
  await page.locator("[data-gotipe-content]").click();
}

async function setCaretToEndOfLastTopLevelBlock(page: Page) {
  await page.evaluate(() => {
    const editor = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const blocks = Array.from(
      document.querySelectorAll("[data-gotipe-content] > [data-block-id]"),
    ) as HTMLElement[];
    const target = blocks[blocks.length - 1] ?? null;
    if (!editor || !target) return;

    const sel = window.getSelection();
    if (!sel) return;

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let lastText: Node | null = null;
    let current: Node | null;
    while ((current = walker.nextNode())) {
      lastText = current;
    }

    const range = document.createRange();
    if (lastText) {
      range.setStart(lastText, (lastText.textContent ?? "").length);
    } else {
      range.setStart(target, target.childNodes.length);
    }
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
  });
  await page.waitForTimeout(20);
}

async function createFreshLine(page: Page) {
  await setCaretToEndOfLastTopLevelBlock(page);
  await page.keyboard.press("Enter");
}

async function setCaretToStartOfLastTopLevelParagraph(page: Page) {
  await page.evaluate(() => {
    const editor = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const paragraphs = Array.from(
      document.querySelectorAll('[data-gotipe-content] > [data-block-type="paragraph"]'),
    ) as HTMLElement[];
    const blocks = Array.from(
      document.querySelectorAll("[data-gotipe-content] > [data-block-id]"),
    ) as HTMLElement[];
    const target = paragraphs[paragraphs.length - 1] ?? blocks[blocks.length - 1] ?? null;
    if (!editor || !target) return;

    const sel = window.getSelection();
    if (!sel) return;

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const firstText = walker.nextNode();
    const range = document.createRange();
    if (firstText) {
      range.setStart(firstText, 0);
    } else {
      range.setStart(target, 0);
    }
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
  });
  await page.waitForTimeout(20);
}

async function runSlashCommand(page: Page, query: string) {
  const slashMenu = page.locator("[data-gotipe-slash-menu]");
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.type(`/${query}`, { delay: 10 });
    try {
      await expect(slashMenu).toBeVisible({ timeout: 1200 });
      break;
    } catch {
      for (let i = 0; i < query.length + 1; i++) {
        await page.keyboard.press("Backspace");
      }
      if (attempt === 2) throw new Error(`Slash menu did not open for query: ${query}`);
      await page.waitForTimeout(40);
    }
  }
  await page.keyboard.press("Enter");
  await expect(slashMenu).toBeHidden();
}

async function runSlashCommandByName(page: Page, query: string, name: string) {
  await page.keyboard.type(`/${query}`, { delay: 10 });
  const slashMenu = page.locator("[data-gotipe-slash-menu]");
  await expect(slashMenu).toBeVisible();
  const item = slashMenu.locator(".gotipe-slash-menu-item-title", { hasText: name }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(slashMenu).toBeHidden();
}

async function openSlashMenuOnFreshLine(page: Page) {
  const slashMenu = page.locator("[data-gotipe-slash-menu]");

  for (let attempt = 0; attempt < 3; attempt++) {
    await createFreshLine(page);
    await page.waitForTimeout(50);
    await setCaretToStartOfLastTopLevelParagraph(page);
    await typeStable(page, "/");
    try {
      await expect(slashMenu).toBeVisible({ timeout: 1200 });
      return;
    } catch {
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(40);
    }
  }

  await expect(slashMenu).toBeVisible();
}

async function placeCaretAtStartOfBlockByMarker(page: Page, textMarker: string) {
  await page.evaluate((needle) => {
    const editor = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const blocks = Array.from(document.querySelectorAll("[data-block-id]")) as HTMLElement[];
    const target = blocks.find((el) => {
      const selfHas = (el.textContent ?? "").includes(needle);
      if (!selfHas) return false;
      const childHas = Array.from(el.querySelectorAll("[data-block-id]")).some((child) => {
        if (!(child instanceof HTMLElement) || child === el) return false;
        return (child.textContent ?? "").includes(needle);
      });
      return !childHas;
    });
    if (!target || !editor) return;

    const sel = window.getSelection();
    if (!sel) return;

    // Focus first, then set the range. Some browsers collapse selection to end on focus.
    editor.focus();

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const firstText = walker.nextNode();
    const range = document.createRange();
    if (firstText) {
      range.setStart(firstText, 0);
    } else {
      range.setStart(target, 0);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }, textMarker);

  await expect
    .poll(async () =>
      page.evaluate((needle) => {
        const sel = window.getSelection();
        const anchorEl =
          sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
        const block = anchorEl?.closest("[data-block-id]") as HTMLElement | null;
        if (!block) return false;
        const isLeafForMarker = (block.textContent ?? "").includes(needle);
        return isLeafForMarker && (sel?.anchorOffset ?? -1) === 0;
      }, textMarker),
    )
    .toBe(true);
}

async function placeCaretInTopLevelListItem(
  page: Page,
  listType: "bulletList" | "orderedList" | "todoList",
  itemType: "listItem" | "todoItem",
  index = 0,
  offsetMode: "start" | "end" = "end",
) {
  await page.evaluate(({ listType, itemType, index, offsetMode }) => {
    const selector = `[data-gotipe-content] > [data-block-type="${listType}"] > [data-block-type="${itemType}"]`;
    const nodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    const target = nodes[index];
    if (!target) return;

    const sel = window.getSelection();
    if (!sel) return;

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const firstText = walker.nextNode();
    const range = document.createRange();
    if (firstText) {
      const len = (firstText.textContent ?? "").length;
      range.setStart(firstText, offsetMode === "start" ? 0 : len);
    } else {
      const contentHost = target.querySelector("[data-gotipe-todo-content]");
      if (contentHost) {
        range.setStart(contentHost, 0);
      } else {
        range.setStart(target, 0);
      }
    }
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);
    (document.querySelector("[data-gotipe-content]") as HTMLElement | null)?.focus();
  }, { listType, itemType, index, offsetMode });
  await page.waitForTimeout(20);
}

async function getBlockContextByMarker(page: Page, textMarker: string): Promise<BlockContext | null> {
  return page.evaluate((needle) => {
    const blocks = Array.from(document.querySelectorAll("[data-block-id]")) as HTMLElement[];
    const target = blocks.find((el) => {
      const selfHas = (el.textContent ?? "").includes(needle);
      if (!selfHas) return false;
      const childHas = Array.from(el.querySelectorAll("[data-block-id]")).some((child) => {
        if (!(child instanceof HTMLElement) || child === el) return false;
        return (child.textContent ?? "").includes(needle);
      });
      return !childHas;
    });
    if (!target) return null;

    const parent = target.parentElement?.closest("[data-block-id]") as HTMLElement | null;
    return {
      blockType: target.getAttribute("data-block-type"),
      parentType: parent?.getAttribute("data-block-type") ?? null,
      tagName: target.tagName,
      text: target.textContent ?? "",
      height: target.getBoundingClientRect().height,
    };
  }, textMarker);
}

async function getSelectionContext(page: Page): Promise<SelectionContext> {
  return page.evaluate(() => {
    const sel = window.getSelection();
    const anchorEl =
      sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
    const blockEl = anchorEl?.closest("[data-block-id]") as HTMLElement | null;
    const parentEl = blockEl?.parentElement?.closest("[data-block-id]") as HTMLElement | null;
    return {
      blockType: blockEl?.getAttribute("data-block-type") ?? null,
      parentType: parentEl?.getAttribute("data-block-type") ?? null,
    };
  });
}

async function expectBlockByMarker(
  page: Page,
  textMarker: string,
  expectedBlockType: string,
  expectedParentType: string | null,
) {
  await expect
    .poll(async () => {
      const ctx = await getBlockContextByMarker(page, textMarker);
      return `${ctx?.blockType ?? "null"}|${ctx?.parentType ?? "null"}`;
    })
    .toBe(`${expectedBlockType}|${expectedParentType ?? "null"}`);
}

async function typeStable(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 10 });
}

async function clickTodoItemLeftZone(page: Page, index = 0) {
  const item = page.locator(
    '[data-gotipe-content] > [data-block-type="todoList"] > [data-block-type="todoItem"]',
  ).nth(index);
  const checkbox = item.locator('input[type="checkbox"]');
  await expect(item).toBeVisible();
  await expect(checkbox).toBeVisible();

  const itemBox = await item.boundingBox();
  const checkboxBox = await checkbox.boundingBox();
  if (!itemBox || !checkboxBox) throw new Error("Cannot resolve todo item metrics");

  const x = Math.max(itemBox.x + 1, checkboxBox.x - 3);
  const y = checkboxBox.y + checkboxBox.height / 2;
  await page.mouse.click(x, y);
}

async function getTodoCaretState(page: Page, index = 0): Promise<TodoCaretState | null> {
  return page.evaluate((itemIndex) => {
    const items = Array.from(
      document.querySelectorAll(
        '[data-gotipe-content] > [data-block-type="todoList"] > [data-block-type="todoItem"]',
      ),
    ) as HTMLElement[];
    const todoItem = items[itemIndex] ?? null;
    if (!todoItem) return null;

    const textHost = todoItem.querySelector("[data-gotipe-todo-content]");
    const checkbox = todoItem.querySelector('input[type="checkbox"]');
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !textHost) return null;

    const anchorEl =
      sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;

    return {
      inTextHost: !!(textHost === sel.anchorNode || textHost.contains(anchorEl ?? null)),
      atItemStart: sel.anchorNode === todoItem && sel.anchorOffset === 0,
      onCheckbox: !!(checkbox && (checkbox === sel.anchorNode || checkbox.contains(anchorEl ?? null))),
      anchorOffset: sel.anchorOffset,
    };
  }, index);
}

test.describe("Notion-like matrix regressions", () => {
  test.beforeEach(async ({ page }) => {
    await openNotion(page);
    await resetNotionDocument(page);
  });

  test("NL-001: click at start of empty paragraph keeps caret in paragraph start", async ({ page }) => {
    const coords = await page.evaluate(() => {
      const paragraph = document.querySelector(
        '[data-gotipe-content] > [data-block-type="paragraph"]',
      ) as HTMLElement | null;
      if (!paragraph) return null;
      const rect = paragraph.getBoundingClientRect();
      return {
        x: rect.left + 8,
        y: rect.top + rect.height / 2,
      };
    });
    expect(coords).not.toBeNull();
    await page.mouse.click(coords!.x, coords!.y);

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const paragraph = document.querySelector(
            '[data-gotipe-content] > [data-block-type="paragraph"]',
          ) as HTMLElement | null;
          const content = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
          const blockId = paragraph?.getAttribute("data-block-id") ?? null;
          const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
            | { getViewState?: () => { selection?: { anchor: { blockId: string; offset: number } } } }
            | undefined;
          const stateSel = editor?.getViewState?.().selection;
          const sel = window.getSelection();
          if (!paragraph || !content || !stateSel || !sel || sel.rangeCount === 0 || !blockId) return "missing";

          const anchorEl =
            sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
          const inParagraph = !!(
            anchorEl &&
            (anchorEl === paragraph || paragraph.contains(anchorEl))
          );
          const atRootLeftEdge = sel.anchorNode === content && sel.anchorOffset === 0;
          const stateMatchesParagraph = stateSel.anchor.blockId === blockId;
          return `${inParagraph}|${atRootLeftEdge}|${stateMatchesParagraph}|${stateSel.anchor.offset}`;
        }),
      )
      .toBe("true|false|true|0");
  });

  test("slash: paragraph -> bullet list keeps row visible", async ({ page }) => {
    const m = marker("bullet");
    await createFreshLine(page);
    await runSlashCommand(page, "bullet");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 0);
    await typeStable(page, m);

    await expectBlockByMarker(page, m, "listItem", "bulletList");
    const ctx = await getBlockContextByMarker(page, m);
    expect(ctx?.height ?? 0).toBeGreaterThan(18);
  });

  test("slash: paragraph -> numbered list", async ({ page }) => {
    const m = marker("ordered");
    await createFreshLine(page);
    await runSlashCommand(page, "numbered");
    await placeCaretInTopLevelListItem(page, "orderedList", "listItem", 0);
    await typeStable(page, m);

    await expectBlockByMarker(page, m, "listItem", "orderedList");
  });

  test("slash: paragraph -> todo list", async ({ page }) => {
    const m = marker("todo");
    await createFreshLine(page);
    await runSlashCommand(page, "todo");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
    await typeStable(page, m);

    await expectBlockByMarker(page, m, "todoItem", "todoList");
  });

  test("todo caret stays after checkbox in empty item", async ({ page }) => {
    await createFreshLine(page);
    await runSlashCommand(page, "todo");

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const checkbox = document.querySelector(
            '[data-gotipe-content] > [data-block-type="todoList"] > [data-block-type="todoItem"] input[type="checkbox"]',
          ) as HTMLInputElement | null;
          const todoItem = checkbox?.closest('[data-block-type="todoItem"]');
          const textHost = todoItem?.querySelector("[data-gotipe-todo-content]") ?? null;
          const sel = window.getSelection();
          if (!checkbox || !sel || sel.rangeCount === 0) return "null";

          const anchorEl =
            sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
          const insideTextHost = !!(
            textHost && (textHost === sel.anchorNode || textHost.contains(anchorEl ?? null))
          );
          const anchorOnItemLeftEdge = sel.anchorNode === todoItem && sel.anchorOffset === 0;
          return `${insideTextHost}|${anchorOnItemLeftEdge}`;
        }),
      )
      .toBe("true|false");
  });

  test("todo click in left zone normalizes caret after checkbox (empty item)", async ({ page }) => {
    await createFreshLine(page);
    await runSlashCommand(page, "todo");
    await clickTodoItemLeftZone(page, 0);

    await expect
      .poll(async () => {
        const state = await getTodoCaretState(page, 0);
        return `${state?.inTextHost ?? false}|${state?.atItemStart ?? true}|${state?.onCheckbox ?? true}`;
      })
      .toBe("true|false|false");
  });

  test("todo click in left zone normalizes caret after checkbox (item with text)", async ({ page }) => {
    const m = marker("todoLeftClick");
    await createFreshLine(page);
    await runSlashCommand(page, "todo");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
    await typeStable(page, m);
    await clickTodoItemLeftZone(page, 0);

    await expect
      .poll(async () => {
        const state = await getTodoCaretState(page, 0);
        return `${state?.inTextHost ?? false}|${state?.atItemStart ?? true}|${state?.onCheckbox ?? true}`;
      })
      .toBe("true|false|false");
  });

  test("todo checkbox is vertically aligned with text and has spacing", async ({ page }) => {
    const m = marker("todoAlign");
    await createFreshLine(page);
    await runSlashCommand(page, "todo");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
    await typeStable(page, m);

    const metrics = await page.evaluate((needle) => {
      const items = Array.from(
        document.querySelectorAll('[data-gotipe-content] > [data-block-type="todoList"] > [data-block-type="todoItem"]'),
      ) as HTMLElement[];
      const target = items.find((el) => (el.textContent ?? "").includes(needle));
      if (!target) return null;

      const checkbox = target.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const content = target.querySelector('[data-gotipe-todo-content]') as HTMLElement | null;
      if (!checkbox || !content) return null;

      const cb = checkbox.getBoundingClientRect();
      const txt = content.getBoundingClientRect();
      return {
        centerDiff: Math.abs((cb.top + cb.height / 2) - (txt.top + txt.height / 2)),
        gap: txt.left - cb.right,
        checkboxSize: cb.width,
      };
    }, m);

    expect(metrics).not.toBeNull();
    expect(metrics?.centerDiff ?? 99).toBeLessThan(7);
    expect(metrics?.gap ?? 0).toBeGreaterThan(6);
    expect(metrics?.checkboxSize ?? 0).toBeGreaterThan(17);
  });

  test("slash: todo -> bullet conversion keeps existing text rows", async ({ page }) => {
    const m = marker("todo2bullet");
    await createFreshLine(page);
    await runSlashCommand(page, "todo");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
    await typeStable(page, m);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 1);
    await runSlashCommand(page, "bullet");

    await expectBlockByMarker(page, m, "listItem", "bulletList");
  });

  test("slash: todo -> ordered conversion keeps existing text rows", async ({ page }) => {
    const m = marker("todo2ordered");
    await createFreshLine(page);
    await runSlashCommand(page, "todo");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
    await typeStable(page, m);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 1);
    await runSlashCommand(page, "numbered");

    await expectBlockByMarker(page, m, "listItem", "orderedList");
  });

  test("slash: bullet -> todo conversion keeps existing text rows", async ({ page }) => {
    const m = marker("bullet2todo");
    await createFreshLine(page);
    await runSlashCommand(page, "bullet");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 0);
    await typeStable(page, m);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 1);
    await runSlashCommand(page, "todo");

    await expectBlockByMarker(page, m, "todoItem", "todoList");
  });

  test("slash: ordered -> bullet conversion keeps existing text rows", async ({ page }) => {
    const m = marker("ordered2bullet");
    await createFreshLine(page);
    await runSlashCommand(page, "numbered");
    await placeCaretInTopLevelListItem(page, "orderedList", "listItem", 0);
    await typeStable(page, m);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "orderedList", "listItem", 1);
    await runSlashCommand(page, "bullet");

    await expectBlockByMarker(page, m, "listItem", "bulletList");
  });

  test("slash: third bullet item -> heading keeps caret on transformed row", async ({ page }) => {
    const first = marker("bulletRow1");
    const second = marker("bulletRow2");

    await createFreshLine(page);
    await runSlashCommand(page, "bullet");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 0);
    await typeStable(page, first);

    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 1);
    await typeStable(page, second);

    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 2);
    await runSlashCommandByName(page, "h1", "Heading 1");

    await expectBlockByMarker(page, first, "listItem", "bulletList");
    await expectBlockByMarker(page, second, "listItem", "bulletList");
    await expect
      .poll(async () => {
        const ctx = await getSelectionContext(page);
        return `${ctx.blockType ?? "null"}|${ctx.parentType ?? "null"}`;
      })
      .toBe("heading|null");
  });

  test("slash: third todo item -> heading keeps caret on transformed row", async ({ page }) => {
    const first = marker("todoRow1");
    const second = marker("todoRow2");

    await createFreshLine(page);
    await runSlashCommand(page, "todo");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
    await typeStable(page, first);

    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 1);
    await typeStable(page, second);

    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 2);
    await runSlashCommandByName(page, "h1", "Heading 1");

    await expectBlockByMarker(page, first, "todoItem", "todoList");
    await expectBlockByMarker(page, second, "todoItem", "todoList");
    await expect
      .poll(async () => {
        const ctx = await getSelectionContext(page);
        return `${ctx.blockType ?? "null"}|${ctx.parentType ?? "null"}`;
      })
      .toBe("heading|null");
  });

  test("slash click + immediate typing does not lose first character (heading)", async ({ page }) => {
    const typed = marker("fast");
    await createFreshLine(page);
    await runSlashCommandByName(page, "h1", "Heading 1");
    await page.keyboard.type(typed, { delay: 0 });

    await expect
      .poll(async () => {
        const ctx = await getSelectionContext(page);
        if (ctx.blockType !== "heading") return `block:${ctx.blockType ?? "null"}`;
        return page.evaluate(() => {
          const sel = window.getSelection();
          const anchorEl =
            sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
          const block = anchorEl?.closest("[data-block-id]") as HTMLElement | null;
          return block?.textContent ?? "";
        });
      })
      .toBe(typed);
  });

  test("slash: third bullet item -> heading + immediate typing stays on transformed row", async ({ page }) => {
    const first = marker("bulletStable1");
    const second = marker("bulletStable2");
    const typed = marker("bulletStableTyped");

    await createFreshLine(page);
    await runSlashCommand(page, "bullet");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 0);
    await typeStable(page, first);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 1);
    await typeStable(page, second);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 2);
    await runSlashCommandByName(page, "h1", "Heading 1");
    await page.keyboard.type(typed, { delay: 0 });

    await expectBlockByMarker(page, first, "listItem", "bulletList");
    await expectBlockByMarker(page, second, "listItem", "bulletList");
    await expect
      .poll(async () =>
        page.evaluate((prefix) => {
          const headings = Array.from(
            document.querySelectorAll('[data-gotipe-content] > [data-block-type="heading"]'),
          ) as HTMLElement[];
          const heading = headings[headings.length - 1] ?? null;
          const text = heading?.textContent ?? "";
          return `${text.length}|${text.includes(prefix)}`;
        }, typed.slice(2)),
      )
      .toBe(`${typed.length}|true`);
    await expect
      .poll(async () => {
        const ctx = await getSelectionContext(page);
        return ctx.blockType;
      })
      .toBe("heading");
  });

  test("slash: third todo item -> heading + immediate typing stays on transformed row", async ({ page }) => {
    const first = marker("todoStable1");
    const second = marker("todoStable2");
    const typed = marker("todoStableTyped");

    await createFreshLine(page);
    await runSlashCommand(page, "todo");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
    await typeStable(page, first);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 1);
    await typeStable(page, second);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 2);
    await runSlashCommandByName(page, "h1", "Heading 1");
    await page.keyboard.type(typed, { delay: 0 });

    await expectBlockByMarker(page, first, "todoItem", "todoList");
    await expectBlockByMarker(page, second, "todoItem", "todoList");
    await expect
      .poll(async () =>
        page.evaluate((prefix) => {
          const headings = Array.from(
            document.querySelectorAll('[data-gotipe-content] > [data-block-type="heading"]'),
          ) as HTMLElement[];
          const heading = headings[headings.length - 1] ?? null;
          const text = heading?.textContent ?? "";
          return `${text.length}|${text.includes(prefix)}`;
        }, typed.slice(2)),
      )
      .toBe(`${typed.length}|true`);
    await expect
      .poll(async () => {
        const ctx = await getSelectionContext(page);
        return ctx.blockType;
      })
      .toBe("heading");
  });

  test("backspace at start of second bullet item lifts it to paragraph", async ({ page }) => {
    const first = marker("backspaceBullet1");
    const second = marker("backspaceBullet2");

    await createFreshLine(page);
    await runSlashCommand(page, "bullet");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 0);
    await typeStable(page, first);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 1);
    await typeStable(page, second);

    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 1, "start");
    await page.keyboard.press("Backspace");

    await expectBlockByMarker(page, first, "listItem", "bulletList");
    await expectBlockByMarker(page, second, "paragraph", null);
    await expect
      .poll(async () => {
        const ctx = await getSelectionContext(page);
        return `${ctx.blockType ?? "null"}|${ctx.parentType ?? "null"}`;
      })
      .toBe("paragraph|null");
  });

  test("backspace at start of second todo item lifts it to paragraph", async ({ page }) => {
    const first = marker("backspaceTodo1");
    const second = marker("backspaceTodo2");

    await createFreshLine(page);
    await runSlashCommand(page, "todo");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
    await typeStable(page, first);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 1);
    await typeStable(page, second);

    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 1, "start");
    await page.keyboard.press("Backspace");

    await expectBlockByMarker(page, first, "todoItem", "todoList");
    await expectBlockByMarker(page, second, "paragraph", null);
    await expect
      .poll(async () => {
        const ctx = await getSelectionContext(page);
        return `${ctx.blockType ?? "null"}|${ctx.parentType ?? "null"}`;
      })
      .toBe("paragraph|null");
  });

  test.fixme("slash at line start preserves existing text", async ({ page }) => {
    const m = marker("preserve");
    await createFreshLine(page);
    await typeStable(page, m);
    await placeCaretAtStartOfBlockByMarker(page, m);
    await runSlashCommand(page, "bullet");

    await expectBlockByMarker(page, m, "listItem", "bulletList");
  });

  test("slash menu supports ArrowUp/ArrowDown/Enter keyboard flow", async ({ page }) => {
    await createFreshLine(page);
    await page.keyboard.type("/heading", { delay: 10 });

    const slashMenu = page.locator("[data-gotipe-slash-menu]");
    await expect(slashMenu).toBeVisible();

    const items = slashMenu.locator("[data-gotipe-slash-item]");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toHaveClass(/selected/);
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toHaveClass(/selected/);
    await page.keyboard.press("ArrowUp");
    await expect(items.nth(0)).toHaveClass(/selected/);

    await page.keyboard.press("Enter");
    await expect(slashMenu).toBeHidden();
    await expect
      .poll(async () => {
        const ctx = await getSelectionContext(page);
        return ctx.blockType;
      })
      .toBe("heading");
    const topLevelCtx = await page.evaluate(() => {
      const blocks = Array.from(
        document.querySelectorAll("[data-gotipe-content] > [data-block-id]"),
      ) as HTMLElement[];
      const target = blocks[blocks.length - 1] ?? null;
      return {
        blockType: target?.getAttribute("data-block-type") ?? null,
        tagName: target?.tagName ?? null,
      };
    });
    expect(topLevelCtx.blockType).toBe("heading");
    expect(topLevelCtx.tagName).toBe("H1");
  });

  test("slash menu Escape closes menu and keeps editor usable", async ({ page }) => {
    const m = marker("esc");
    await createFreshLine(page);
    await page.keyboard.type("/todo", { delay: 10 });

    const slashMenu = page.locator("[data-gotipe-slash-menu]");
    await expect(slashMenu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(slashMenu).toBeHidden();

    await typeStable(page, ` ${m}`);
    await expectBlockByMarker(page, m, "paragraph", null);
  });

  test("todo Enter on non-empty item creates next todo item", async ({ page }) => {
    const first = marker("todoFirst");
    const second = marker("todoSecond");

    await createFreshLine(page);
    await runSlashCommand(page, "todo");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
    await typeStable(page, first);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 1);
    await typeStable(page, second);

    await expectBlockByMarker(page, second, "todoItem", "todoList");
    const count = await page.evaluate((needle) => {
      const blocks = Array.from(document.querySelectorAll("[data-block-id]")) as HTMLElement[];
      const target = blocks.find((el) => {
        if (!(el.textContent ?? "").includes(needle)) return false;
        const childHas = Array.from(el.querySelectorAll("[data-block-id]")).some((child) => {
          if (!(child instanceof HTMLElement) || child === el) return false;
          return (child.textContent ?? "").includes(needle);
        });
        return !childHas;
      });
      const list = target?.parentElement?.closest('[data-block-type="todoList"]');
      return list ? list.querySelectorAll('[data-block-type="todoItem"]').length : 0;
    }, second);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("bullet Enter on non-empty item creates next list item", async ({ page }) => {
    const first = marker("bulletFirst");
    const second = marker("bulletSecond");

    await createFreshLine(page);
    await runSlashCommand(page, "bullet");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 0);
    await typeStable(page, first);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 1);
    await typeStable(page, second);

    await expectBlockByMarker(page, second, "listItem", "bulletList");
    const count = await page.evaluate((needle) => {
      const blocks = Array.from(document.querySelectorAll("[data-block-id]")) as HTMLElement[];
      const target = blocks.find((el) => {
        if (!(el.textContent ?? "").includes(needle)) return false;
        const childHas = Array.from(el.querySelectorAll("[data-block-id]")).some((child) => {
          if (!(child instanceof HTMLElement) || child === el) return false;
          return (child.textContent ?? "").includes(needle);
        });
        return !childHas;
      });
      const list = target?.parentElement?.closest('[data-block-type="bulletList"]');
      return list ? list.querySelectorAll('[data-block-type="listItem"]').length : 0;
    }, second);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("ordered Enter on non-empty item creates next list item", async ({ page }) => {
    const first = marker("orderedFirst");
    const second = marker("orderedSecond");

    await createFreshLine(page);
    await runSlashCommand(page, "numbered");
    await placeCaretInTopLevelListItem(page, "orderedList", "listItem", 0);
    await typeStable(page, first);
    await page.keyboard.press("Enter");
    await placeCaretInTopLevelListItem(page, "orderedList", "listItem", 1);
    await typeStable(page, second);

    await expectBlockByMarker(page, second, "listItem", "orderedList");
    const count = await page.evaluate((needle) => {
      const blocks = Array.from(document.querySelectorAll("[data-block-id]")) as HTMLElement[];
      const target = blocks.find((el) => {
        if (!(el.textContent ?? "").includes(needle)) return false;
        const childHas = Array.from(el.querySelectorAll("[data-block-id]")).some((child) => {
          if (!(child instanceof HTMLElement) || child === el) return false;
          return (child.textContent ?? "").includes(needle);
        });
        return !childHas;
      });
      const list = target?.parentElement?.closest('[data-block-type="orderedList"]');
      return list ? list.querySelectorAll('[data-block-type="listItem"]').length : 0;
    }, second);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("todo Enter on empty item exits list to paragraph", async ({ page }) => {
    await createFreshLine(page);
    await runSlashCommand(page, "todo");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => {
        const ctx = await getSelectionContext(page);
        return `${ctx.blockType ?? "null"}|${ctx.parentType ?? "null"}`;
      })
      .toBe("paragraph|null");
  });

  test("block toolbar is anchored to content gutter (not stuck on far left)", async ({ page }) => {
    const firstBlock = page.locator("[data-gotipe-content] > [data-block-id]").first();
    await firstBlock.hover();

    const toolbar = page.locator(".gotipe-block-toolbar-wrapper");
    await expect(toolbar).toBeVisible();
    await expect(toolbar.locator('[aria-label="Add block below"]')).toBeVisible();
    await expect(toolbar.locator("[data-gotipe-drag-handle]")).toBeVisible();

    const metrics = await page.evaluate(() => {
      const content = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
      const block = document.querySelector("[data-gotipe-content] > [data-block-id]") as HTMLElement | null;
      const toolbarEl = document.querySelector(".gotipe-block-toolbar-wrapper") as HTMLElement | null;
      if (!content || !block || !toolbarEl) return null;

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

      const contentRect = content.getBoundingClientRect();
      const blockRect = block.getBoundingClientRect();
      const toolbarRect = toolbarEl.getBoundingClientRect();
      const textAnchorLeft = getTextAnchorLeft(block);

      return {
        contentLeft: contentRect.left,
        blockTop: blockRect.top,
        textAnchorLeft,
        toolbarLeft: toolbarRect.left,
        toolbarRight: toolbarRect.right,
        toolbarTop: toolbarRect.top,
      };
    });

    expect(metrics).not.toBeNull();
    expect((metrics?.toolbarRight ?? 0) - (metrics?.contentLeft ?? 0)).toBeGreaterThanOrEqual(-24);
    expect((metrics?.toolbarRight ?? 0) - (metrics?.textAnchorLeft ?? 0)).toBeLessThanOrEqual(24);
    expect((metrics?.toolbarRight ?? 0) - (metrics?.textAnchorLeft ?? 0)).toBeGreaterThanOrEqual(-56);
    expect((metrics?.toolbarLeft ?? 0)).toBeLessThan((metrics?.textAnchorLeft ?? 0) - 8);
    expect(Math.abs((metrics?.toolbarTop ?? 0) - (metrics?.blockTop ?? 0))).toBeLessThan(20);
  });

  test("slash menu supports both light and dark themes", async ({ page }) => {
    const lightButton = page.locator('.gotipe-theme-toggle button[aria-label="Light theme"]');
    const darkButton = page.locator('.gotipe-theme-toggle button[aria-label="Dark theme"]');
    const menu = page.locator("[data-gotipe-slash-menu]");

    await lightButton.click();
    await openSlashMenuOnFreshLine(page);

    const lightInfo = await page.evaluate(() => {
      const rootTheme = document.documentElement.getAttribute("data-theme");
      const menuEl = document.querySelector("[data-gotipe-slash-menu]") as HTMLElement | null;
      if (!menuEl) return null;
      const bg = getComputedStyle(menuEl).backgroundColor;
      const channels = bg.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      const luminance = (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
      return { rootTheme, luminance };
    });
    expect(lightInfo?.rootTheme).toBe("light");
    expect(lightInfo?.luminance ?? 0).toBeGreaterThan(170);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await darkButton.click();
    await openSlashMenuOnFreshLine(page);
    const darkInfo = await page.evaluate(() => {
      const rootTheme = document.documentElement.getAttribute("data-theme");
      const menuEl = document.querySelector("[data-gotipe-slash-menu]") as HTMLElement | null;
      if (!menuEl) return null;
      const bg = getComputedStyle(menuEl).backgroundColor;
      const channels = bg.match(/\d+/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
      const luminance = (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
      return { rootTheme, luminance };
    });
    expect(darkInfo?.rootTheme).toBe("dark");
    expect(darkInfo?.luminance ?? 255).toBeLessThan(100);
  });

  test("code block Enter inserts newline instead of duplicating block", async ({ page }) => {
    const first = marker("codeFirst");
    const second = marker("codeSecond");

    await createFreshLine(page);
    await runSlashCommandByName(page, "code", "Code Block");
    await setCaretToEndOfLastTopLevelBlock(page);
    await typeStable(page, first);
    await page.keyboard.press("Enter");
    await typeStable(page, second);

    const metrics = await page.evaluate(({ firstMarker, secondMarker }) => {
      const codeBlocks = Array.from(
        document.querySelectorAll('[data-gotipe-content] > [data-block-type="codeBlock"]'),
      ) as HTMLElement[];
      const tagged = codeBlocks.filter((el) => {
        const text = el.textContent ?? "";
        return text.includes(firstMarker) || text.includes(secondMarker);
      });
      const text = tagged[0]?.textContent ?? "";
      return {
        taggedCount: tagged.length,
        text,
        hasFirst: text.includes(firstMarker),
        hasSecond: text.includes(secondMarker),
        hasNewlineBetween: text.includes(`${firstMarker}\n${secondMarker}`),
      };
    }, { firstMarker: first, secondMarker: second });

    expect(metrics).not.toBeNull();
    expect(metrics?.taggedCount).toBe(1);
    expect(metrics?.hasFirst).toBe(true);
    expect(metrics?.hasSecond).toBe(true);
    expect(metrics?.hasNewlineBetween).toBe(true);
  });

  test("code block Escape exits to paragraph without duplicating code block", async ({ page }) => {
    const codeMarker = marker("codeExit");
    const paraMarker = marker("afterExit");

    await createFreshLine(page);
    await runSlashCommandByName(page, "code", "Code Block");
    await setCaretToEndOfLastTopLevelBlock(page);
    await typeStable(page, codeMarker);
    await page.keyboard.press("Escape");
    await typeStable(page, paraMarker);

    const metrics = await page.evaluate(({ codeNeedle, paraNeedle }) => {
      const codeBlocks = Array.from(
        document.querySelectorAll('[data-gotipe-content] > [data-block-type="codeBlock"]'),
      ) as HTMLElement[];
      const paragraph = Array.from(
        document.querySelectorAll('[data-gotipe-content] > [data-block-type="paragraph"]'),
      ).find((el) => (el.textContent ?? "").includes(paraNeedle));
      const codeBlockHasText = codeBlocks.some((el) => (el.textContent ?? "").includes(codeNeedle));
      return {
        codeBlockHasText,
        paragraphCreated: !!paragraph,
      };
    }, { codeNeedle: codeMarker, paraNeedle: paraMarker });

    expect(metrics).not.toBeNull();
    expect(metrics?.codeBlockHasText).toBe(true);
    expect(metrics?.paragraphCreated).toBe(true);
  });
});
