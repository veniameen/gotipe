import { expect, test } from "@playwright/test";

test.describe("Accessibility — ARIA attributes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?view=block#basic");
    await page.waitForSelector('[data-gotipe-example="basic"]');
    await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate(() =>
      window.__GOTIPE_EDITOR__!.setContent({
        version: 1,
        blocks: [{ id: "test-body", type: "paragraph", attrs: {}, content: [], children: [] }],
      }),
    );
  });

  test("slash dialog contains a labelled command list", async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("/");
    await page.waitForSelector("[data-gotipe-slash-menu]");
    await expect(page.locator("[data-gotipe-slash-menu]")).toHaveAttribute("role", "dialog");
    await expect(page.getByRole("listbox", { name: "Commands" })).toBeVisible();
    await expect(page.locator("[data-gotipe-slash-menu]")).toHaveAttribute(
      "aria-label",
      "Insert block",
    );
  });

  test('slash menu items have role="option" and aria-selected', async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("/");
    await page.waitForSelector("[data-gotipe-slash-menu]");
    const firstItem = page.locator("[data-gotipe-slash-item]").first();
    await expect(firstItem).toHaveAttribute("role", "option");
    // First item should be selected by default
    await expect(firstItem).toHaveAttribute("aria-selected", "true");
  });

  test("slash command list exposes the active option", async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("/");
    await page.waitForSelector("[data-gotipe-slash-menu]");
    // The focus stays in the document: the focused editor names the list and its active row.
    const list = page.getByRole("listbox", { name: "Commands" });
    const owner = page.locator(":focus");
    await expect(owner).toHaveAttribute("aria-controls", (await list.getAttribute("id"))!);
    const active = await owner.getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    await expect(page.locator(`#${active}`)).toHaveAttribute("aria-selected", "true");
  });

  test('bubble menu has role="toolbar" and aria-label', async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("Select me");
    await page.keyboard.press("ControlOrMeta+a");
    await page.waitForSelector("[data-gotipe-bubble-menu]");
    await expect(page.locator("[data-gotipe-bubble-menu]")).toHaveAttribute("role", "toolbar");
    await expect(page.locator("[data-gotipe-bubble-menu]")).toHaveAttribute(
      "aria-label",
      "Text formatting",
    );
  });

  test("bubble menu buttons have aria-label and aria-pressed", async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("Format me");
    await page.keyboard.press("ControlOrMeta+a");
    await page.waitForSelector("[data-gotipe-bubble-menu]");
    // Bold button
    const bold = page.locator('[data-mark="bold"]');
    await expect(bold).toHaveAttribute("aria-label", "Bold");
    await expect(bold).toHaveAttribute("aria-pressed");
    // Italic button
    const italic = page.locator('[data-mark="italic"]');
    await expect(italic).toHaveAttribute("aria-label", "Italic");
    await expect(italic).toHaveAttribute("aria-pressed");
  });

  test("more menu has aria-haspopup and aria-expanded", async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("More");
    await page.keyboard.press("ControlOrMeta+a");
    await page.waitForSelector("[data-gotipe-bubble-menu]");
    const moreBtn = page.locator('[aria-label="More formatting options"]');
    await expect(moreBtn).toHaveAttribute("aria-haspopup", "menu");
    await expect(moreBtn).toHaveAttribute("aria-expanded", "false");
    // After clicking
    await moreBtn.click();
    await expect(moreBtn).toHaveAttribute("aria-expanded", "true");
  });

  test("block type dropdown has aria-haspopup and aria-expanded", async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("Block type");
    await page.keyboard.press("ControlOrMeta+a");
    await page.waitForSelector("[data-gotipe-bubble-menu]");
    const trigger = page.locator(".gotipe-block-type-trigger");
    await expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    // After clicking
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    // Dropdown has role="listbox"
    await expect(page.locator("[data-gotipe-block-type-dropdown]")).toHaveAttribute(
      "role",
      "listbox",
    );
  });

  test('block toolbar has role="toolbar"', async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("Hover for toolbar");
    const block = page.locator("[data-block-id]").first();
    await block.hover();
    const toolbar = page.locator(".gotipe-block-toolbar");
    await expect(toolbar).toHaveAttribute("role", "toolbar");
    await expect(toolbar).toHaveAttribute("aria-label", "Block actions");
  });

  test('context menu has role="menu" with menuitem children', async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("Context menu test");
    const block = page.locator("[data-block-id]").first();
    await block.hover();
    await page.click("[data-gotipe-drag-handle]");
    await page.waitForSelector("[data-gotipe-context-menu]");
    await expect(page.locator("[data-gotipe-context-menu]")).toHaveAttribute("role", "menu");
    const menuItems = page.locator('[data-gotipe-context-menu] [role="menuitem"]');
    expect(await menuItems.allTextContents()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Duplicate"),
        expect.stringContaining("Delete"),
      ]),
    );
  });

  test("drag handle has aria-label", async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("Drag handle ARIA");
    const block = page.locator("[data-block-id]").first();
    await block.hover();
    await expect(page.locator("[data-gotipe-drag-handle]")).toHaveAttribute(
      "aria-label",
      "Drag to move, click to open menu",
    );
  });

  test("drag handle SVG is aria-hidden", async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("SVG test");
    const block = page.locator("[data-block-id]").first();
    await block.hover();
    const svg = page.locator("[data-gotipe-drag-handle] svg");
    await expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  test("add block button has aria-label", async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("Add button");
    const block = page.locator("[data-block-id]").first();
    await block.hover();
    await expect(
      page.locator('[aria-label="Click to add below. Option-click to add a block above"]'),
    ).toBeVisible();
  });

  test("code block language selector has aria-label", async ({ page }) => {
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("/code");
    await page.waitForSelector("[data-gotipe-slash-menu]");
    await page.keyboard.press("Enter");
    await expect(
      page.locator('.gotipe-code-block-header select[aria-label="Programming language"]'),
    ).toBeVisible();
  });

  test("comment sidebar has aria-label", async ({ page }) => {
    await page.locator('[data-gotipe-nav="comments"]').click();
    await page.waitForSelector('[data-gotipe-example="comments"]');
    await expect(page.locator(".gotipe-comment-sidebar")).toHaveAttribute("aria-label", "Comments");
  });
});

