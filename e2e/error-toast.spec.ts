import { expect, test } from "@playwright/test";

/** Reports an error the way the review layer and extensions do, from the page. */
function report([code, message]: readonly [string, string]) {
  const failure = Object.assign(new Error(message), { name: "GoTipeError", code });
  window.__GOTIPE_EDITOR__!.reportError(failure as never);
}

test("a stale suggestion shows a toast in the interface's words; extension errors stay in the console", async ({
  page,
}) => {
  await page.goto("/?view=block#basic");
  await page.waitForSelector('[data-gotipe-example="basic"]');
  await page.waitForFunction(() => Boolean(window.__GOTIPE_EDITOR__));
  const logged: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") logged.push(message.text());
  });
  const toast = page.locator("[data-gotipe-toast]");

  await page.evaluate(report, ["EXTENSION_ERROR", "Listener failed: update"] as const);
  await page.evaluate(report, [
    "COMPOSITION_CONFLICT",
    "An outside change ended the input",
  ] as const);
  await expect.poll(() => logged.length).toBe(2);
  await expect(toast).toHaveCount(0);

  await page.evaluate(report, ["PROPOSAL_STALE", "The suggestion anchor is ambiguous"] as const);
  await expect(toast).toBeVisible();
  await expect(toast.locator(".gotipe-toast-title")).toHaveText("The suggestion is out of date");
  await expect(toast.locator(".gotipe-toast-detail")).toHaveText(
    "The text around it has changed. Reject it or ask for a new one.",
  );
});
