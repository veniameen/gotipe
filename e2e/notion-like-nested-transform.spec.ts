import { expect, test, type Page } from "@playwright/test";

type BlockContext = {
  blockType: string | null;
  parentType: string | null;
  text: string;
};

function marker(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

async function openNotion(page: Page) {
  await page.goto("/#notion");
  await expect(page.locator('[data-gotipe-nav="notion"]')).toHaveClass(/active/);
  await expect(page.locator("[data-gotipe-content]")).toBeVisible();
}

async function setNotionContent(page: Page, content: unknown) {
  const ok = await page.evaluate((doc) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { setContent?: (value: unknown) => void }
      | undefined;
    if (!editor || typeof editor.setContent !== "function") return false;
    editor.setContent(doc);
    return true;
  }, content);
  expect(ok).toBe(true);

  await expect
    .poll(async () =>
      page.evaluate(
        () => document.querySelectorAll("[data-gotipe-content] > [data-block-id]").length,
      ),
    )
    .toBeGreaterThan(0);

  await page.locator("[data-gotipe-content]").click();
  await page.evaluate(() => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { syncSelectionFromDOM?: () => void }
      | undefined;
    editor?.syncSelectionFromDOM?.();
  });
}

async function typeStable(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 10 });
}

async function runSlashCommandByName(page: Page, query: string, name: string) {
  const slashMenu = page.locator("[data-gotipe-slash-menu]");
  const typed = `/${query}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.type(typed, { delay: 10 });
    try {
      await expect(slashMenu).toBeVisible({ timeout: 1200 });
      break;
    } catch {
      for (let i = 0; i < typed.length; i++) {
        await page.keyboard.press("Backspace");
      }
      await page.waitForTimeout(30);
    }
  }

  await expect(slashMenu).toBeVisible();
  const item = slashMenu.locator(".gotipe-slash-menu-item-title", { hasText: name }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(slashMenu).toBeHidden();
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

    const notionEditor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { syncSelectionFromDOM?: () => void }
      | undefined;
    notionEditor?.syncSelectionFromDOM?.();
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

async function placeCaretAtEndOfBlockByMarker(page: Page, textMarker: string) {
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

    editor.focus();

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let lastText: Node | null = null;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      lastText = node;
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
  }, textMarker);

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
      text: target.textContent ?? "",
    };
  }, textMarker);
}

test.describe("Notion-like nested and multi-step transforms", () => {
  test.beforeEach(async ({ page }) => {
    await openNotion(page);
  });

  test("nested slash: listItem -> heading keeps deep child text", async ({ page }) => {
    const target = marker("nestedTarget");
    const deep = marker("nestedDeep");

    await setNotionContent(page, {
      version: 1,
      blocks: [
        {
          id: "root-list",
          type: "bulletList",
          attrs: {},
          content: null,
          children: [
            {
              id: "root-item",
              type: "listItem",
              attrs: {},
              content: [{ text: "Parent", marks: [] }],
              children: [
                {
                  id: "nested-list",
                  type: "bulletList",
                  attrs: {},
                  content: null,
                  children: [
                    {
                      id: "nested-item",
                      type: "listItem",
                      attrs: {},
                      content: [{ text: target, marks: [] }],
                      children: [
                        {
                          id: "deep-list",
                          type: "bulletList",
                          attrs: {},
                          content: null,
                          children: [
                            {
                              id: "deep-item",
                              type: "listItem",
                              attrs: {},
                              content: [{ text: deep, marks: [] }],
                              children: [],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    await placeCaretAtStartOfBlockByMarker(page, target);
    await runSlashCommandByName(page, "h1", "Heading 1");

    await expect
      .poll(async () => {
        const ctx = await getBlockContextByMarker(page, target);
        return ctx?.blockType ?? "null";
      })
      .toBe("heading");

    await expect
      .poll(async () => {
        const text = await page.evaluate(
          () => document.querySelector("[data-gotipe-content]")?.textContent ?? "",
        );
        return text.includes(deep);
      })
      .toBe(true);
  });

  test("nested slash: listItem -> paragraph keeps deep child text", async ({ page }) => {
    const target = marker("nestedTargetText");
    const deep = marker("nestedDeepText");

    await setNotionContent(page, {
      version: 1,
      blocks: [
        {
          id: "root-list",
          type: "bulletList",
          attrs: {},
          content: null,
          children: [
            {
              id: "root-item",
              type: "listItem",
              attrs: {},
              content: [{ text: "Parent", marks: [] }],
              children: [
                {
                  id: "nested-list",
                  type: "bulletList",
                  attrs: {},
                  content: null,
                  children: [
                    {
                      id: "nested-item",
                      type: "listItem",
                      attrs: {},
                      content: [{ text: target, marks: [] }],
                      children: [
                        {
                          id: "deep-list",
                          type: "bulletList",
                          attrs: {},
                          content: null,
                          children: [
                            {
                              id: "deep-item",
                              type: "listItem",
                              attrs: {},
                              content: [{ text: deep, marks: [] }],
                              children: [],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    await placeCaretAtStartOfBlockByMarker(page, target);
    await runSlashCommandByName(page, "text", "Text");

    await expect
      .poll(async () => {
        const ctx = await getBlockContextByMarker(page, target);
        return ctx?.blockType ?? "null";
      })
      .toBe("paragraph");

    await expect
      .poll(async () => {
        const text = await page.evaluate(
          () => document.querySelector("[data-gotipe-content]")?.textContent ?? "",
        );
        return text.includes(deep);
      })
      .toBe(true);
  });

  test("nested ordered list: listItem -> heading keeps deep child text", async ({ page }) => {
    const target = marker("orderedTarget");
    const deep = marker("orderedDeep");

    await setNotionContent(page, {
      version: 1,
      blocks: [
        {
          id: "root-ordered",
          type: "orderedList",
          attrs: { start: 1 },
          content: null,
          children: [
            {
              id: "root-item",
              type: "listItem",
              attrs: {},
              content: [{ text: "Root", marks: [] }],
              children: [
                {
                  id: "nested-ordered",
                  type: "orderedList",
                  attrs: { start: 1 },
                  content: null,
                  children: [
                    {
                      id: "nested-item",
                      type: "listItem",
                      attrs: {},
                      content: [{ text: target, marks: [] }],
                      children: [
                        {
                          id: "deep-list",
                          type: "orderedList",
                          attrs: { start: 1 },
                          content: null,
                          children: [
                            {
                              id: "deep-item",
                              type: "listItem",
                              attrs: {},
                              content: [{ text: deep, marks: [] }],
                              children: [],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    await placeCaretAtStartOfBlockByMarker(page, target);
    await runSlashCommandByName(page, "h2", "Heading 2");

    await expect
      .poll(async () => {
        const ctx = await getBlockContextByMarker(page, target);
        return ctx?.blockType ?? "null";
      })
      .toBe("heading");

    await expect
      .poll(async () => {
        const text = await page.evaluate(
          () => document.querySelector("[data-gotipe-content]")?.textContent ?? "",
        );
        return text.includes(deep);
      })
      .toBe(true);
  });

  test("backspace at start of second bullet item lifts it to paragraph and keeps first item in list", async ({ page }) => {
    const first = marker("mergeFirst");
    const second = marker("mergeSecond");

    await setNotionContent(page, {
      version: 1,
      blocks: [
        {
          id: "root-list",
          type: "bulletList",
          attrs: {},
          content: null,
          children: [
            {
              id: "item-1",
              type: "listItem",
              attrs: {},
              content: [{ text: first, marks: [] }],
              children: [],
            },
            {
              id: "item-2",
              type: "listItem",
              attrs: {},
              content: [{ text: second, marks: [] }],
              children: [],
            },
          ],
        },
      ],
    });

    await placeCaretAtStartOfBlockByMarker(page, second);
    await page.keyboard.press("Backspace");

    await expect
      .poll(async () => {
        const ctx = await getBlockContextByMarker(page, second);
        return `${ctx?.blockType ?? "null"}|${ctx?.parentType ?? "null"}`;
      })
      .toBe("paragraph|null");

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const list = document.querySelector(
            '[data-gotipe-content] > [data-block-type="bulletList"]',
          ) as HTMLElement | null;
          if (!list) return 0;
          return list.querySelectorAll(':scope > [data-block-type="listItem"]').length;
        });
      })
      .toBe(1);

    await expect
      .poll(async () => {
        const ctx = await getBlockContextByMarker(page, first);
        return `${ctx?.blockType ?? "null"}|${ctx?.parentType ?? "null"}`;
      })
      .toBe("listItem|bulletList");
  });

  test("Tab and Shift+Tab keep nested bullet structure valid", async ({ page }) => {
    const first = marker("tabFirst");
    const second = marker("tabSecond");

    await setNotionContent(page, {
      version: 1,
      blocks: [
        {
          id: "root-list",
          type: "bulletList",
          attrs: {},
          content: null,
          children: [
            {
              id: "item-1",
              type: "listItem",
              attrs: {},
              content: [{ text: first, marks: [] }],
              children: [],
            },
            {
              id: "item-2",
              type: "listItem",
              attrs: {},
              content: [{ text: second, marks: [] }],
              children: [],
            },
          ],
        },
      ],
    });

    await placeCaretAtEndOfBlockByMarker(page, second);
    await page.keyboard.press("Tab");

    await expect
      .poll(async () => {
        return page.evaluate(({ firstNeedle, secondNeedle }) => {
          const list = document.querySelector(
            '[data-gotipe-content] > [data-block-type="bulletList"]',
          ) as HTMLElement | null;
          if (!list) return "missing";

          const topItems = Array.from(
            list.querySelectorAll(':scope > [data-block-type="listItem"]'),
          ) as HTMLElement[];
          if (topItems.length !== 1) return `top:${topItems.length}`;

          const topItem = topItems[0]!;
          if (!(topItem.textContent ?? "").includes(firstNeedle)) return "wrong-parent";

          const nestedList = topItem.querySelector(':scope > [data-block-type="bulletList"]');
          if (!nestedList) return "no-nested-list";

          const nestedItem = nestedList.querySelector(':scope > [data-block-type="listItem"]');
          if (!nestedItem) return "no-nested-item";

          return (nestedItem.textContent ?? "").includes(secondNeedle) ? "ok" : "missing-second";
        }, { firstNeedle: first, secondNeedle: second });
      })
      .toBe("ok");

    await placeCaretAtEndOfBlockByMarker(page, second);
    await page.keyboard.press("Shift+Tab");

    await expect
      .poll(async () => {
        return page.evaluate(({ firstNeedle, secondNeedle }) => {
          const list = document.querySelector(
            '[data-gotipe-content] > [data-block-type="bulletList"]',
          ) as HTMLElement | null;
          if (!list) return "missing";

          const topItems = Array.from(
            list.querySelectorAll(':scope > [data-block-type="listItem"]'),
          ) as HTMLElement[];
          if (topItems.length !== 2) return `top:${topItems.length}`;

          const hasFirst = topItems.some((item) => (item.textContent ?? "").includes(firstNeedle));
          const hasSecond = topItems.some((item) => (item.textContent ?? "").includes(secondNeedle));
          const hasNested = topItems.some((item) =>
            item.querySelector(':scope > [data-block-type="bulletList"]') !== null,
          );
          if (!hasFirst || !hasSecond) return "missing-items";
          return hasNested ? "still-nested" : "ok";
        }, { firstNeedle: first, secondNeedle: second });
      })
      .toBe("ok");
  });
});