test.describe("Accessibility — Keyboard navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?view=block#basic");
    await page.waitForSelector('[data-gotipe-example="basic"]');
    await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate(() =>
      window.__GOTIPE_EDITOR__!.setContent({
        version: 1,
        blocks: [{ id: "test-body", type: "paragraph", attrs: {}, content: [], children: [] }],
      }),
    );
    await page.click("[data-gotipe-block-editor]");
  });

  test("Escape closes slash menu", async ({ page }) => {
    await page.keyboard.type("/");
    await page.waitForSelector("[data-gotipe-slash-menu]");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-gotipe-slash-menu]")).not.toBeVisible();
  });

  test("Escape closes bubble menu dropdown", async ({ page }) => {
    await page.keyboard.type("Text");
    await page.keyboard.press("ControlOrMeta+a");
    await page.waitForSelector("[data-gotipe-bubble-menu]");
    await page.click(".gotipe-block-type-trigger");
    await page.waitForSelector("[data-gotipe-block-type-dropdown]");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-gotipe-block-type-dropdown]")).not.toBeVisible();
  });

  test("Escape closes context menu", async ({ page }) => {
    await page.keyboard.type("Escape test");
    const block = page.locator("[data-block-id]").first();
    await block.hover();
    await page.click("[data-gotipe-drag-handle]");
    await page.waitForSelector("[data-gotipe-context-menu]");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-gotipe-context-menu]")).not.toBeVisible();
  });

  test("Escape closes AI command bar", async ({ page }) => {
    await page.goto("/?view=block#basic");
    await page.locator('[data-gotipe-nav="ai"]').click();
    await page.waitForSelector('[data-gotipe-example="ai"]');
    await page.locator("[data-gotipe-content] > [data-block-id]").first().click();
    await page.keyboard.press("ControlOrMeta+j");
    await page.waitForSelector("[data-gotipe-ai-command-bar]");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-gotipe-ai-command-bar]")).not.toBeVisible();
  });

  test("Arrow keys navigate slash menu items", async ({ page }) => {
    await page.keyboard.type("/");
    await page.waitForSelector("[data-gotipe-slash-menu]");
    // First item should be selected
    await expect(page.locator("[data-gotipe-slash-item].selected")).toHaveCount(1);
    // Arrow down
    await page.keyboard.press("ArrowDown");
    const items = page.locator("[data-gotipe-slash-item]");
    const secondItem = items.nth(1);
    if (await secondItem.isVisible()) {
      await expect(secondItem).toHaveClass(/selected/);
    }
    // Arrow up
    await page.keyboard.press("ArrowUp");
    await expect(items.first()).toHaveClass(/selected/);
  });

  test("Enter selects current slash menu item", async ({ page }) => {
    await page.keyboard.type("/h1");
    await page.waitForSelector("[data-gotipe-slash-menu]");
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-gotipe-slash-menu]")).not.toBeVisible();
  });
});

test.describe("Accessibility — Focus management", () => {
  test("slash query keeps the native caret in the document", async ({ page }) => {
    await page.goto("/?view=block#basic");
    await page.waitForSelector('[data-gotipe-example="basic"]');
    await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate(() =>
      window.__GOTIPE_EDITOR__!.setContent({
        version: 1,
        blocks: [{ id: "test-body", type: "paragraph", attrs: {}, content: [], children: [] }],
      }),
    );
    await page.click("[data-gotipe-block-editor]");
    await page.keyboard.type("/");
    await page.waitForSelector("[data-gotipe-slash-menu]");
    await expect(page.locator("[data-gotipe-content]")).toBeFocused();
    await page.keyboard.type("heading");
    await expect(page.locator("[data-gotipe-slash-item]")).toHaveCount(3);
    await expect(page.locator('[data-block-id="test-body"]')).toHaveText("/heading");
  });

  test("AI command bar input receives focus on open", async ({ page }) => {
    await page.goto("/?view=block#basic");
    await page.locator('[data-gotipe-nav="ai"]').click();
    await page.waitForSelector('[data-gotipe-example="ai"]');
    await page.locator("[data-gotipe-content] > [data-block-id]").first().click();
    await page.keyboard.press("ControlOrMeta+j");
    await page.waitForSelector("[data-gotipe-ai-command-bar]");
    const input = page.locator("[data-gotipe-ai-command-bar] input");
    await expect(input).toBeFocused();
  });
});

