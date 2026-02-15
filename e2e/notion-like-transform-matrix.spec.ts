import { expect, test, type Page } from "@playwright/test";

type BlockContext = {
  blockType: string | null;
  parentType: string | null;
  tagName: string | null;
  text: string;
};

type SourceDef = {
  id: string;
  name: string;
  setup: (page: Page, markerText: string) => Promise<void>;
};

type TargetDef = {
  id: string;
  query: string;
  command: string;
  expectedBlockType: string;
  expectedParentType: string | null;
  expectedTagName?: string;
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

async function createFreshLine(page: Page) {
  await setCaretToEndOfLastTopLevelBlock(page);
  await page.keyboard.press("Enter");
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
  const targetId = await page.evaluate((needle) => {
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

    const targetBlockId = target.getAttribute("data-block-id");
    const editorEl = document.querySelector("[data-gotipe-content]") as HTMLElement | null;
    const editorApi = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | {
          setSelection?: (selection: {
            anchor: { blockId: string; offset: number };
            head: { blockId: string; offset: number };
          }) => void;
        }
      | undefined;

    if (!targetBlockId) return null;
    editorEl?.focus();

    if (typeof editorApi?.setSelection === "function") {
      editorApi.setSelection({
        anchor: { blockId: targetBlockId, offset: 0 },
        head: { blockId: targetBlockId, offset: 0 },
      });
      return targetBlockId;
    }

    // Fallback to DOM range if editor API is not available.
    const sel = window.getSelection();
    if (!sel) return targetBlockId;
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
    return targetBlockId;
  }, textMarker);

  expect(targetId).not.toBeNull();

  await expect
    .poll(async () =>
      page.evaluate((blockId) => {
        const editorApi = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
          | { getViewState?: () => { selection?: { anchor: { blockId: string; offset: number } } } }
          | undefined;
        const stateSelection = editorApi?.getViewState?.().selection;
        if (stateSelection?.anchor.blockId === blockId && stateSelection.anchor.offset === 0) {
          return true;
        }

        const sel = window.getSelection();
        const anchorEl =
          sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement;
        const block = anchorEl?.closest("[data-block-id]") as HTMLElement | null;
        if (!block || block.getAttribute("data-block-id") !== blockId) return false;
        if ((sel?.anchorOffset ?? -1) === 0) return true;
        if (sel?.anchorNode === block && (sel.anchorOffset ?? -1) <= 1) return true;
        return false;
      }, targetId),
    )
    .toBe(true);
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
    };
  }, textMarker);
}

const sources: SourceDef[] = [
  {
    id: "paragraph",
    name: "paragraph",
    setup: async (page, markerText) => {
      await createFreshLine(page);
      await setCaretToStartOfLastTopLevelParagraph(page);
      await typeStable(page, markerText);
    },
  },
  {
    id: "heading1",
    name: "heading 1",
    setup: async (page, markerText) => {
      await createFreshLine(page);
      await setCaretToStartOfLastTopLevelParagraph(page);
      await runSlashCommandByName(page, "h1", "Heading 1");
      await setCaretToEndOfLastTopLevelBlock(page);
      await typeStable(page, markerText);
    },
  },
  {
    id: "heading2",
    name: "heading 2",
    setup: async (page, markerText) => {
      await createFreshLine(page);
      await setCaretToStartOfLastTopLevelParagraph(page);
      await runSlashCommandByName(page, "h2", "Heading 2");
      await setCaretToEndOfLastTopLevelBlock(page);
      await typeStable(page, markerText);
    },
  },
  {
    id: "heading3",
    name: "heading 3",
    setup: async (page, markerText) => {
      await createFreshLine(page);
      await setCaretToStartOfLastTopLevelParagraph(page);
      await runSlashCommandByName(page, "h3", "Heading 3");
      await setCaretToEndOfLastTopLevelBlock(page);
      await typeStable(page, markerText);
    },
  },
  {
    id: "bullet",
    name: "bullet list item",
    setup: async (page, markerText) => {
      await createFreshLine(page);
      await setCaretToStartOfLastTopLevelParagraph(page);
      await runSlashCommandByName(page, "bullet", "Bullet List");
      await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 0);
      await typeStable(page, markerText);
    },
  },
  {
    id: "ordered",
    name: "ordered list item",
    setup: async (page, markerText) => {
      await createFreshLine(page);
      await setCaretToStartOfLastTopLevelParagraph(page);
      await runSlashCommandByName(page, "numbered", "Numbered List");
      await placeCaretInTopLevelListItem(page, "orderedList", "listItem", 0);
      await typeStable(page, markerText);
    },
  },
  {
    id: "todo",
    name: "todo item",
    setup: async (page, markerText) => {
      await createFreshLine(page);
      await setCaretToStartOfLastTopLevelParagraph(page);
      await runSlashCommandByName(page, "todo", "To-do List");
      await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
      await typeStable(page, markerText);
    },
  },
  {
    id: "code",
    name: "code block",
    setup: async (page, markerText) => {
      await createFreshLine(page);
      await setCaretToStartOfLastTopLevelParagraph(page);
      await runSlashCommandByName(page, "code", "Code Block");
      await setCaretToEndOfLastTopLevelBlock(page);
      await typeStable(page, markerText);
    },
  },
  {
    id: "quote",
    name: "blockquote",
    setup: async (page, markerText) => {
      await createFreshLine(page);
      await setCaretToStartOfLastTopLevelParagraph(page);
      await runSlashCommandByName(page, "quote", "Quote");
      await setCaretToEndOfLastTopLevelBlock(page);
      await typeStable(page, markerText);
    },
  },
];

