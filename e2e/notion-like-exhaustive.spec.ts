import type { GoTipeEditor } from "@gotipe/core";
import { expect, test, type Page } from "@playwright/test";

type BlockContext = {
  blockType: string | null;
  parentType: string | null;
  tagName: string | null;
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

async function setCaret(page: Page, blockId: string, offset: number) {
  if (!blockId) throw new Error("Caret target block is missing");
  const expected = { anchor: { blockId, offset }, head: { blockId, offset } };
  await page.evaluate((selection) => {
    const editor = (window as unknown as { __GOTIPE_NOTION_EDITOR__: GoTipeEditor })
      .__GOTIPE_NOTION_EDITOR__;
    editor.setSelection(selection);
    editor.focus();
  }, expected);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = (window as unknown as { __GOTIPE_NOTION_EDITOR__: GoTipeEditor })
          .__GOTIPE_NOTION_EDITOR__;
        const { anchor, head } = editor.getViewState().selection;
        return { model: { anchor, head }, native: editor.getDOMSelection() };
      }),
    )
    .toEqual({ model: expected, native: expected });
}

async function setCaretToEndOfLastTopLevelBlock(page: Page) {
  const target = await page.evaluate(() => {
    const editor = (window as unknown as { __GOTIPE_NOTION_EDITOR__: GoTipeEditor })
      .__GOTIPE_NOTION_EDITOR__;
    let block = editor.getViewState().blocks.at(-1);
    while (block?.children.length) block = block.children.at(-1);
    if (!block) throw new Error("Last block is missing");
    const offset =
      typeof block.content === "string"
        ? block.content.length
        : (block.content ?? []).reduce((length, span) => length + span.text.length, 0);
    return { blockId: block.id, offset };
  });
  await setCaret(page, target.blockId, target.offset);
}

async function createFreshLine(page: Page) {
  await setCaretToEndOfLastTopLevelBlock(page);
  await page.keyboard.press("Enter");
}

async function setCaretToStartOfLastTopLevelParagraph(page: Page) {
  const id = await page.evaluate(() => {
    const blocks = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-gotipe-content] > [data-block-type="paragraph"]',
      ),
    );
    return blocks.at(-1)?.dataset.blockId ?? "";
  });
  await setCaret(page, id, 0);
}

async function typeStable(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 10 });
}

async function runSlashCommandByName(page: Page, query: string, name: string) {
  const slashMenu = page.locator("[data-gotipe-slash-menu]");
  await page.keyboard.type(`/${query}`, { delay: 10 });
  await expect(slashMenu).toBeVisible();
  const item = slashMenu.locator(".gotipe-slash-menu-item-title", { hasText: name }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(slashMenu).toBeHidden();
}

async function placeCaretInTopLevelListItem(
  page: Page,
  listType: "bulletList" | "orderedList" | "todoList",
  itemType: "listItem" | "todoItem",
  index = 0,
) {
  const target = await page.evaluate(
    ({ listType, itemType, index }) => {
      const selector = `[data-gotipe-content] > [data-block-type="${listType}"] > [data-block-type="${itemType}"]`;
      const element = document.querySelectorAll<HTMLElement>(selector)[index];
      const id = element?.dataset.blockId;
      const editor = (window as unknown as { __GOTIPE_NOTION_EDITOR__: GoTipeEditor })
        .__GOTIPE_NOTION_EDITOR__;
      const block = editor
        .getViewState()
        .blocks.flatMap((block) => block.children)
        .find((block) => block.id === id);
      if (!block) throw new Error("List item is missing");
      const offset =
        typeof block.content === "string"
          ? block.content.length
          : (block.content ?? []).reduce((length, span) => length + span.text.length, 0);
      return { blockId: block.id, offset };
    },
    { listType, itemType, index },
  );
  await setCaret(page, target.blockId, target.offset);
}

async function getBlockContextByMarker(
  page: Page,
  textMarker: string,
): Promise<BlockContext | null> {
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

async function placeCaretAtStartOfBlockByMarker(page: Page, textMarker: string, offset = 0) {
  const id = await page.evaluate((needle) => {
    const blocks = Array.from(document.querySelectorAll<HTMLElement>("[data-block-id]"));
    const target = blocks.find(
      (element) =>
        (element.textContent ?? "").includes(needle) &&
        !Array.from(element.querySelectorAll("[data-block-id]")).some((child) =>
          (child.textContent ?? "").includes(needle),
        ),
    );
    return target?.dataset.blockId ?? "";
  }, textMarker);
  await setCaret(page, id, offset);
}

async function getTopLevelBlockTypes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")).map(
      (el) => (el as HTMLElement).getAttribute("data-block-type") ?? "unknown",
    ),
  );
}

