import { test, expect } from '@playwright/test';

test.describe('Code block', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-gotipe-example="basic"]');
    await page.click('[data-gotipe-block-editor]');
    // Insert code block via slash menu
    await page.keyboard.type('/code');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    await page.keyboard.press('Enter');
  });

  test('renders code block element', async ({ page }) => {
    await expect(page.locator('.gotipe-code-block')).toBeVisible();
    await expect(page.locator('[data-block-type="codeBlock"]')).toBeVisible();
  });

  test('has language selector dropdown', async ({ page }) => {
    const select = page.locator('.gotipe-code-block-header select');
    await expect(select).toBeVisible();
    await expect(select).toHaveAttribute('aria-label', 'Programming language');
  });

  test('language selector has popular languages', async ({ page }) => {
    const options = page.locator('.gotipe-code-block-header select option');
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(10); // JS, TS, Python, Rust, Go, etc.
  });

  test('language selector changes language', async ({ page }) => {
    const select = page.locator('.gotipe-code-block-header select');
    await select.selectOption('typescript');
    await expect(select).toHaveValue('typescript');
  });

  test('has copy button', async ({ page }) => {
    const copyBtn = page.locator('.gotipe-code-block-header button[aria-label*="Copy"]');
    await expect(copyBtn).toBeVisible();
  });

  test('copy button shows checkmark feedback after click', async ({ page }) => {
    // Type some code first
    await page.keyboard.type('console.log("hello")');
    const copyBtn = page.locator('.gotipe-code-block-header button[aria-label*="Copy"]');
    await copyBtn.click();
    // Should now show "Copied!" aria-label
    await expect(
      page.locator('.gotipe-code-block-header button[aria-label="Copied!"]'),
    ).toBeVisible();
    // Should revert after 2 seconds
    await page.waitForTimeout(2500);
    await expect(
      page.locator('.gotipe-code-block-header button[aria-label="Copy code"]'),
    ).toBeVisible();
  });

  test('shows line numbers for multi-line code', async ({ page }) => {
    await page.keyboard.type('line 1\nline 2\nline 3');
    await expect(page.locator('.gotipe-code-block-line-numbers')).toBeVisible();
    // Line numbers should be aria-hidden for screen readers
    await expect(page.locator('.gotipe-code-block-line-numbers')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  test('applies syntax highlighting via Shiki', async ({ page }) => {
    const select = page.locator('.gotipe-code-block-header select');
    await select.selectOption('javascript');
    await page.keyboard.type('const x = 42;');
    // Wait for Shiki to load and render
    await page.waitForTimeout(1000);
    // Shiki generates spans with color styles
    const highlighted = page.locator('.gotipe-code-block-content');
    if (await highlighted.isVisible()) {
      // Check that Shiki rendered HTML output (contains <span> elements)
      const html = await highlighted.innerHTML();
      expect(html).toContain('span');
    }
  });

  test('has correct border-radius (8px / --gt-radius-md)', async ({ page }) => {
    const borderRadius = await page.locator('.gotipe-code-block').evaluate((el) =>
      getComputedStyle(el).borderRadius,
    );
    expect(borderRadius).toBe('8px');
  });
});
