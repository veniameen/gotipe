import { expect, test } from "@playwright/test";

// Inline code wraps as the text around it does; a host keeps it on one line with
// `--gt-inline-code-wrap: nowrap`, its spaces kept.
test.describe("inline code and --gt-inline-code-wrap", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/#atoms");
    await expect(page.locator("[data-gotipe-content]")).toBeVisible();
    await page.evaluate(() => {
      const editor = (window as { __GOTIPE_ATOMS_EDITOR__?: { setContent(doc: unknown): void } })
        .__GOTIPE_ATOMS_EDITOR__;
      editor?.setContent({
        version: 1,
        blocks: [
          {
            id: "code",
            type: "paragraph",
            attrs: {},
            content: [
              { text: "Run ", marks: [] },
              { text: "npm  run release --tag next --dry-run", marks: [{ type: "code", attrs: {} }] },
              { text: " before the release.", marks: [] },
            ],
            children: [],
          },
        ],
      });
      // a narrow editor: the code is longer than a line
      const root = document.querySelector<HTMLElement>(".gotipe-block-editor");
      if (root) root.style.width = "220px";
    });
    await expect(page.locator("[data-block-id=code] code")).toBeVisible();
  });

  const lines = (page: import("@playwright/test").Page) =>
    page.locator("[data-block-id=code] code").evaluate((code) => {
      const tops = new Set([...code.getClientRects()].map((rect) => Math.round(rect.top)));
      return { lines: tops.size, text: code.textContent, mode: getComputedStyle(code).textWrapMode };
    });

  test("wraps as its text by default, and stays on one line with the token, spaces kept", async ({ page }) => {
    const wrapped = await lines(page);
    expect(wrapped.mode).toBe("wrap");
    expect(wrapped.lines).toBeGreaterThan(1);
    await page.locator(".gotipe-block-editor").evaluate((root) => {
      (root as HTMLElement).style.setProperty("--gt-inline-code-wrap", "nowrap");
    });
    const kept = await lines(page);
    expect(kept.mode).toBe("nowrap");
    expect(kept.lines).toBe(1);
    // its two spaces stay two: the text is not collapsed
    expect(kept.text).toBe("npm  run release --tag next --dry-run");
    const width = await page
      .locator("[data-block-id=code] code")
      .evaluate((code) => {
        const range = document.createRange();
        range.setStart(code.firstChild!, 3);
        range.setEnd(code.firstChild!, 5);
        return range.getBoundingClientRect().width;
      });
    const one = await page.locator("[data-block-id=code] code").evaluate((code) => {
      const range = document.createRange();
      range.setStart(code.firstChild!, 3);
      range.setEnd(code.firstChild!, 4);
      return range.getBoundingClientRect().width;
    });
    expect(width).toBeGreaterThan(one * 1.5);
  });
});
