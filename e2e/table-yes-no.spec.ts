import { type Page, expect, test } from "@playwright/test";

// The PageEditor of the Basic example: its “Done” column holds “yes” and “no”, as an earlier
// version wrote them.

const source = (page: Page) => page.locator("[data-gotipe-page-source]");

test("“Yes / no” writes ✓ and — into the file; the earlier words still read as that type", async ({
  page,
}) => {
  await page.goto("/?view=page#basic");
  await page.waitForSelector('[data-gotipe-example="page"] [data-gotipe-content]');
  await page.getByRole("button", { name: "Markdown" }).click();
  await expect(source(page)).toContainText("| `delta` |  | yes |");

  const header = page.locator(".gotipe-table th").nth(2);
  await header.hover();
  await header.locator(".gotipe-column-handle").click();
  const menu = page.locator("[data-gotipe-column-menu]");
  const yesNo = menu.getByRole("menuitemradio", { name: "Yes / no" });
  await expect(yesNo).toHaveAttribute("aria-checked", "true");
  await yesNo.click();
  await expect(menu).toHaveCount(0);

  await expect(source(page)).toContainText("| `alpha` |  | — |");
  await expect(source(page)).toContainText("| `delta` |  | ✓ |");
  await expect(source(page)).not.toContainText("| no |");

  // The menu gave the keys back to the document: one ⌘Z brings the words back.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(source(page)).toContainText("| `alpha` |  | no |");
  await expect(source(page)).toContainText("| `delta` |  | yes |");
});
