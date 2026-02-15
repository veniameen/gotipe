import { expect, test, type Page } from "@playwright/test";
import { openNotionAndReset, setNotionContent, type BlockInput } from "./helpers/notion-checklist";

function spans(text: string) {
  return [{ text, marks: [] as Array<{ type: string; attrs?: Record<string, unknown> }> }];
}

async function setRangeSelection(page: Page, blockId: string, from: number, to: number): Promise<void> {
  await page.evaluate(({ blockId, from, to }) => {
    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | {
          setSelection?: (selection: {
            anchor: { blockId: string; offset: number };
            head: { blockId: string; offset: number };
          }) => void;
          focus?: () => void;
        }
      | undefined;

    editor?.setSelection?.({
      anchor: { blockId, offset: from },
      head: { blockId, offset: to },
    });
    editor?.focus?.();
  }, { blockId, from, to });
}

async function clickBubbleMark(page: Page, mark: "bold" | "italic"): Promise<void> {
  const bubble = page.locator("[data-gotipe-bubble-menu]");
  await expect(bubble).toBeVisible();
  await bubble.locator(`[data-mark="${mark}"]`).click();
}

type ItemStats = {
  itemType: string | null;
  parentType: string | null;
  text: string;
  boldSpans: number;
  italicSpans: number;
};

async function getItemStats(page: Page, itemId: string): Promise<ItemStats | null> {
  return page.evaluate((itemId) => {
    type Mark = { type: string };
    type Span = { text: string; marks?: Mark[] };
    type Block = {
      id: string;
      type: string;
      content: Span[] | string | null;
      children: Block[];
    };

    const editor = (window as Record<string, unknown>).__GOTIPE_NOTION_EDITOR__ as
      | { getViewState?: () => { blocks: Block[] } }
      | undefined;
    const blocks = editor?.getViewState?.().blocks ?? [];

    const find = (nodes: Block[], parentType: string | null): ItemStats | null => {
      for (const node of nodes) {
        if (node.id === itemId) {
          const content = Array.isArray(node.content) ? node.content : [];
          const text = content.map((s) => s.text ?? "").join("");
          const boldSpans = content.filter((s) => (s.marks ?? []).some((m) => m.type === "bold")).length;
          const italicSpans = content.filter((s) => (s.marks ?? []).some((m) => m.type === "italic")).length;
          return {
            itemType: node.type ?? null,
            parentType,
            text,
            boldSpans,
            italicSpans,
          };
        }
        const nested = find(node.children ?? [], node.type);
        if (nested) return nested;
      }
      return null;
    };

    return find(blocks, null);
  }, itemId);
}

type Variant = {
  name: string;
  parentType: "bulletList" | "orderedList" | "todoList";
  itemType: "listItem" | "todoItem";
};

function listBlockForVariant(variant: Variant, listId: string, itemId: string, text: string): BlockInput {
  const attrs = variant.itemType === "todoItem" ? { checked: false } : {};
  return {
    id: listId,
    type: variant.parentType,
    attrs: {},
    content: null,
    children: [
      {
        id: itemId,
        type: variant.itemType,
        attrs,
        content: spans(text),
        children: [],
      },
    ],
  };
}

test.describe("Notion-like planned selection matrix cases", () => {
  test.beforeEach(async ({ page }) => {
    await openNotionAndReset(page);
  });

  test("SEL-005: mark toggle on list item applies cleanly without text/structure artifacts", async ({ page }) => {
    const variants: Variant[] = [
      { name: "bullet", parentType: "bulletList", itemType: "listItem" },
      { name: "ordered", parentType: "orderedList", itemType: "listItem" },
      { name: "todo", parentType: "todoList", itemType: "todoItem" },
    ];

    for (const variant of variants) {
      const marker = `sel005-${variant.name}-${Math.random().toString(36).slice(2, 7)}`;
      const text = `${marker} alpha beta`;
      const itemId = `item-${variant.name}`;
      const listId = `list-${variant.name}`;

      await setNotionContent(page, [listBlockForVariant(variant, listId, itemId, text)]);

      const alphaFrom = text.indexOf("alpha");
      const alphaTo = alphaFrom + "alpha".length;
      const betaFrom = text.indexOf("beta");
      const betaTo = betaFrom + "beta".length;

      await setRangeSelection(page, itemId, alphaFrom, alphaTo);
      await clickBubbleMark(page, "bold");
      await expect.poll(() => getItemStats(page, itemId)).toMatchObject({
        parentType: variant.parentType,
        itemType: variant.itemType,
        text,
      });

      const afterBoldOn = await getItemStats(page, itemId);
      expect((afterBoldOn?.boldSpans ?? 0) > 0).toBe(true);

      await setRangeSelection(page, itemId, alphaFrom, alphaTo);
      await clickBubbleMark(page, "bold");
      await expect.poll(() => getItemStats(page, itemId)).toMatchObject({
        parentType: variant.parentType,
        itemType: variant.itemType,
        text,
      });

      const afterBoldOff = await getItemStats(page, itemId);
      expect(afterBoldOff?.boldSpans ?? 999).toBe(0);

      await setRangeSelection(page, itemId, betaFrom, betaTo);
      await clickBubbleMark(page, "italic");
      await expect.poll(() => getItemStats(page, itemId)).toMatchObject({
        parentType: variant.parentType,
        itemType: variant.itemType,
        text,
      });

      const afterItalicOn = await getItemStats(page, itemId);
      expect((afterItalicOn?.italicSpans ?? 0) > 0).toBe(true);

      await setRangeSelection(page, itemId, betaFrom, betaTo);
      await clickBubbleMark(page, "italic");
      await expect.poll(() => getItemStats(page, itemId)).toMatchObject({
        parentType: variant.parentType,
        itemType: variant.itemType,
        text,
      });

      const afterItalicOff = await getItemStats(page, itemId);
      expect(afterItalicOff?.italicSpans ?? 999).toBe(0);
    }
  });
});
