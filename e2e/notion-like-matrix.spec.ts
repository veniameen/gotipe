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

function marker(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

async function openNotion(page: Page) {
  await page.goto("/#notion");
  await expect(page.locator('[data-gotipe-nav="notion"]')).toHaveClass(/active/);
  await expect(page.locator("[data-gotipe-content]")).toBeVisible();
}

async function setCaretToEndOfFirstParagraph(page: Page) {
  await page.evaluate(() => {
    const editor = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const paragraph = editor?.querySelector("p");
    if (!editor || !paragraph) return;

    const sel = window.getSelection();
    if (!sel) return;

    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let lastText: Node | null = null;
    let current: Node | null;
    while ((current = walker.nextNode())) {
      lastText = current;
    }

    const range = document.createRange();
    if (lastText) {
      range.setStart(lastText, (lastText.textContent ?? "").length);
    } else {
      range.setStart(paragraph, paragraph.childNodes.length);
    }
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
  });
}

async function createFreshLine(page: Page) {
  await setCaretToEndOfFirstParagraph(page);
  await page.keyboard.press("Enter");
}

async function runSlashCommand(page: Page, query: string) {
  await page.keyboard.type(`/${query}`, { delay: 10 });
  const slashMenu = page.locator("[data-gotipe-slash-menu]");
  await expect(slashMenu).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(slashMenu).toBeHidden();
}

async function placeCaretAtStartOfBlockByMarker(page: Page, textMarker: string) {
  await page.evaluate((needle) => {
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
    if (!target) return;

    const sel = window.getSelection();
    if (!sel) return;

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let textNode: Node | null = null;
    let current: Node | null;
    while ((current = walker.nextNode())) {
      if ((current.textContent ?? "").includes(needle)) {
        textNode = current;
        break;
      }
    }

    const range = document.createRange();
    if (textNode) {
      range.setStart(textNode, 0);
    } else {
      range.setStart(target, 0);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    (document.querySelector("[data-gotipe-content]") as HTMLElement | null)?.focus();
  }, textMarker);
  await page.waitForTimeout(20);
}

async function placeCaretInTopLevelListItem(
  page: Page,
  listType: "bulletList" | "orderedList" | "todoList",
  itemType: "listItem" | "todoItem",
  index = 0,
) {
  await page.evaluate(({ listType, itemType, index }) => {
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
      range.setStart(firstText, (firstText.textContent ?? "").length);
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
  }, { listType, itemType, index });
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

test.describe("Notion-like matrix regressions", () => {
  test.beforeEach(async ({ page }) => {
    await openNotion(page);
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

    const metrics = await page.evaluate(() => {
      const checkbox = document.querySelector(
        '[data-gotipe-content] > [data-block-type="todoList"] > [data-block-type="todoItem"] input[type="checkbox"]',
      ) as HTMLInputElement | null;
      const todoItem = checkbox?.closest('[data-block-type="todoItem"]');
      const textHost = todoItem?.querySelector("[data-gotipe-todo-content]") ?? null;
      const sel = window.getSelection();
      if (!checkbox || !sel || sel.rangeCount === 0) return null;

      const anchorEl =
        sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      return {
        insideTextHost: !!(textHost && (textHost === sel.anchorNode || textHost.contains(anchorEl ?? null))),
        anchorOnItemLeftEdge:
          sel.anchorNode === todoItem && sel.anchorOffset === 0,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.insideTextHost).toBe(true);
    expect(metrics?.anchorOnItemLeftEdge).toBe(false);
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

  test("slash at line start preserves existing text", async ({ page }) => {
    const m = marker("preserve");
    await createFreshLine(page);
    await typeStable(page, m);
    await placeCaretAtStartOfBlockByMarker(page, m);
    await runSlashCommand(page, "bullet");

    await expectBlockByMarker(page, m, "listItem", "bulletList");
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

      const contentRect = content.getBoundingClientRect();
      const blockRect = block.getBoundingClientRect();
      const toolbarRect = toolbarEl.getBoundingClientRect();

      return {
        contentLeft: contentRect.left,
        blockTop: blockRect.top,
        toolbarLeft: toolbarRect.left,
        toolbarRight: toolbarRect.right,
        toolbarTop: toolbarRect.top,
      };
    });

    expect(metrics).not.toBeNull();
    expect((metrics?.toolbarRight ?? 0) - (metrics?.contentLeft ?? 0)).toBeLessThanOrEqual(10);
    expect((metrics?.toolbarRight ?? 0) - (metrics?.contentLeft ?? 0)).toBeGreaterThanOrEqual(-48);
    expect(Math.abs((metrics?.toolbarTop ?? 0) - (metrics?.blockTop ?? 0))).toBeLessThan(20);
  });

  test("slash menu supports both light and dark themes", async ({ page }) => {
    const lightButton = page.locator('.gotipe-theme-toggle button[aria-label="Light theme"]');
    const darkButton = page.locator('.gotipe-theme-toggle button[aria-label="Dark theme"]');
    const menu = page.locator("[data-gotipe-slash-menu]");

    await lightButton.click();
    await createFreshLine(page);
    await typeStable(page, "/");
    await expect(menu).toBeVisible();

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
    await createFreshLine(page);
    await typeStable(page, "/");
    await expect(menu).toBeVisible();
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
});
