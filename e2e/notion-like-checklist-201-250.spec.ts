import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  bulletList,
  heading,
  openNotionAndReset,
  paragraph,
  setCaretAt,
  setNotionContent,
} from "./helpers/notion-checklist";

type SourceKey = "paragraph" | "heading1" | "heading2" | "heading3" | "bullet";
type TargetKey = "text" | "heading1" | "heading2" | "heading3" | "bullet" | "ordered" | "todo" | "quote" | "code" | "divider" | "table" | "image";

type MarkerContext = {
  blockId: string;
  blockType: string | null;
  parentType: string | null;
  tagName: string | null;
  text: string;
};

type TargetDef = {
  query: string;
  command: string;
  mode: "transform" | "insert";
  expectedBlockType?: string;
  expectedParentType?: string | null;
  expectedTagName?: string;
  expectedInsertedType?: "divider" | "table" | "image";
  requiresFile?: boolean;
};

const SAMPLE_IMAGE = path.resolve(process.cwd(), "e2e/screenshots/slash-menu-open.png");

const TARGETS: Record<TargetKey, TargetDef> = {
  text: { query: "text", command: "Text", mode: "transform", expectedBlockType: "paragraph", expectedParentType: null, expectedTagName: "P" },
  heading1: { query: "h1", command: "Heading 1", mode: "transform", expectedBlockType: "heading", expectedParentType: null, expectedTagName: "H1" },
  heading2: { query: "h2", command: "Heading 2", mode: "transform", expectedBlockType: "heading", expectedParentType: null, expectedTagName: "H2" },
  heading3: { query: "h3", command: "Heading 3", mode: "transform", expectedBlockType: "heading", expectedParentType: null, expectedTagName: "H3" },
  bullet: { query: "bullet", command: "Bullet List", mode: "transform", expectedBlockType: "listItem", expectedParentType: "bulletList", expectedTagName: "LI" },
  ordered: { query: "numbered", command: "Numbered List", mode: "transform", expectedBlockType: "listItem", expectedParentType: "orderedList", expectedTagName: "LI" },
  todo: { query: "todo", command: "To-do List", mode: "transform", expectedBlockType: "todoItem", expectedParentType: "todoList", expectedTagName: "LI" },
  quote: { query: "quote", command: "Quote", mode: "transform", expectedBlockType: "blockquote", expectedParentType: null, expectedTagName: "BLOCKQUOTE" },
  code: { query: "code", command: "Code Block", mode: "transform", expectedBlockType: "codeBlock", expectedParentType: null, expectedTagName: "PRE" },
  divider: { query: "divider", command: "Divider", mode: "insert", expectedInsertedType: "divider" },
  table: { query: "table", command: "Table", mode: "insert", expectedInsertedType: "table" },
  image: { query: "image", command: "Image", mode: "insert", expectedInsertedType: "image", requiresFile: true },
};

const CASES: Array<{ id: string; source: SourceKey; target: TargetKey }> = [];

let nextId = 201;
for (const source of ["paragraph", "heading1", "heading2", "heading3"] as const) {
  for (const target of ["text", "heading1", "heading2", "heading3", "bullet", "ordered", "todo", "quote", "code", "divider", "table", "image"] as const) {
    CASES.push({ id: `NL-${nextId}`, source, target });
    nextId += 1;
  }
}
for (const target of ["text", "heading1"] as const) {
  CASES.push({ id: `NL-${nextId}`, source: "bullet", target });
  nextId += 1;
}
if (CASES.length !== 50 || nextId !== 251) throw new Error("Expected NL-201..NL-250 (50 cases)");

async function syncSelection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { syncSelectionFromDOM?: () => void }
      | undefined;
    editor?.syncSelectionFromDOM?.();
  });
}