test.describe("Accessibility — Reduced motion", () => {
  test("reduced motion CSS is defined", async ({ page }) => {
    await page.goto("/?view=block#basic");
    const reducedMotionDefined = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (
              rule instanceof CSSMediaRule &&
              rule.conditionText?.includes("prefers-reduced-motion")
            ) {
              return true;
            }
          }
        } catch {}
      }
      return false;
    });
    expect(reducedMotionDefined).toBe(true);
  });
});

test.describe("Accessibility — Screen reader utilities", () => {
  test("sr-only CSS class exists", async ({ page }) => {
    await page.goto("/?view=block#basic");
    const srOnlyExists = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (rule instanceof CSSStyleRule && rule.selectorText?.includes("gotipe-sr-only")) {
              return true;
            }
          }
        } catch {}
      }
      return false;
    });
    expect(srOnlyExists).toBe(true);
  });
});

test.describe("Accessibility — Live regions", () => {
  test("AI processing is announced and cancellation removes the status", async ({ page }) => {
    await page.goto("/#ai");
    await page.locator("[data-gotipe-content] > [data-block-id]").first().click();
    await page.keyboard.press("ControlOrMeta+j");
    await page.getByRole("textbox", { name: "AI prompt" }).fill("Write about accessibility");
    await page.getByRole("button", { name: "Submit AI command" }).click();
    const status = page.locator("[data-gotipe-ai-status]");
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    await page.getByRole("button", { name: "Cancel AI command" }).click();
    await expect(status).toHaveCount(0);
  });
});

test.describe("Interactive blocks — keyboard and read-only", () => {
  test("task checkbox supports Space, pointer clicks and undo", async ({ page }) => {
    await page.goto("/?view=block#basic");
    await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate(() =>
      window.__GOTIPE_EDITOR__!.setContent({
        version: 1,
        blocks: [
          {
            id: "tasks",
            type: "todoList",
            attrs: {},
            content: null,
            children: [
              {
                id: "task",
                type: "todoItem",
                attrs: { checked: false },
                content: [{ text: "Keyboard 😀", marks: [] }],
                children: [],
              },
            ],
          },
        ],
      }),
    );
    const checkbox = page.getByRole("checkbox");
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await page.locator("[data-gotipe-todo-content]").click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(checkbox).toBeChecked();
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.setEditable(false));
    await expect(checkbox).toBeDisabled();
  });

  test("read-only toggle can reveal content without changing document or history", async ({
    page,
  }) => {
    await page.goto("/?view=block#basic");
    await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
    await page.evaluate(() =>
      window.__GOTIPE_EDITOR__!.setContent({
        version: 1,
        blocks: [
          {
            id: "toggle",
            type: "toggle",
            attrs: { open: false },
            content: [{ text: "Details", marks: [] }],
            children: [
              {
                id: "inside",
                type: "paragraph",
                attrs: {},
                content: [{ text: "Nested content", marks: [] }],
                children: [],
              },
            ],
          },
        ],
      }),
    );
    await page.evaluate(() => window.__GOTIPE_EDITOR__!.setEditable(false));
    const original = await page.evaluate(() => JSON.stringify(window.__GOTIPE_EDITOR__!.getJSON()));
    await page.getByRole("button", { name: "Expand section" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-block-id="inside"]')).toBeVisible();
    await page.getByRole("button", { name: "Collapse section" }).click();
    await expect(page.locator('[data-block-id="inside"]')).not.toBeVisible();
    expect(await page.evaluate(() => JSON.stringify(window.__GOTIPE_EDITOR__!.getJSON()))).toBe(
      original,
    );
  });

  test("PageEditor task checkbox preserves Markdown and supports keyboard undo", async ({
    page,
  }) => {
    await page.goto("/?view=page#basic");
    await page.getByRole("button", { name: "Markdown", exact: true }).click();
    const checkbox = page.locator('[data-block-type="todoItem"] input').last();
    await expect(checkbox).not.toBeChecked();
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    await expect(page.locator("[data-gotipe-page-source]")).toContainText(
      "- [x] Check the table",
    );
    await page.locator("[data-gotipe-todo-content]").last().click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(checkbox).not.toBeChecked();
    await page.getByRole("button", { name: "Read only" }).click();
    await expect(checkbox).toBeDisabled();
  });
});
