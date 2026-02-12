import { test, expect } from '@playwright/test';

test.describe('Dark mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-gotipe-example="basic"]');
  });

  test('toggles dark mode via data-theme attribute', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gt-bg'),
    );
    expect(bg.trim()).toBe('#191919');
  });

  test('editor background adapts to dark mode', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const textColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gt-text-base'),
    );
    expect(textColor.trim()).toBe('#e8e8e8');
  });

  test('accent color updates in dark mode', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gt-accent'),
    );
    expect(accent.trim()).toBe('#3b82f6');
  });

  test('borders use light variant in dark mode', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const border = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gt-border-light'),
    );
    expect(border.trim()).toContain('rgba(255,255,255');
  });

  test('shadows have higher opacity in dark mode', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const shadow = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gt-shadow-elevated'),
    );
    // Dark mode shadows use higher opacity (0.16 vs 0.04)
    expect(shadow).toContain('0.16');
  });

  test('slash menu adapts to dark mode', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.click('[data-gotipe-block-editor]');
    await page.keyboard.type('/');
    await page.waitForSelector('[data-gotipe-slash-menu]');
    const menuBg = await page.locator('[data-gotipe-slash-menu]').evaluate((el) =>
      getComputedStyle(el).backgroundColor,
    );
    // Should be dark background, not white
    expect(menuBg).not.toBe('rgb(255, 255, 255)');
  });

  test('code block adapts to dark mode', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const codeBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gt-bg-code'),
    );
    expect(codeBg.trim()).toBe('#2d2d2d');
  });

  test('highlight colors adapt to dark mode', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const blueBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gt-highlight-blue-bg'),
    );
    expect(blueBg.trim()).toBe('#1e3a5f');
    const blueText = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gt-highlight-blue-text'),
    );
    expect(blueText.trim()).toBe('#93c5fd');
  });

  test('hover states use rgba(255,255,255) in dark mode for menus', async ({ page }) => {
    // Dark mode uses rgba(255,255,255,0.08) for hover
    // Verify the CSS rule exists
    const darkHoverExists = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules);
          for (const rule of rules) {
            if (
              rule instanceof CSSStyleRule &&
              rule.selectorText?.includes('[data-theme="dark"]') &&
              rule.selectorText?.includes('bubble-menu')
            ) {
              return true;
            }
          }
        } catch {}
      }
      return false;
    });
    expect(darkHoverExists).toBe(true);
  });

  test('can toggle back to light mode', async ({ page }) => {
    // Go dark
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    let bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gt-bg'),
    );
    expect(bg.trim()).toBe('#191919');

    // Go light
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-theme');
    });
    bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gt-bg'),
    );
    expect(bg.trim()).toBe('#ffffff');
  });

  test('AI ghost text color adapts to dark mode', async ({ page }) => {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    const ghost = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--gt-ai-ghost'),
    );
    expect(ghost.trim()).toBe('#6b7280');
  });

  test('mobile responsive styles work in dark mode', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    // Verify editor still loads correctly at mobile viewport
    await expect(page.locator('[data-gotipe-block-editor]')).toBeVisible();
  });
});
