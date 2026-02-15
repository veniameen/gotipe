import { expect, test, type Page } from "@playwright/test";

const ADD_BLOCK_LABEL = "Click to add below. Option-click to add a block above";
const DRAG_HANDLE_LABEL = "Drag to move, click to open menu";

async function openNotion(page: Page) {
  await page.goto("/#notion");
  await expect(page.locator('[data-gotipe-nav="notion"]')).toHaveClass(/active/);
  await expect(page.locator("[data-gotipe-content]")).toBeVisible();
}

async function setSingleParagraph(page: Page, text: string) {
  const ok = await page.evaluate((value) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { setContent?: (content: unknown) => void }
      | undefined;
    if (!editor?.setContent) return false;
    editor.setContent({
      version: 1,
      blocks: [
        {
          id: "qa-paragraph",
          type: "paragraph",
          attrs: {},
          content: [{ text: value, marks: [] }],
          children: [],
        },
      ],
    });
    return true;
  }, text);
  expect(ok).toBe(true);
}

async function hoverFirstTopLevelBlock(page: Page) {
  const block = page.locator("[data-gotipe-content] > [data-block-id]").first();
  await block.hover();
  await expect(page.locator(".gotipe-block-toolbar")).toBeVisible();
}

test.describe("Block toolbar", () => {
  test.beforeEach(async ({ page }) => {
    await openNotion(page);
  });

  test("shows drag handle and add button on block hover", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await expect(page.locator("[data-gotipe-drag-handle]")).toBeVisible();
    await expect(page.locator(`button[aria-label="${ADD_BLOCK_LABEL}"]`)).toBeVisible();
  });

  test("toolbar aligns to the first text line center", async ({ page }) => {
    await setSingleParagraph(page, "alignment-check");
    await page.locator('[data-block-id="qa-paragraph"]').hover();
    await expect(page.locator(".gotipe-block-toolbar")).toBeVisible();

    const metrics = await page.evaluate((label) => {
      const block = document.querySelector('[data-block-id="qa-paragraph"]') as HTMLElement | null;
      const addButton = document.querySelector(`button[aria-label="${label}"]`) as HTMLElement | null;
      if (!block || !addButton) return null;

      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let textNode: Node | null = null;
      while ((textNode = walker.nextNode())) {
        if ((textNode.textContent ?? "").trim().length > 0) break;
      }
      if (!textNode) return null;

      const text = textNode.textContent ?? "";
      const firstVisible = text.search(/\S/);
      const start = firstVisible >= 0 ? firstVisible : 0;
      const end = Math.min(text.length, start + 1);
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const textRect = range.getBoundingClientRect();
      const btnRect = addButton.getBoundingClientRect();
      const textCenterY = textRect.top + textRect.height / 2;
      const buttonCenterY = btnRect.top + btnRect.height / 2;

      return {
        deltaY: Math.abs(buttonCenterY - textCenterY),
      };
    }, ADD_BLOCK_LABEL);

    expect(metrics).not.toBeNull();
    expect(metrics!.deltaY).toBeLessThanOrEqual(2.5);
  });

  test("shows Notion-like tooltips for + and drag handle", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);

    const addButton = page.locator(`button[aria-label="${ADD_BLOCK_LABEL}"]`);
    await addButton.hover();
    const addTooltip = page.locator('[data-gotipe-toolbar-tooltip="add"]');
    await expect(addTooltip).toBeVisible();
    await expect(addTooltip).toContainText("Add block below");
    await expect(addTooltip).toContainText("Option");
    await expect(addTooltip).toContainText("/");

    await page.locator("[data-gotipe-drag-handle]").hover();
    const dragTooltip = page.locator('[data-gotipe-toolbar-tooltip="drag"]');
    await expect(dragTooltip).toBeVisible();
    await expect(dragTooltip).toContainText("Drag to move");
    await expect(dragTooltip).toContainText("Click to open menu");
  });

  test("toolbar controls do not use native title tooltips", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    const hasNativeTitles = await page.evaluate((label) => {
      const add = document.querySelector(`button[aria-label="${label}"]`) as HTMLElement | null;
      const drag = document.querySelector("[data-gotipe-drag-handle]") as HTMLElement | null;
      return {
        add: add?.hasAttribute("title") ?? false,
        drag: drag?.hasAttribute("title") ?? false,
      };
    }, ADD_BLOCK_LABEL);
    expect(hasNativeTitles).toEqual({ add: false, drag: false });
  });

  test("tooltip overlay stays single and stable while moving between controls", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    const addButton = page.locator(`button[aria-label="${ADD_BLOCK_LABEL}"]`);
    const dragButton = page.locator("[data-gotipe-drag-handle]");

    await addButton.hover();
    await expect(page.locator('[data-gotipe-toolbar-tooltip="add"]')).toBeVisible();

    await dragButton.hover();
    await expect(page.locator('[data-gotipe-toolbar-tooltip="drag"]')).toBeVisible();

    const tooltipCount = await page.evaluate(
      () => document.querySelectorAll(".gotipe-block-toolbar-tooltip").length,
    );
    expect(tooltipCount).toBe(1);
  });

  test("add button inserts new block and opens slash menu", async ({ page }) => {
    const blocks = page.locator("[data-gotipe-content] > [data-block-id]");
    const before = await blocks.count();

    await hoverFirstTopLevelBlock(page);
    await page.click(`button[aria-label="${ADD_BLOCK_LABEL}"]`);

    await expect(blocks).toHaveCount(before + 1);
    await expect(page.locator("[data-gotipe-slash-menu]")).toBeVisible();
  });

  test("plus on bullet row inserts item below same row and opens slash menu", async ({ page }) => {
    const ok = await page.evaluate(() => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | { setContent?: (content: unknown) => void }
        | undefined;
      if (!editor?.setContent) return false;
      editor.setContent({
        version: 1,
        blocks: [
          {
            id: "list-plus",
            type: "bulletList",
            attrs: {},
            content: null,
            children: [
              {
                id: "li-a-plus",
                type: "listItem",
                attrs: {},
                content: [{ text: "alpha", marks: [] }],
                children: [],
              },
              {
                id: "li-b-plus",
                type: "listItem",
                attrs: {},
                content: [{ text: "beta", marks: [] }],
                children: [],
              },
            ],
          },
          {
            id: "after-list-plus",
            type: "paragraph",
            attrs: {},
            content: [{ text: "after", marks: [] }],
            children: [],
          },
        ],
      });
      return true;
    });
    expect(ok).toBe(true);

    await page.locator('[data-block-id="li-a-plus"]').hover();
    await page.click(`button[aria-label="${ADD_BLOCK_LABEL}"]`);
    await expect(page.locator("[data-gotipe-slash-menu]")).toBeVisible();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const list = document.querySelector('[data-block-id="list-plus"]') as HTMLElement | null;
          if (!list) return null;
          const ids = Array.from(list.children)
            .filter((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-block-id"))
            .map((node) => node.getAttribute("data-block-id") ?? "");
          return { ids, size: ids.length };
        }),
      )
      .toEqual({ ids: expect.any(Array), size: 3 });

    const result = await page.evaluate(() => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | { getViewState?: () => { selection?: { anchor: { blockId: string; offset: number } } } }
        | undefined;
      const list = document.querySelector('[data-block-id="list-plus"]') as HTMLElement | null;
      if (!list) return null;
      const ids = Array.from(list.children)
        .filter((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-block-id"))
        .map((node) => node.getAttribute("data-block-id") ?? "");
      const insertedId = ids[1] ?? null;
      const insertedEl = insertedId
        ? (document.querySelector(`[data-block-id="${insertedId}"]`) as HTMLElement | null)
        : null;
      const topLevelIds = Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]"))
        .map((node) => (node as HTMLElement).getAttribute("data-block-id") ?? "");
      const selection = editor?.getViewState?.().selection;
      return {
        ids,
        insertedId,
        insertedType: insertedEl?.getAttribute("data-block-type") ?? null,
        topLevelIds,
        selBlockId: selection?.anchor.blockId ?? null,
        selOffset: selection?.anchor.offset ?? null,
      };
    });

    expect(result).not.toBeNull();
    expect(result!.ids[0]).toBe("li-a-plus");
    expect(result!.ids[2]).toBe("li-b-plus");
    expect(result!.insertedId).not.toBe("li-a-plus");
    expect(result!.insertedId).not.toBe("li-b-plus");
    expect(result!.insertedType).toBe("listItem");
    expect(result!.topLevelIds).toEqual(["list-plus", "after-list-plus"]);
    expect(result!.selBlockId).toBe(result!.insertedId);
    expect(result!.selOffset).toBe(1);
  });

  test("option-click plus inserts row above target", async ({ page }) => {
    const ok = await page.evaluate(() => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | { setContent?: (content: unknown) => void }
        | undefined;
      if (!editor?.setContent) return false;
      editor.setContent({
        version: 1,
        blocks: [
          {
            id: "list-option-plus",
            type: "bulletList",
            attrs: {},
            content: null,
            children: [
              {
                id: "li-a-option",
                type: "listItem",
                attrs: {},
                content: [{ text: "alpha", marks: [] }],
                children: [],
              },
              {
                id: "li-b-option",
                type: "listItem",
                attrs: {},
                content: [{ text: "beta", marks: [] }],
                children: [],
              },
            ],
          },
        ],
      });
      return true;
    });
    expect(ok).toBe(true);

    await page.locator('[data-block-id="li-b-option"]').hover();
    await page.click(`button[aria-label="${ADD_BLOCK_LABEL}"]`, { modifiers: ["Alt"] });

    await expect
      .poll(() =>
        page.evaluate(() => {
          const list = document.querySelector('[data-block-id="list-option-plus"]') as HTMLElement | null;
          if (!list) return [];
          return Array.from(list.children)
            .filter((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-block-id"))
            .map((node) => node.getAttribute("data-block-id") ?? "");
        }),
      )
      .toEqual(["li-a-option", expect.any(String), "li-b-option"]);
  });

  test("toolbar remains clickable when moving from block text into left gutter", async ({ page }) => {
    const blocks = page.locator("[data-gotipe-content] > [data-block-id]");
    const before = await blocks.count();

    const points = await page.evaluate(() => {
      const block = document.querySelector("[data-gotipe-content] > [data-block-id]") as HTMLElement | null;
      if (!block) return null;
      const rect = block.getBoundingClientRect();
      return {
        startX: rect.left + Math.min(120, Math.max(24, rect.width / 3)),
        startY: rect.top + Math.min(24, Math.max(10, rect.height / 2)),
      };
    });
    expect(points).not.toBeNull();

    await page.mouse.move(points!.startX, points!.startY);
    await expect(page.locator(".gotipe-block-toolbar")).toBeVisible();

    const addButton = page.locator(`button[aria-label="${ADD_BLOCK_LABEL}"]`);
    const addBox = await addButton.boundingBox();
    expect(addBox).not.toBeNull();

    await page.mouse.move(addBox!.x + addBox!.width / 2, addBox!.y + addBox!.height / 2, { steps: 12 });
    await expect(addButton).toBeVisible();
    await page.mouse.click(addBox!.x + addBox!.width / 2, addBox!.y + addBox!.height / 2);

    await expect(blocks).toHaveCount(before + 1);
  });

  test("drag handle click opens context menu", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await expect(page.locator("[data-gotipe-context-menu]")).toBeVisible();
  });

  test("context menu shows all actions", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    const menu = page.locator("[data-gotipe-context-menu]");
    await expect(menu).toContainText("Turn into");
    await expect(menu).toContainText("Copy link to block");
    await expect(menu).toContainText("Duplicate");
    await expect(menu).toContainText("Reset Formatting");
    await expect(menu).toContainText("Copy to Clipboard");
    await expect(menu).toContainText("Delete");
  });

  test("context menu closes on Escape", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await expect(page.locator("[data-gotipe-context-menu]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-gotipe-context-menu]")).not.toBeVisible();
  });

  test("context menu closes on outside click", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await expect(page.locator("[data-gotipe-context-menu]")).toBeVisible();
    await page.click("body", { position: { x: 12, y: 12 } });
    await expect(page.locator("[data-gotipe-context-menu]")).not.toBeVisible();
  });

  test("Delete removes the block", async ({ page }) => {
    const blocks = page.locator("[data-gotipe-content] > [data-block-id]");
    const before = await blocks.count();

    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await page.click('[data-gotipe-context-menu] button:has-text("Delete")');

    await expect(blocks).toHaveCount(before - 1);
  });

  test("Duplicate creates a copy of the block", async ({ page }) => {
    const blocks = page.locator("[data-gotipe-content] > [data-block-id]");
    const before = await blocks.count();

    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await page.click('[data-gotipe-context-menu] button:has-text("Duplicate")');

    await expect(blocks).toHaveCount(before + 1);
  });

  test("toolbar has correct ARIA role", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    const toolbar = page.locator(".gotipe-block-toolbar");
    await expect(toolbar).toHaveAttribute("role", "toolbar");
    await expect(toolbar).toHaveAttribute("aria-label", "Block actions");
  });

  test("context menu has role=menu and role=menuitem items", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    const menu = page.locator("[data-gotipe-context-menu]");
    await expect(menu).toHaveAttribute("role", "menu");
    await expect(menu.locator('[role="menuitem"]')).toHaveCount(6);
  });

  test("Turn into converts paragraph to heading 2 and preserves text", async ({ page }) => {
    const marker = `turn_heading_${Math.random().toString(36).slice(2, 8)}`;
    await setSingleParagraph(page, marker);
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await page.click('[data-gotipe-context-menu] button:has-text("Turn into")');
    await page.click('[data-gotipe-context-menu] button:has-text("Heading 2")');

    await expect
      .poll(async () =>
        page.evaluate((needle) => {
          const block = document.querySelector(
            '[data-gotipe-content] > [data-block-id="qa-paragraph"]',
          ) as HTMLElement | null;
          if (!block) return { type: null, tag: null, text: "" };
          return {
            type: block.getAttribute("data-block-type"),
            tag: block.tagName,
            text: block.textContent ?? "",
          };
        }, marker),
      )
      .toEqual(expect.objectContaining({ type: "heading", tag: "H2", text: expect.stringContaining(marker) }));
  });

  test("Turn into converts paragraph to to-do list item and preserves text", async ({ page }) => {
    const marker = `turn_todo_${Math.random().toString(36).slice(2, 8)}`;
    await setSingleParagraph(page, marker);
    await hoverFirstTopLevelBlock(page);
    await page.click("[data-gotipe-drag-handle]");
    await page.click('[data-gotipe-context-menu] button:has-text("Turn into")');
    await page.click('[data-gotipe-context-menu] button:has-text("To-do List")');

    await expect
      .poll(async () =>
        page.evaluate((needle) => {
          const list = document.querySelector(
            '[data-gotipe-content] > [data-block-type="todoList"]',
          ) as HTMLElement | null;
          const item = list?.querySelector('[data-block-type="todoItem"]') as HTMLElement | null;
          return {
            listType: list?.getAttribute("data-block-type") ?? null,
            itemType: item?.getAttribute("data-block-type") ?? null,
            text: item?.textContent ?? "",
          };
        }, marker),
      )
      .toEqual(expect.objectContaining({ listType: "todoList", itemType: "todoItem", text: expect.stringContaining(marker) }));
  });
});