async function setupSource(page: Page, source: SourceKey, marker: string): Promise<void> {
  if (source === "paragraph") {
    await setNotionContent(page, [paragraph("batch5-src", marker)]);
    await setCaretAt(page, "batch5-src", "start");
    await syncSelection(page);
    return;
  }

  if (source === "heading1" || source === "heading2" || source === "heading3") {
    const level = source === "heading1" ? 1 : source === "heading2" ? 2 : 3;
    await setNotionContent(page, [heading("batch5-src", level, marker)]);
    await setCaretAt(page, "batch5-src", "start");
    await syncSelection(page);
    return;
  }

  await setNotionContent(page, [bulletList("batch5-list", "batch5-item", marker)]);
  await setCaretAt(page, "batch5-item", "start");
  await syncSelection(page);
}

async function runSlashCommand(page: Page, target: TargetDef): Promise<void> {
  const menu = page.locator("[data-gotipe-slash-menu]");
  await page.keyboard.type(`/${target.query}`);
  await expect(menu).toBeVisible();

  const item = menu.locator(".gotipe-slash-menu-item-title", { hasText: target.command }).first();
  await expect(item).toBeVisible();

  if (target.requiresFile) {
    const chooserPromise = page.waitForEvent("filechooser");
    await item.click();
    const chooser = await chooserPromise;
    await chooser.setFiles(SAMPLE_IMAGE);
  } else {
    await item.click();
  }

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
      blockId: leaf.getAttribute("data-block-id") ?? "",
      blockType: leaf.getAttribute("data-block-type"),
      parentType: parent?.getAttribute("data-block-type") ?? null,
      tagName: leaf.tagName,
      text: leaf.textContent ?? "",
    };
  }, marker);
}

test.describe("Notion-like checklist batch NL-201..NL-250", () => {
  test.beforeEach(async ({ page }) => openNotionAndReset(page));

  for (const c of CASES) {
    test(`${c.id}: ${c.source} -> ${c.target}`, async ({ page }) => {
      const marker = `${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 7)}`;
      const target = TARGETS[c.target];
      await setupSource(page, c.source, marker);
      await runSlashCommand(page, target);

      await expect.poll(async () =>
        page.evaluate((needle) => (document.body.textContent ?? "").includes(needle), marker),
      ).toBe(true);

      if (target.mode === "transform") {
        const ctx = await readMarkerContext(page, marker);
        expect(ctx).not.toBeNull();
        expect(ctx?.blockType).toBe(target.expectedBlockType);
        expect(ctx?.parentType ?? null).toBe(target.expectedParentType ?? null);
        if (target.expectedTagName) expect(ctx?.tagName).toBe(target.expectedTagName);
        const probe = `probe_${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 5)}`;
        await page.keyboard.type(probe);
        if (target.command === "Code Block") {
          await expect.poll(async () =>
            page.evaluate((needle) => (document.body.textContent ?? "").includes(needle), probe),
          ).toBe(true);
        } else {
          await expect.poll(async () => {
            const after = await readMarkerContext(page, marker);
            return after?.text ?? "";
          }).toContain(probe);
        }
      } else {
        const insertedType = target.expectedInsertedType!;
        await expect.poll(async () =>
          page.evaluate(
            (type) =>
              document.querySelectorAll(`[data-gotipe-content] > [data-block-type="${type}"]`)
                .length,
            insertedType,
          ),
        ).toBeGreaterThan(0);

        if (insertedType === "table") {
          await expect.poll(async () =>
            page.evaluate(() => document.querySelectorAll('[data-block-type="table"] [data-block-type="tableCell"], [data-block-type="table"] [data-block-type="tableHeader"]').length),
          ).toBeGreaterThan(0);
        }

        if (insertedType === "image") {
          await expect.poll(async () =>
            page.evaluate(() => document.querySelectorAll('[data-block-type="image"] img').length),
          ).toBeGreaterThan(0);
        }

        const markerCtx = await readMarkerContext(page, marker);
        expect(markerCtx).not.toBeNull();
        await setCaretAt(page, markerCtx!.blockId, "end");
        await syncSelection(page);
        const probe = `probe_${c.id.toLowerCase()}_${Math.random().toString(36).slice(2, 5)}`;
        await page.keyboard.type(probe);
        await expect.poll(async () => {
          const after = await readMarkerContext(page, marker);
          return after?.text ?? "";
        }).toContain(probe);
      }
    });
  }
});
