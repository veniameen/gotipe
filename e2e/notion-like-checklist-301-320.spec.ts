import { expect, test, type Page } from "@playwright/test";
import {
  openNotionAndReset,
  setCaretAt,
  setNotionContent,
  runCodeBlockCommand,
  type BlockInput,
} from "./helpers/notion-checklist";

type SourceKey = "code" | "callout";
type TargetKey =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "ordered"
  | "todo"
  | "quote"
  | "code"
  | "divider"
  | "table"
  | "image";

type TargetDef = {
  query: string;
  command: string;
  mode: "transform" | "insert";
  expectedBlockType?: string;
  expectedParentType?: string | null;
  expectedTagName?: string;
  expectedInsertedType?: "divider" | "table" | "image";
};

type MarkerContext = {
  blockType: string | null;
  parentType: string | null;
  tagName: string | null;
};

const TARGETS: Record<TargetKey, TargetDef> = {
  text: {
    query: "text",
    command: "Text",
    mode: "transform",
    expectedBlockType: "paragraph",
    expectedParentType: null,
    expectedTagName: "P",
  },
  heading1: {
    query: "h1",
    command: "Heading 1",
    mode: "transform",
    expectedBlockType: "heading",
    expectedParentType: null,
    expectedTagName: "H1",
  },
  heading2: {
    query: "h2",
    command: "Heading 2",
    mode: "transform",
    expectedBlockType: "heading",
    expectedParentType: null,
    expectedTagName: "H2",
  },
  heading3: {
    query: "h3",
    command: "Heading 3",
    mode: "transform",
    expectedBlockType: "heading",
    expectedParentType: null,
    expectedTagName: "H3",
  },
  bullet: {
    query: "bullet",
    command: "Bullet List",
    mode: "transform",
    expectedBlockType: "listItem",
    expectedParentType: "bulletList",
    expectedTagName: "LI",
  },
  ordered: {
    query: "numbered",
    command: "Numbered List",
    mode: "transform",
    expectedBlockType: "listItem",
    expectedParentType: "orderedList",
    expectedTagName: "LI",
  },
  todo: {
    query: "todo",
    command: "To-do List",
    mode: "transform",
    expectedBlockType: "todoItem",
    expectedParentType: "todoList",
    expectedTagName: "LI",
  },
  quote: {
    query: "quote",
    command: "Quote",
    mode: "transform",
    expectedBlockType: "blockquote",
    expectedParentType: null,
    expectedTagName: "BLOCKQUOTE",
  },
  code: {
    query: "code",
    command: "Code Block",
    mode: "transform",
    expectedBlockType: "codeBlock",
    expectedParentType: null,
    expectedTagName: "DIV",
  },
  divider: {
    query: "divider",
    command: "Divider",
    mode: "insert",
    expectedInsertedType: "divider",
  },
  table: { query: "table", command: "Table", mode: "insert", expectedInsertedType: "table" },
  image: { query: "image", command: "Image", mode: "insert", expectedInsertedType: "image" },
};

const CASES: Array<{ id: string; source: SourceKey; target: TargetKey }> = [];
let nextId = 301;
for (const target of [
  "bullet",
  "ordered",
  "todo",
  "quote",
  "code",
  "divider",
  "table",
  "image",
] as const) {
  CASES.push({ id: `NL-${nextId}`, source: "code", target });
  nextId += 1;
}
for (const target of [
  "text",
  "heading1",
  "heading2",
  "heading3",
  "bullet",
  "ordered",
  "todo",
  "quote",
  "code",
  "divider",
  "table",
  "image",
] as const) {
  CASES.push({ id: `NL-${nextId}`, source: "callout", target });
  nextId += 1;
}
if (CASES.length !== 20 || nextId !== 321) throw new Error("Expected NL-301..NL-320 (20 cases)");

function spans(text: string) {
  return [{ text, marks: [] as Array<{ type: string }> }];
}

async function syncSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { syncSelectionFromDOM?: () => void }
      | undefined;
    editor?.syncSelectionFromDOM?.();
  });
}

async function setupSource(page: Page, source: SourceKey, marker: string): Promise<void> {
  const block: BlockInput =
    source === "code"
      ? { id: "batch7-src", type: "codeBlock", attrs: {}, content: marker, children: [] }
      : {
          id: "batch7-src",
          type: "callout",
          attrs: { type: "info" },
          content: spans(marker),
          children: [],
        };
  await setNotionContent(page, [block]);
  await setCaretAt(page, "batch7-src", "start");
  await syncSelection(page);
}

async function runSlashCommand(page: Page, target: TargetDef): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  await page.keyboard.type(`/${target.query}`);
  await expect(menu).toBeVisible();

  const item = menu.locator(".gotipe-slash-menu-item-title", { hasText: target.command }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(menu).toBeHidden();
}

async function readMarkerContext(page: Page, marker: string): Promise<MarkerContext | null> {
  return page.evaluate((needle) => {
    const blocks = Array.from(document.querySelectorAll("[data-block-id]")) as HTMLElement[];
    const leaf = blocks.find((el) => {
      const selfHas = (el.textContent ?? "").includes(needle);
      if (!selfHas) return false;
      const childHas = Array.from(el.querySelectorAll("[data-block-id]")).some((child) => {
        if (!(child instanceof HTMLElement) || child === el) return false;
        return (child.textContent ?? "").includes(needle);
      });
      return !childHas;
    });
    if (!leaf) return null;
    const parent = leaf.parentElement?.closest("[data-block-id]") as HTMLElement | null;
    return {
      blockType: leaf.getAttribute("data-block-type"),
      parentType: parent?.getAttribute("data-block-type") ?? null,
      tagName: leaf.tagName,
    };
  }, marker);
}

test.describe("Notion-like checklist batch NL-301..NL-320", () => {
  test.beforeEach(async ({ page }) => openNotionAndReset(page));

  for (const c of CASES) {
    test(`${c.id}: ${c.source} -> ${c.target}`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;
      const target = TARGETS[c.target];
      await setupSource(page, c.source, marker);
      if (c.source === "code") await runCodeBlockCommand(page, target);
      else await runSlashCommand(page, target);

      await expect
        .poll(async () =>
          page.evaluate((needle) => (document.body.textContent ?? "").includes(needle), marker),
        )
        .toBe(true);

      if (target.mode === "transform") {
        const ctx = await readMarkerContext(page, marker);
        expect(ctx?.blockType).toBe(target.expectedBlockType);
        expect(ctx?.parentType ?? null).toBe(target.expectedParentType ?? null);
        if (target.expectedTagName) expect(ctx?.tagName).toBe(target.expectedTagName);
      } else {
        const insertedType = target.expectedInsertedType!;
        await expect
          .poll(async () =>
            page.evaluate(
              (type) =>
                document.querySelectorAll(`[data-gotipe-content] > [data-block-type="${type}"]`)
                  .length,
              insertedType,
            ),
          )
          .toBeGreaterThan(0);
      }
    });
  }
});