test.describe("Drag and drop", () => {
  test.beforeEach(async ({ page }) => {
    await openNotion(page);
  });

  test("drag handle has draggable attribute", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await expect(page.locator("[data-gotipe-drag-handle]")).toHaveAttribute("draggable", "true");
  });

  test("bullet list row drag reorders only list items (not whole list block)", async ({ page }) => {
    const ok = await page.evaluate(() => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | { setContent?: (content: unknown) => void }
        | undefined;
      if (!editor?.setContent) return false;
      editor.setContent({
        version: 1,
        blocks: [
          {
            id: "pre",
            type: "paragraph",
            attrs: {},
            content: [{ text: "pre", marks: [] }],
            children: [],
          },
          {
            id: "list-root",
            type: "bulletList",
            attrs: {},
            content: null,
            children: [
              {
                id: "li-a",
                type: "listItem",
                attrs: {},
                content: [{ text: "alpha", marks: [] }],
                children: [],
              },
              {
                id: "li-b",
                type: "listItem",
                attrs: {},
                content: [{ text: "beta", marks: [] }],
                children: [],
              },
            ],
          },
          {
            id: "post",
            type: "paragraph",
            attrs: {},
            content: [{ text: "post", marks: [] }],
            children: [],
          },
        ],
      });
      return true;
    });
    expect(ok).toBe(true);

    await page.locator('[data-block-id="li-a"]').hover();
    await expect(page.locator(".gotipe-block-toolbar")).toBeVisible();
    await expect(page.locator("[data-gotipe-drag-handle]")).toHaveAttribute("data-block-drag", "li-a");

    await page.evaluate(() => {
      const root = document.querySelector("[data-gotipe-block-editor]") as HTMLElement | null;
      const handle = document.querySelector('[data-block-drag="li-a"]') as HTMLElement | null;
      const target = document.querySelector('[data-block-id="li-b"]') as HTMLElement | null;
      if (!root || !handle || !target) return;

      const data = new DataTransfer();
      data.setData("text/gotipe-block-id", "li-a");
      handle.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: data }));

      const rect = target.getBoundingClientRect();
      const y = rect.bottom - 2;
      root.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          clientY: y,
          dataTransfer: data,
        }),
      );
      root.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientY: y,
          dataTransfer: data,
        }),
      );
      handle.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: data }));
    });

    await expect
      .poll(() =>
        page.evaluate(() => {
          const list = document.querySelector('[data-block-id="list-root"]') as HTMLElement | null;
          if (!list) return [];
          return Array.from(list.children)
            .filter(
              (node): node is HTMLElement =>
                node instanceof HTMLElement && node.hasAttribute("data-block-id"),
            )
            .map((node) => node.getAttribute("data-block-id") ?? "");
        }),
      )
      .toEqual(["li-b", "li-a"]);

    await expect
      .poll(() =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")).map(
            (node) => (node as HTMLElement).getAttribute("data-block-id") ?? "",
          ),
        ),
      )
      .toEqual(["pre", "list-root", "post"]);
  });

  test("bullet list row drag via real pointer gesture reorders without freeze", async ({ page }) => {
    const ok = await page.evaluate(() => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | { setContent?: (content: unknown) => void }
        | undefined;
      if (!editor?.setContent) return false;
      editor.setContent({
        version: 1,
        blocks: [
          {
            id: "pre2",
            type: "paragraph",
            attrs: {},
            content: [{ text: "pre2", marks: [] }],
            children: [],
          },
          {
            id: "list-root-2",
            type: "bulletList",
            attrs: {},
            content: null,
            children: [
              {
                id: "li-a2",
                type: "listItem",
                attrs: {},
                content: [{ text: "alpha2", marks: [] }],
                children: [],
              },
              {
                id: "li-b2",
                type: "listItem",
                attrs: {},
                content: [{ text: "beta2", marks: [] }],
                children: [],
              },
              {
                id: "li-c2",
                type: "listItem",
                attrs: {},
                content: [{ text: "gamma2", marks: [] }],
                children: [],
              },
            ],
          },
          {
            id: "post2",
            type: "paragraph",
            attrs: {},
            content: [{ text: "post2", marks: [] }],
            children: [],
          },
        ],
      });
      return true;
    });
    expect(ok).toBe(true);

    await page.locator('[data-block-id="li-a2"]').hover();
    await expect(page.locator("[data-gotipe-drag-handle]")).toHaveAttribute("data-block-drag", "li-a2");

    const handleBox = await page.locator("[data-gotipe-drag-handle]").boundingBox();
    const targetBox = await page.locator('[data-block-id="li-c2"]').boundingBox();
    expect(handleBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox!.x + 24, targetBox!.y + targetBox!.height - 2, { steps: 20 });
    await page.mouse.up();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const list = document.querySelector('[data-block-id="list-root-2"]') as HTMLElement | null;
          if (!list) return [];
          return Array.from(list.children)
            .filter((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-block-id"))
            .map((node) => node.getAttribute("data-block-id") ?? "");
        }),
      )
      .toEqual(["li-b2", "li-c2", "li-a2"]);
  });

  test("bullet row can be dragged out of list to any top-level position", async ({ page }) => {
    const ok = await page.evaluate(() => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | { setContent?: (content: unknown) => void }
        | undefined;
      if (!editor?.setContent) return false;
      editor.setContent({
        version: 1,
        blocks: [
          {
            id: "pre3",
            type: "paragraph",
            attrs: {},
            content: [{ text: "pre3", marks: [] }],
            children: [],
          },
          {
            id: "list-root-3",
            type: "bulletList",
            attrs: {},
            content: null,
            children: [
              {
                id: "li-a3",
                type: "listItem",
                attrs: {},
                content: [{ text: "alpha3", marks: [] }],
                children: [],
              },
              {
                id: "li-b3",
                type: "listItem",
                attrs: {},
                content: [{ text: "beta3", marks: [] }],
                children: [],
              },
            ],
          },
          {
            id: "post3",
            type: "paragraph",
            attrs: {},
            content: [{ text: "post3", marks: [] }],
            children: [],
          },
        ],
      });
      return true;
    });
    expect(ok).toBe(true);

    await page.locator('[data-block-id="li-a3"]').hover();
    await expect(page.locator("[data-gotipe-drag-handle]")).toHaveAttribute("data-block-drag", "li-a3");

    const handleBox = await page.locator("[data-gotipe-drag-handle]").boundingBox();
    const postBox = await page.locator('[data-block-id="post3"]').boundingBox();
    expect(handleBox).not.toBeNull();
    expect(postBox).not.toBeNull();

    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(postBox!.x + 24, postBox!.y + postBox!.height / 2, { steps: 20 });
    await page.mouse.up();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const topLevel = Array.from(document.querySelectorAll("[data-gotipe-content] > [data-block-id]")) as HTMLElement[];
          const root3 = document.querySelector('[data-block-id="list-root-3"]') as HTMLElement | null;
          const root3Rows = root3
            ? Array.from(root3.children)
              .filter((n): n is HTMLElement => n instanceof HTMLElement && n.hasAttribute("data-block-id"))
              .map((n) => n.getAttribute("data-block-id") ?? "")
            : [];
          const extracted = topLevel.find((node) => {
            const type = node.getAttribute("data-block-type");
            if (type !== "bulletList") return false;
            if (node.getAttribute("data-block-id") === "list-root-3") return false;
            return (node.textContent ?? "").includes("alpha3");
          });
          const topIds = topLevel.map((n) => n.getAttribute("data-block-id") ?? "");
          const postIndex = topIds.indexOf("post3");
          return (
            topIds[0] === "pre3" &&
            topIds[1] === "list-root-3" &&
            topIds.length === 4 &&
            postIndex >= 2 &&
            root3Rows.length === 1 &&
            root3Rows[0] === "li-b3" &&
            extracted?.getAttribute("data-block-type") === "bulletList"
          );
        }),
      )
      .toBe(true);
  });

  test("bullet row can be moved into another bullet list", async ({ page }) => {
    const ok = await page.evaluate(() => {
      const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
        | { setContent?: (content: unknown) => void }
        | undefined;
      if (!editor?.setContent) return false;
      editor.setContent({
        version: 1,
        blocks: [
          {
            id: "list-a",
            type: "bulletList",
            attrs: {},
            content: null,
            children: [
              {
                id: "list-a-li",
                type: "listItem",
                attrs: {},
                content: [{ text: "from-a", marks: [] }],
                children: [],
              },
            ],
          },
          {
            id: "between-a-b",
            type: "paragraph",
            attrs: {},
            content: [{ text: "between", marks: [] }],
            children: [],
          },
          {
            id: "list-b",
            type: "bulletList",
            attrs: {},
            content: null,
            children: [
              {
                id: "list-b-li",
                type: "listItem",
                attrs: {},
                content: [{ text: "from-b", marks: [] }],
                children: [],
              },
            ],
          },
        ],
      });
      return true;
    });
    expect(ok).toBe(true);

    await page.locator('[data-block-id="list-a-li"]').hover();
    await expect(page.locator("[data-gotipe-drag-handle]")).toHaveAttribute("data-block-drag", "list-a-li");

    const handleBox = await page.locator("[data-gotipe-drag-handle]").boundingBox();
    const targetRowBox = await page.locator('[data-block-id="list-b-li"]').boundingBox();
    expect(handleBox).not.toBeNull();
    expect(targetRowBox).not.toBeNull();

    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetRowBox!.x + 24, targetRowBox!.y + targetRowBox!.height - 2, { steps: 20 });
    await page.mouse.up();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const listB = document.querySelector('[data-block-id="list-b"]') as HTMLElement | null;
          if (!listB) return [];
          return Array.from(listB.children)
            .filter((node): node is HTMLElement => node instanceof HTMLElement && node.hasAttribute("data-block-id"))
            .map((node) => node.getAttribute("data-block-id") ?? "");
        }),
      )
      .toEqual(["list-b-li", "list-a-li"]);
  });

  test("drop indicator style exists", async ({ page }) => {
    const hasRule = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && rule.selectorText?.includes("gotipe-drop-indicator")) {
              return true;
            }
          }
        } catch {
          // Cross-origin stylesheet access can throw.
        }
      }
      return false;
    });
    expect(hasRule).toBe(true);
  });

  test("drag handle has touch support label", async ({ page }) => {
    await hoverFirstTopLevelBlock(page);
    await expect(page.locator("[data-gotipe-drag-handle]")).toHaveAttribute(
      "aria-label",
      DRAG_HANDLE_LABEL,
    );
  });
});
