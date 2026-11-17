import { type CDPSession, type Page, expect, test } from "@playwright/test";

// D-226: an IME composition right after an inline atom. React keeps the atom's document text in the
// line at zero size (`HIDDEN` in atoms.tsx): Chrome loses a composition after an atom whose text is
// out of the flow (with it taken out, the commit doubles: “漢漢字”). A team's emoji is a box in the
// line whose hidden text is a block of no height (theme/atoms.css, D-200). The composition runs
// through the Chrome DevTools protocol, as an IME does: marked text first, then its commit.
// D-240: a click past a line that ends with a mention left the caret where it was.
test.skip(({ browserName }) => browserName !== "chromium", "CDP composition is Chrome's");

type Span = { text: string; marks: { type: string; attrs?: Record<string, unknown> }[] };
type Editor = {
  setContent(doc: unknown): void;
  setSelection(selection: unknown): void;
  focus(): void;
  getJSON(): { blocks: { id: string; content: Span[] }[] };
  getViewState(): { selection: { anchor: Caret; head: Caret } };
};
type Caret = { blockId: string; offset: number };

const EMOJI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const ATOMS = {
  mention: {
    text: "@Anna Kovaleva",
    mark: { type: "mention", attrs: { id: "u3", label: "Anna Kovaleva", kind: "user", key: "m" } },
  },
  page: {
    text: "ADR-0031",
    mark: { type: "mention", attrs: { id: "p2", label: "ADR-0031", kind: "page", key: "m" } },
  },
  formula: { text: "x^2", mark: { type: "inlineMath", attrs: { key: "f" } } },
  emoji: {
    text: ":gotipe:",
    mark: { type: "customEmoji", attrs: { name: "gotipe", src: EMOJI, key: "e" } },
  },
} as const;
const BEFORE = "Ёж 😀 ";
const AFTER = " and all";
const COMPOSED = "漢字";

async function open(page: Page, atom: keyof typeof ATOMS, tail: string): Promise<void> {
  await page.goto("/#atoms");
  await expect(page.locator("[data-gotipe-content]")).toBeVisible();
  await page.evaluate(
    ({ atom, tail, before }) => {
      const editor = (window as { __GOTIPE_ATOMS_EDITOR__?: Editor }).__GOTIPE_ATOMS_EDITOR__!;
      const content: Span[] = [
        { text: before, marks: [] },
        { text: atom.text, marks: [atom.mark] },
      ];
      if (tail) content.push({ text: tail, marks: [] });
      editor.setContent({
        version: 1,
        blocks: [{ id: "p", type: "paragraph", attrs: {}, content, children: [] }],
      });
    },
    { atom: ATOMS[atom], tail, before: BEFORE },
  );
  await expect(page.locator('[data-block-id="p"] [data-gotipe-atom]')).toHaveCount(1);
}

/** Marked text grows as an IME types, then the IME commits it. */
async function compose(session: CDPSession, text: string): Promise<void> {
  const chars = Array.from(text);
  for (let i = 1; i <= chars.length; i++) {
    const part = chars.slice(0, i).join("");
    await session.send("Input.imeSetComposition", {
      text: part,
      selectionStart: part.length,
      selectionEnd: part.length,
    });
  }
  await session.send("Input.insertText", { text });
}

async function state(page: Page) {
  return page.evaluate(() => {
    const editor = (window as { __GOTIPE_ATOMS_EDITOR__?: Editor }).__GOTIPE_ATOMS_EDITOR__!;
    const block = editor.getJSON().blocks[0]!;
    const { anchor, head } = editor.getViewState().selection;
    const atom = document.querySelector('[data-block-id="p"] [data-gotipe-atom]');
    return {
      spans: block.content.map((span) => ({
        text: span.text,
        atomic: span.marks.some((mark) =>
          ["mention", "inlineMath", "customEmoji"].includes(mark.type),
        ),
      })),
      anchor,
      head,
      atoms: document.querySelectorAll('[data-block-id="p"] [data-gotipe-atom]').length,
      // The hidden document text of the atom, as the adapter draws it.
      atomText: atom?.querySelector(":scope > [data-gotipe-widget] + span")?.textContent ?? null,
    };
  });
}

/** The caret comes right after the atom as a person brings it: over the atom with a key, or a click. */
async function placeCaret(page: Page, how: "keys" | "click"): Promise<void> {
  if (how === "keys") {
    await page.locator('[data-block-id="p"]').click({ position: { x: 2, y: 4 } });
    await page.keyboard.press("Home");
    for (const _ of Array.from(BEFORE)) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    return;
  }
  // Just right of the atom: on the left half of the space after it, or past the line's end.
  const box = await page.locator('[data-block-id="p"] [data-gotipe-atom]').boundingBox();
  if (!box) throw new Error("no atom");
  await page.mouse.click(box.x + box.width + 1, box.y + box.height / 2);
}

for (const atom of Object.keys(ATOMS) as (keyof typeof ATOMS)[]) {
  for (const tail of [AFTER, ""]) {
    for (const how of ["keys", "click"] as const) {
      const where = tail ? "inside the line" : "at the end of the block";
      test(`a composition right after the ${atom} ${where} lands after it, caret by ${how} (D-226)`, async ({
        page,
      }) => {
        await open(page, atom, tail);
        const { text } = ATOMS[atom];
        const end = BEFORE.length + text.length;
        await placeCaret(page, how);
        await expect
          .poll(async () => (await state(page)).head)
          .toEqual({ blockId: "p", offset: end });
        await page.evaluate(() => {
          const events: string[] = [];
          (window as { __IME_EVENTS__?: string[] }).__IME_EVENTS__ = events;
          const content = document.querySelector("[data-gotipe-content]")!;
          for (const type of ["compositionstart", "compositionend"])
            content.addEventListener(type, () => events.push(type));
        });
        const session = await page.context().newCDPSession(page);
        try {
          await compose(session, COMPOSED);
        } finally {
          await session.detach();
        }
        // The text came through the IME path, not as plain typing.
        expect(
          await page.evaluate(() => (window as { __IME_EVENTS__?: string[] }).__IME_EVENTS__),
        ).toEqual(["compositionstart", "compositionend"]);
        const after = await state(page);
        expect(after.spans).toEqual([
          { text: BEFORE, atomic: false },
          { text, atomic: true },
          { text: COMPOSED + tail, atomic: false },
        ]);
        const caret = { blockId: "p", offset: end + COMPOSED.length };
        expect(after.anchor).toEqual(caret);
        expect(after.head).toEqual(caret);
        expect(after.atoms).toBe(1);
        expect(after.atomText).toBe(text);
        // Typing goes on at the caret.
        await page.keyboard.type("ё");
        expect((await state(page)).spans.at(-1)).toEqual({
          text: `${COMPOSED}ё${tail}`,
          atomic: false,
        });
      });
    }
  }
}