const targets: TargetDef[] = [
  {
    id: "heading1",
    query: "h1",
    command: "Heading 1",
    expectedBlockType: "heading",
    expectedParentType: null,
    expectedTagName: "H1",
  },
  {
    id: "text",
    query: "text",
    command: "Text",
    expectedBlockType: "paragraph",
    expectedParentType: null,
    expectedTagName: "P",
  },
  {
    id: "heading2",
    query: "h2",
    command: "Heading 2",
    expectedBlockType: "heading",
    expectedParentType: null,
    expectedTagName: "H2",
  },
  {
    id: "heading3",
    query: "h3",
    command: "Heading 3",
    expectedBlockType: "heading",
    expectedParentType: null,
    expectedTagName: "H3",
  },
  {
    id: "bullet",
    query: "bullet",
    command: "Bullet List",
    expectedBlockType: "listItem",
    expectedParentType: "bulletList",
    expectedTagName: "LI",
  },
  {
    id: "ordered",
    query: "numbered",
    command: "Numbered List",
    expectedBlockType: "listItem",
    expectedParentType: "orderedList",
    expectedTagName: "LI",
  },
  {
    id: "todo",
    query: "todo",
    command: "To-do List",
    expectedBlockType: "todoItem",
    expectedParentType: "todoList",
    expectedTagName: "LI",
  },
  {
    id: "code",
    query: "code",
    command: "Code Block",
    expectedBlockType: "codeBlock",
    expectedParentType: null,
  },
  {
    id: "quote",
    query: "quote",
    command: "Quote",
    expectedBlockType: "blockquote",
    expectedParentType: null,
    expectedTagName: "BLOCKQUOTE",
  },
];

const skipPairs = new Set([
  "paragraph->text",
  "heading1->heading1",
  "heading2->heading2",
  "heading3->heading3",
  "bullet->bullet",
  "ordered->ordered",
  "todo->todo",
  "code->code",
  "quote->quote",
]);

test.describe("Notion-like slash transform matrix", () => {
  test.beforeEach(async ({ page }) => {
    await openNotion(page);
    await resetNotionDocument(page);
  });

  for (const source of sources) {
    for (const target of targets) {
      const pairKey = `${source.id}->${target.id}`;
      if (skipPairs.has(pairKey)) continue;

      test(`${pairKey} keeps content and lands in expected block`, async ({ page }) => {
        const m = marker("tf");
        await source.setup(page, m);
        await expect
          .poll(async () => {
            const ctx = await getBlockContextByMarker(page, m);
            return !!ctx;
          })
          .toBe(true);

        await placeCaretAtStartOfBlockByMarker(page, m);
        await runSlashCommandByName(page, target.query, target.command);

        await expect
          .poll(async () => {
            const ctx = await getBlockContextByMarker(page, m);
            return `${ctx?.blockType ?? "null"}|${ctx?.parentType ?? "null"}`;
          })
          .toBe(
            `${target.expectedBlockType}|${target.expectedParentType ?? "null"}`,
          );

        const ctx = await getBlockContextByMarker(page, m);
        expect(ctx?.text).toContain(m);
        if (target.expectedTagName) {
          expect(ctx?.tagName).toBe(target.expectedTagName);
        }
      });
    }
  }
});