test.describe("Notion-like exhaustive operations", () => {
  test.beforeEach(async ({ page }) => {
    await openNotion(page);
    await resetNotionDocument(page);
  });

  const slashCases: Array<{
    name: string;
    query: string;
    command: string;
    assert: (page: Page, markerText: string) => Promise<void>;
  }> = [
    {
      name: "slash Text creates paragraph",
      query: "text",
      command: "Text",
      assert: async (page, m) => {
        const ctx = await getBlockContextByMarker(page, m);
        expect(ctx?.blockType).toBe("paragraph");
      },
    },
    {
      name: "slash Heading 1 creates h1",
      query: "h1",
      command: "Heading 1",
      assert: async (page, m) => {
        const ctx = await getBlockContextByMarker(page, m);
        expect(ctx?.blockType).toBe("heading");
        expect(ctx?.tagName).toBe("H1");
      },
    },
    {
      name: "slash Heading 2 creates h2",
      query: "h2",
      command: "Heading 2",
      assert: async (page, m) => {
        const ctx = await getBlockContextByMarker(page, m);
        expect(ctx?.blockType).toBe("heading");
        expect(ctx?.tagName).toBe("H2");
      },
    },
    {
      name: "slash Heading 3 creates h3",
      query: "h3",
      command: "Heading 3",
      assert: async (page, m) => {
        const ctx = await getBlockContextByMarker(page, m);
        expect(ctx?.blockType).toBe("heading");
        expect(ctx?.tagName).toBe("H3");
      },
    },
    {
      name: "slash Bullet List creates list item",
      query: "bullet",
      command: "Bullet List",
      assert: async (page, m) => {
        const ctx = await getBlockContextByMarker(page, m);
        expect(ctx?.blockType).toBe("listItem");
        expect(ctx?.parentType).toBe("bulletList");
      },
    },
    {
      name: "slash Numbered List creates list item",
      query: "numbered",
      command: "Numbered List",
      assert: async (page, m) => {
        const ctx = await getBlockContextByMarker(page, m);
        expect(ctx?.blockType).toBe("listItem");
        expect(ctx?.parentType).toBe("orderedList");
      },
    },
    {
      name: "slash To-do List creates todo item",
      query: "todo",
      command: "To-do List",
      assert: async (page, m) => {
        const ctx = await getBlockContextByMarker(page, m);
        expect(ctx?.blockType).toBe("todoItem");
        expect(ctx?.parentType).toBe("todoList");
      },
    },
    {
      name: "slash Code Block creates code block",
      query: "code",
      command: "Code Block",
      assert: async (page, m) => {
        const ctx = await getBlockContextByMarker(page, m);
        expect(ctx?.blockType).toBe("codeBlock");
      },
    },
  ];

  for (const scenario of slashCases) {
    test(scenario.name, async ({ page }) => {
      const m = marker("slash");
      await createFreshLine(page);
      await setCaretToStartOfLastTopLevelParagraph(page);
      await runSlashCommandByName(page, scenario.query, scenario.command);

      if (scenario.command === "Bullet List") {
        await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 0);
      } else if (scenario.command === "Numbered List") {
        await placeCaretInTopLevelListItem(page, "orderedList", "listItem", 0);
      } else if (scenario.command === "To-do List") {
        await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
      } else {
        await setCaretToEndOfLastTopLevelBlock(page);
      }

      await typeStable(page, m);
      await scenario.assert(page, m);
    });
  }

  test("slash Divider inserts divider block", async ({ page }) => {
    await createFreshLine(page);
    await setCaretToStartOfLastTopLevelParagraph(page);
    await runSlashCommandByName(page, "divider", "Divider");

    const types = await getTopLevelBlockTypes(page);
    expect(types).toContain("divider");
  });

  test("paragraph supports single and double Enter", async ({ page }) => {
    const m1 = marker("para1");
    const m2 = marker("para2");
    const m3 = marker("para3");

    await createFreshLine(page);
    await typeStable(page, m1);
    await page.keyboard.press("Enter");
    await typeStable(page, m2);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await typeStable(page, m3);

    const c1 = await getBlockContextByMarker(page, m1);
    const c2 = await getBlockContextByMarker(page, m2);
    const c3 = await getBlockContextByMarker(page, m3);
    expect(c1?.blockType).toBe("paragraph");
    expect(c2?.blockType).toBe("paragraph");
    expect(c3?.blockType).toBe("paragraph");
  });

  test("bullet double Enter exits list to paragraph", async ({ page }) => {
    const m = marker("bulletExit");
    await createFreshLine(page);
    await runSlashCommandByName(page, "bullet", "Bullet List");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 0);
    await typeStable(page, m);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await typeStable(page, `${m}_p`);

    const ctx = await getBlockContextByMarker(page, `${m}_p`);
    expect(ctx?.blockType).toBe("paragraph");
    expect(ctx?.parentType).toBeNull();
  });

  test("ordered double Enter exits list to paragraph", async ({ page }) => {
    const m = marker("orderedExit");
    await createFreshLine(page);
    await runSlashCommandByName(page, "numbered", "Numbered List");
    await placeCaretInTopLevelListItem(page, "orderedList", "listItem", 0);
    await typeStable(page, m);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await typeStable(page, `${m}_p`);

    const ctx = await getBlockContextByMarker(page, `${m}_p`);
    expect(ctx?.blockType).toBe("paragraph");
    expect(ctx?.parentType).toBeNull();
  });

  test("todo double Enter exits list to paragraph", async ({ page }) => {
    const m = marker("todoExit");
    await createFreshLine(page);
    await runSlashCommandByName(page, "todo", "To-do List");
    await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
    await typeStable(page, m);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await typeStable(page, `${m}_p`);

    const ctx = await getBlockContextByMarker(page, `${m}_p`);
    expect(ctx?.blockType).toBe("paragraph");
    expect(ctx?.parentType).toBeNull();
  });

  test("Backspace at start of paragraph merges with previous paragraph", async ({ page }) => {
    const first = marker("mergeA");
    const second = marker("mergeB");

    await createFreshLine(page);
    await typeStable(page, first);
    await page.keyboard.press("Enter");
    await typeStable(page, second);

    await placeCaretAtStartOfBlockByMarker(page, second);
    await page.keyboard.press("Backspace");
    await expect
      .poll(async () => {
        const ctx = await getBlockContextByMarker(page, first);
        return `${ctx?.blockType ?? "null"}|${ctx?.text ?? ""}`;
      })
      .toContain(second);
  });

  test("Delete forward removes next character in paragraph", async ({ page }) => {
    const content = marker("deleteX");
    await createFreshLine(page);
    await typeStable(page, `${content}AB`);
    await placeCaretAtStartOfBlockByMarker(page, content, content.length);
    await page.keyboard.press("Delete");
    await expect
      .poll(async () => {
        const ctx = await getBlockContextByMarker(page, content);
        const text = ctx?.text ?? "";
        return {
          removedOne: !text.includes(`${content}AB`),
          stillPrefixed: text.includes(content),
        };
      })
      .toEqual({ removedOne: true, stillPrefixed: true });
  });

  test("slash transform chain preserves text through multiple block types", async ({ page }) => {
    const m = marker("chain");
    await createFreshLine(page);
    await setCaretToStartOfLastTopLevelParagraph(page);
    await runSlashCommandByName(page, "bullet", "Bullet List");
    await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 0);
    await typeStable(page, m);

    await placeCaretAtStartOfBlockByMarker(page, m);
    await runSlashCommandByName(page, "todo", "To-do List");
    await expect
      .poll(() => getBlockContextByMarker(page, m))
      .toMatchObject({ parentType: "todoList" });
    await placeCaretAtStartOfBlockByMarker(page, m);
    await runSlashCommandByName(page, "numbered", "Numbered List");
    await expect
      .poll(() => getBlockContextByMarker(page, m))
      .toMatchObject({ parentType: "orderedList" });
    await placeCaretAtStartOfBlockByMarker(page, m);
    await runSlashCommandByName(page, "text", "Text");

    const ctx = await getBlockContextByMarker(page, m);
    expect(ctx?.blockType).toBe("paragraph");
    expect(ctx?.text).toContain(m);
  });

  test("stress sequence: mixed create/change/delete operations remains stable", async ({
    page,
  }) => {
    const commands: Array<{ query: string; name: string; kind: "list" | "code" | "text" }> = [
      { query: "bullet", name: "Bullet List", kind: "list" },
      { query: "numbered", name: "Numbered List", kind: "list" },
      { query: "todo", name: "To-do List", kind: "list" },
      { query: "code", name: "Code Block", kind: "code" },
      { query: "text", name: "Text", kind: "text" },
      { query: "h1", name: "Heading 1", kind: "text" },
    ];

    for (let i = 0; i < 18; i++) {
      const cmd = commands[i % commands.length]!;
      const m1 = marker(`stress${i}_a`);
      const m2 = marker(`stress${i}_b`);

      await createFreshLine(page);
      await setCaretToStartOfLastTopLevelParagraph(page);
      await runSlashCommandByName(page, cmd.query, cmd.name);

      if (cmd.kind === "list") {
        if (cmd.name === "Bullet List") {
          await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 0);
        } else if (cmd.name === "Numbered List") {
          await placeCaretInTopLevelListItem(page, "orderedList", "listItem", 0);
        } else {
          await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 0);
        }
        await typeStable(page, m1);
        await page.keyboard.press("Enter");
        if (cmd.name === "Bullet List") {
          await placeCaretInTopLevelListItem(page, "bulletList", "listItem", 1);
        } else if (cmd.name === "Numbered List") {
          await placeCaretInTopLevelListItem(page, "orderedList", "listItem", 1);
        } else {
          await placeCaretInTopLevelListItem(page, "todoList", "todoItem", 1);
        }
        await typeStable(page, m2);
        await page.keyboard.press("Backspace");
        await typeStable(page, m2.slice(-1));
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
      } else if (cmd.kind === "code") {
        await setCaretToEndOfLastTopLevelBlock(page);
        await typeStable(page, m1);
        await page.keyboard.press("Enter");
        await typeStable(page, m2);
        await page.keyboard.press("Backspace");
        await typeStable(page, m2.slice(-1));
        await page.keyboard.press("Escape");
      } else {
        await setCaretToEndOfLastTopLevelBlock(page);
        await typeStable(page, m1);
        await page.keyboard.press("Enter");
        await typeStable(page, m2);
        await page.keyboard.press("Backspace");
        await typeStable(page, m2.slice(-1));
        await page.keyboard.press("Enter");
      }

      await expect
        .poll(async () => {
          const text = await page.evaluate(
            () => document.querySelector("[data-gotipe-content]")?.textContent ?? "",
          );
          return text.includes(m1) && text.includes(m2);
        })
        .toBe(true);
    }

    const topLevelCount = await page.evaluate(
      () => document.querySelectorAll("[data-gotipe-content] > [data-block-id]").length,
    );
    expect(topLevelCount).toBeGreaterThan(10);
  });
});
