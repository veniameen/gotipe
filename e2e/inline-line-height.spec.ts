import { expect, test } from "@playwright/test";

// D-225: inline code and TeX that cannot be read stand in the paragraph's line, as the atoms do
// after D-200. Their smaller monospace type used to take the paragraph's leading in px and push the
// line down: in notion 26 px instead of 24 in Chrome, in docs and minimal 23 instead of 22.
const VIEWS = ["notion", "docs", "modern", "minimal"] as const;

test.describe("a line with inline code or broken TeX keeps its height (D-225)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#atoms");
    await expect(page.locator("[data-gotipe-content]")).toBeVisible();
    await page.evaluate(() => {
      const editor = (window as { __GOTIPE_ATOMS_EDITOR__?: { setContent(doc: unknown): void } })
        .__GOTIPE_ATOMS_EDITOR__;
      const text = (value: string, marks: object[] = []) => ({ text: value, marks });
      const paragraph = (id: string, content: object[]) => ({
        id,
        type: "paragraph",
        attrs: {},
        content,
        children: [],
      });
      editor?.setContent({
        version: 1,
        blocks: [
          paragraph("plain", [text("Строка без вставок")]),
          paragraph("code", [
            text("Строка с "),
            text("inline code", [{ type: "code", attrs: {} }]),
          ]),
          paragraph("invalid", [
            text("Строка с "),
            text("p = \\frac{L}{N", [{ type: "inlineMath", attrs: { key: "f" } }]),
          ]),
        ],
      });
    });
    await expect(page.locator(".gotipe-math-inline.is-invalid")).toBeVisible();
    await expect(page.locator("[data-block-id=code] code")).toBeVisible();
  });

  for (const view of VIEWS) {
    test(view, async ({ page }) => {
      const heights = await page.evaluate((name) => {
        document.querySelector(".gotipe-block-editor")?.setAttribute("data-gt-view", name);
        const height = (id: string) =>
          document.querySelector(`[data-block-id="${id}"]`)?.getBoundingClientRect().height ?? 0;
        const lines = (id: string) =>
          document.querySelector(`[data-block-id="${id}"]`)?.getClientRects().length ?? 0;
        return {
          plain: height("plain"),
          code: height("code"),
          invalid: height("invalid"),
          lines: [lines("plain"), lines("code"), lines("invalid")],
        };
      }, view);
      expect(heights.lines).toEqual([1, 1, 1]);
      expect(heights.plain).toBeGreaterThan(0);
      expect(heights.code).toBe(heights.plain);
      expect(heights.invalid).toBe(heights.plain);
    });
  }
});
