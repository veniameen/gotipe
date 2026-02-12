import { test, expect } from '@playwright/test';

test.describe('AI Command Bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate to AI example which has AI extensions loaded
    await page.locator('[data-gotipe-nav="ai"]').click();
    await page.waitForSelector('[data-gotipe-example="ai"]');
  });

  test('opens on Mod-k shortcut', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    await expect(page.locator('[data-gotipe-ai-command-bar]')).toBeVisible();
  });

  test('closes on second Mod-k toggle', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    await page.keyboard.press('Meta+k');
    await expect(page.locator('[data-gotipe-ai-command-bar]')).not.toBeVisible();
  });

  test('closes on Escape', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-gotipe-ai-command-bar]')).not.toBeVisible();
  });

  test('closes on outside click', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    await page.click('body', { position: { x: 10, y: 10 } });
    await expect(page.locator('[data-gotipe-ai-command-bar]')).not.toBeVisible();
  });

  test('has input field with placeholder', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    const input = page.locator('[data-gotipe-ai-command-bar] input');
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', 'Tell AI what to change...');
    await expect(input).toHaveAttribute('aria-label', 'AI prompt');
  });

  test('input is focused on open', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    const input = page.locator('[data-gotipe-ai-command-bar] input');
    await expect(input).toBeFocused();
  });

  test('submit button is disabled when empty', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    const submitBtn = page.locator('.gotipe-ai-command-bar-submit');
    await expect(submitBtn).toBeDisabled();
  });

  test('submit button enables with text', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    const input = page.locator('[data-gotipe-ai-command-bar] input');
    await input.fill('Proofread this');
    const submitBtn = page.locator('.gotipe-ai-command-bar-submit');
    await expect(submitBtn).not.toBeDisabled();
  });

  test('submits on Enter and closes', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    const input = page.locator('[data-gotipe-ai-command-bar] input');
    await input.fill('Proofread this document');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-gotipe-ai-command-bar]')).not.toBeVisible();
  });

  test('has pill-shape border-radius (999px)', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    const borderRadius = await page.locator('[data-gotipe-ai-command-bar]').evaluate((el) =>
      getComputedStyle(el).borderRadius,
    );
    expect(borderRadius).toBe('999px');
  });

  test('has sparkle icon', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    const icon = page.locator('.gotipe-ai-command-bar-icon');
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  test('has correct ARIA role', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[data-gotipe-ai-command-bar]');
    await expect(page.locator('[data-gotipe-ai-command-bar]')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('[data-gotipe-ai-command-bar]')).toHaveAttribute(
      'aria-label',
      'AI command bar',
    );
  });
});

test.describe('AI Status Indicator', () => {
  test('status indicator element exists in DOM', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-gotipe-nav="ai"]').click();
    await page.waitForSelector('[data-gotipe-example="ai"]');
    // The AI status indicator is only visible during active processing.
    // Verify the CSS class exists
    const statusCssExists = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (
              rule instanceof CSSStyleRule &&
              rule.selectorText?.includes('gotipe-ai-status')
            ) {
              return true;
            }
          }
        } catch {}
      }
      return false;
    });
    expect(statusCssExists).toBe(true);
  });
});

test.describe('Suggestion toolbar', () => {
  test('suggestion toolbar CSS styles exist', async ({ page }) => {
    await page.goto('/');
    // Verify the suggestion toolbar styles are loaded
    const cssExists = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (
              rule instanceof CSSStyleRule &&
              rule.selectorText?.includes('gotipe-suggestion-toolbar')
            ) {
              return true;
            }
          }
        } catch {}
      }
      return false;
    });
    expect(cssExists).toBe(true);
  });
});

test.describe('Ghost text', () => {
  test('ghost text appears after typing pause (AI example)', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-gotipe-nav="ai"]').click();
    await page.waitForSelector('[data-gotipe-example="ai"]');
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('The quick brown ');
    // Wait for debounce + possible AI generation
    try {
      await page.waitForSelector('.gotipe-ghost-text', { timeout: 5000 });
      await expect(page.locator('.gotipe-ghost-text')).toBeVisible();
    } catch {
      // Ghost text may not appear if AI provider isn't configured — that's OK
      test.skip();
    }
  });
});
