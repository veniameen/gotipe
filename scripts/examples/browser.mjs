import { chromium } from "@playwright/test";

const TYPED = " Typed by the starter check.";
/** Browsers ask for an icon the starters do not ship. */
const IGNORED_URL = /\/favicon\.ico$/;

/**
 * Opens a starter as a person does: the welcome document shows, typed text lands in it, the
 * `/` menu opens on an empty line, and a `dark` class on <html> (the class shadcn/ui's theme
 * switch sets) gives the editor the dark palette. A page error, a console error, a failed
 * request or an error response fails the check.
 */
export async function checkStarterPage(url, { channel } = {}) {
  const browser = await chromium.launch(channel ? { channel } : {});
  const problems = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console error: ${message.text()}`);
    });
    page.on("requestfailed", (request) => {
      if (!IGNORED_URL.test(request.url())) problems.push(`failed request: ${request.url()}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !IGNORED_URL.test(response.url())) {
        problems.push(`${response.status()} for ${response.url()}`);
      }
    });
    await page.goto(url);
    const content = page.getByRole("textbox", { name: "Document content" });
    await content.waitFor({ timeout: 60_000 });
    await content.getByRole("heading", { name: "Welcome to GoTipe" }).waitFor();

    const intro = content.locator('[data-block-id="welcome-intro"]');
    await intro.click();
    await page.keyboard.press("End");
    await page.keyboard.type(TYPED);
    await intro.filter({ hasText: TYPED.trim() }).waitFor({ timeout: 5_000 });

    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await page
      .getByRole("listbox")
      .getByRole("option", { name: /^Heading 1/ })
      .waitFor();
    await page.keyboard.press("Escape");

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.locator('[data-theme="dark"] > .gotipe-block-editor').waitFor({ timeout: 5_000 });
  } finally {
    await browser.close();
  }
  if (problems.length > 0) throw new Error(`${url}\n${problems.join("\n")}`);
}
