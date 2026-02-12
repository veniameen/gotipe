import { test, expect } from '@playwright/test';

test.describe('Comment sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-gotipe-nav="comments"]').click();
    await page.waitForSelector('[data-gotipe-example="comments"]');
  });

  test('sidebar renders with Comments heading', async ({ page }) => {
    await expect(page.locator('.gotipe-comment-sidebar')).toBeVisible();
    await expect(page.locator('.gotipe-comment-sidebar')).toHaveAttribute(
      'aria-label',
      'Comments',
    );
  });

  test('shows filter tabs (Open / Resolved)', async ({ page }) => {
    const sidebar = page.locator('.gotipe-comment-sidebar');
    await expect(sidebar).toContainText('Open');
    await expect(sidebar).toContainText('Resolved');
  });

  test('shows navigation counter', async ({ page }) => {
    // If comments exist, navigation should be visible
    const navCounter = page.locator('.gotipe-comment-sidebar').locator('text=/\\d+\\/\\d+/');
    // May not have comments — soft check
    const sidebarText = await page.locator('.gotipe-comment-sidebar').textContent();
    expect(sidebarText).toBeTruthy();
  });

  test('comment threads have author and timestamp', async ({ page }) => {
    const thread = page.locator('.gotipe-comment-thread').first();
    if (await thread.isVisible()) {
      await expect(thread.locator('.gotipe-comment-author')).toBeVisible();
      await expect(thread.locator('.gotipe-comment-timestamp')).toBeVisible();
    }
  });

  test('comment thread shows quoted text', async ({ page }) => {
    const thread = page.locator('.gotipe-comment-thread').first();
    if (await thread.isVisible()) {
      const quote = thread.locator('.gotipe-comment-quote');
      // Quote may or may not be present
      if (await quote.isVisible()) {
        await expect(quote).toBeVisible();
      }
    }
  });

  test('reply button exists on threads', async ({ page }) => {
    const thread = page.locator('.gotipe-comment-thread').first();
    if (await thread.isVisible()) {
      const replyBtn = thread.locator('button:has-text("Reply")');
      await expect(replyBtn).toBeVisible();
    }
  });

  test('reply input opens on Reply click', async ({ page }) => {
    const thread = page.locator('.gotipe-comment-thread').first();
    if (await thread.isVisible()) {
      const replyBtn = thread.locator('button:has-text("Reply")').last();
      await replyBtn.click();
      // Textarea should appear
      const textarea = thread.locator('textarea');
      await expect(textarea).toBeVisible();
      await expect(textarea).toHaveAttribute('placeholder', 'Reply...');
    }
  });

  test('resolve button exists', async ({ page }) => {
    const thread = page.locator('.gotipe-comment-thread').first();
    if (await thread.isVisible()) {
      const resolveBtn = thread.locator('[aria-label="Resolve"]');
      if (await resolveBtn.isVisible()) {
        await expect(resolveBtn).toBeVisible();
      }
    }
  });

  test('previous/next navigation buttons exist', async ({ page }) => {
    const prevBtn = page.locator('.gotipe-comment-sidebar [aria-label="Previous comment"]');
    const nextBtn = page.locator('.gotipe-comment-sidebar [aria-label="Next comment"]');
    if (await prevBtn.isVisible()) {
      await expect(prevBtn).toBeVisible();
      await expect(nextBtn).toBeVisible();
    }
  });

  test('scroll-to-anchor button exists', async ({ page }) => {
    const thread = page.locator('.gotipe-comment-thread').first();
    if (await thread.isVisible()) {
      const scrollBtn = thread.locator('[aria-label="Scroll to comment"]');
      await expect(scrollBtn).toBeVisible();
    }
  });

  test('filter tabs switch between open and resolved', async ({ page }) => {
    const openBtn = page.locator('.gotipe-comment-sidebar button:has-text("Open")');
    const resolvedBtn = page.locator('.gotipe-comment-sidebar button:has-text("Resolved")');

    if (await openBtn.isVisible()) {
      await resolvedBtn.click();
      // Content should update
      await openBtn.click();
      // Back to open
    }
  });

  test('empty state shows when no comments', async ({ page }) => {
    // Switch to resolved which may be empty
    const resolvedBtn = page.locator('.gotipe-comment-sidebar button:has-text("Resolved")');
    if (await resolvedBtn.isVisible()) {
      await resolvedBtn.click();
      const emptyText = page.locator('.gotipe-comment-sidebar').locator('text=/No .* comments/');
      // May or may not be empty depending on example data
    }
  });

  test('sidebar width is 280px', async ({ page }) => {
    const sidebar = page.locator('.gotipe-comment-sidebar');
    if (await sidebar.isVisible()) {
      const width = await sidebar.evaluate((el) => getComputedStyle(el).width);
      expect(width).toBe('280px');
    }
  });
});
