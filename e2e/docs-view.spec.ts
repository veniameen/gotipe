import { expect, type Locator, type Page, test } from '@playwright/test';

// The view docs (GoTipe Atlas, frame 2; D-30) in the playground's views example: the block handle
// as in notion, in the gutter beside the outline, and a quiet # after the last word of a heading.

/**
 * Opens the views example in docs; the copied text goes to `window.__copied`. The view and the
 * state are chosen from the keyboard: a mouse left over the page by a click would move the handle
 * on its own. When the page scrolls under it, WebKit sends that mouse a `mousemove` of its own a
 * little later (to update the hover), and the handle, with the heading's anchor, goes to the block
 * under it, after a touch too. A test that wants the mouse moves it itself.
 */
async function openDocs(page: Page, width: number, state?: 'read only') {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.assign(window, { __copied: copied });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    });
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/#views');
  await page.getByRole('button', { name: 'docs', exact: true }).press('Enter');
  if (state) await page.getByRole('button', { name: state, exact: true }).press('Enter');
  await expect(page.locator('.gotipe-block-editor[data-gt-view="docs"] .gotipe-content')).toBeVisible();
}

const headingOf = (page: Page, text: string) =>
  page.locator('.gotipe-content > :is(h1, h2, h3)', { hasText: text });
const anchorOf = (heading: Locator) => heading.locator('.gotipe-heading-anchor > button');
const copied = (page: Page) => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);

/** The boxes of the heading's own text, without the anchor. */
const textBoxes = (heading: Locator) =>
  heading.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest('[data-gotipe-widget]')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const boxes: number[][] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects())
        boxes.push([r.left, r.top, r.right, r.bottom].map((value) => Math.round(value)));
    }
    return boxes;
  });

test.describe('View docs: handle and heading anchors (Atlas frame 2)', () => {
  test('the handle stands in the gutter; the anchor keeps its room at rest and shows on hover', async ({
    page,
  }) => {
    await openDocs(page, 1024);
    const heading = headingOf(page, 'What changes');
    const anchor = anchorOf(heading);
    await heading.scrollIntoViewIfNeeded();
    await expect(anchor).toBeHidden();
    const atRest = await textBoxes(heading);

    const box = (await heading.boundingBox())!;
    await page.mouse.move(box.x + 12, box.y + box.height / 2);
    await expect(anchor).toBeVisible();
    // showing the anchor moves no letter of the heading
    expect(await textBoxes(heading)).toEqual(atRest);
    // the # stands just after the last word, inside the heading's own box
    const last = atRest[atRest.length - 1]!;
    const mark = (await anchor.boundingBox())!;
    expect(mark.x - last[2]!).toBeGreaterThanOrEqual(2);
    expect(mark.x - last[2]!).toBeLessThanOrEqual(8);
    expect(mark.x + mark.width).toBeLessThanOrEqual(box.x + box.width + 0.5);

    // the handle is in the 64 px gutter between the outline and the text, clear of both
    const handle = page.locator('.gotipe-block-toolbar-wrapper');
    await expect(handle).toBeVisible();
    const grip = (await handle.boundingBox())!;
    const outline = (await page.locator('.gotipe-outline').boundingBox())!;
    expect(grip.x + grip.width).toBeLessThanOrEqual(box.x);
    expect(grip.x).toBeGreaterThanOrEqual(outline.x + outline.width);
  });

  test('the anchor says what it does, copies the link to the heading and says so', async ({
    page,
  }) => {
    await openDocs(page, 1024);
    const heading = headingOf(page, 'Conflicts');
    const id = await heading.getAttribute('data-block-id');
    // the caret stays where it was
    await page.locator('.gotipe-content > p').first().click();
    const selection = () =>
      page.evaluate(
        () =>
          (window as unknown as { __GOTIPE_VIEWS_EDITOR__: { getViewState(): { selection: unknown } } })
            .__GOTIPE_VIEWS_EDITOR__.getViewState().selection,
      );
    const before = await selection();

    await heading.hover();
    const anchor = anchorOf(heading);
    await anchor.hover();
    const tip = anchor.locator('.gotipe-tip');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('Copy link');
    await anchor.click();
    await expect(tip).toHaveText('Link copied');
    const [link] = await copied(page);
    expect(new URL(link!).searchParams.get('gotipe-block')).toBe(id);
    expect(new URL(link!).hash).toBe('#views');
    expect(await selection()).toEqual(before);
  });

  test('the copied link opens the page at its heading', async ({ page }) => {
    await openDocs(page, 1024);
    const heading = headingOf(page, 'Tasks');
    await heading.hover();
    await anchorOf(heading).click();
    const [link] = await copied(page);
    await page.goto(link!);
    await expect(headingOf(page, 'Tasks')).toBeInViewport();
  });

  test('typing and composing after the last word land once, before the anchor', async ({
    page,
    browserName,
  }) => {
    await openDocs(page, 1024);
    const heading = headingOf(page, 'Rollout order');
    await heading.scrollIntoViewIfNeeded();
    // a click in the room the heading keeps for the anchor puts the caret after the last word
    const boxes = await textBoxes(heading);
    const last = boxes[boxes.length - 1]!;
    await page.mouse.click(last[2]! + 30, (last[1]! + last[3]!) / 2);
    await page.keyboard.type(' first');
    if (browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      try {
        await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
        await cdp.send('Input.imeSetComposition', { text: 'かん', selectionStart: 2, selectionEnd: 2 });
        await cdp.send('Input.insertText', { text: '漢' });
      } finally {
        await cdp.detach();
      }
    } else {
      // native Unicode insertion, not an OS IME
      await page.keyboard.insertText('漢');
    }
    const id = await heading.getAttribute('data-block-id');
    const model = () =>
      page.evaluate((blockId) => {
        const editor = (window as unknown as {
          __GOTIPE_VIEWS_EDITOR__: {
            getViewState(): { blocks: { id: string; content: { text: string }[] }[] };
          };
        }).__GOTIPE_VIEWS_EDITOR__;
        const block = editor.getViewState().blocks.find((item) => item.id === blockId);
        return block?.content.map((span) => span.text).join('');
      }, id);
    await expect.poll(model).toBe('Rollout order first漢');
    // the page shows the same text once, and the anchor still follows it
    const own = await heading.evaluate((element) => {
      const anchor = element.querySelector('.gotipe-heading-anchor')!.parentElement!;
      let text = '';
      for (const node of element.childNodes) if (node !== anchor) text += node.textContent;
      return { text, anchorLast: element.lastChild === anchor };
    });
    expect(own).toEqual({ text: 'Rollout order first漢', anchorLast: true });
  });

  test('the anchor never takes Tab and stays out of the heading\'s name', async ({ page }) => {
    await openDocs(page, 1024);
    await expect(page.getByRole('heading', { name: 'Rollout order', exact: true })).toHaveCount(1);
    const anchor = anchorOf(headingOf(page, 'Rollout order'));
    await expect(anchor).toHaveAttribute('tabindex', '-1');
    await expect(anchor.locator('..')).toHaveAttribute('aria-hidden', 'true');
  });

  test('a narrow page keeps the handle in a 56 px rail; a touch shows the heading\'s anchor', async ({
    page,
  }) => {
    await openDocs(page, 375);
    await expect(page.locator('.gotipe-outline')).toBeHidden();
    const content = page.locator('.gotipe-block-editor[data-gt-view="docs"] .gotipe-content');
    expect(await content.evaluate((element) => getComputedStyle(element).paddingLeft)).toBe('56px');

    const heading = headingOf(page, 'What changes');
    const anchor = anchorOf(heading);
    await heading.scrollIntoViewIfNeeded();
    await expect(anchor).toBeHidden();
    // a finger alone: no mouse over the page, whose hover the browser would update after a scroll
    expect(await page.evaluate(() => document.querySelector(':hover') === null)).toBe(true);
    const box = (await heading.boundingBox())!;
    await heading.dispatchEvent('pointerdown', {
      pointerType: 'touch',
      isPrimary: true,
      clientX: box.x + 12,
      clientY: box.y + box.height / 2,
      bubbles: true,
    });
    await expect(anchor).toBeVisible();
    const grip = (await page.locator('.gotipe-block-toolbar-wrapper').boundingBox())!;
    expect(grip.x).toBeGreaterThanOrEqual(0);
    expect(grip.x + grip.width).toBeLessThanOrEqual(box.x);
  });

  test('read-only: the anchor shows under the pointer and copies; there is no handle', async ({
    page,
  }) => {
    await openDocs(page, 1024, 'read only');
    const heading = headingOf(page, 'How it works');
    await heading.hover();
    await expect(page.locator('.gotipe-block-toolbar-wrapper')).toHaveCount(0);
    const anchor = anchorOf(heading);
    await expect(anchor).toBeVisible();
    await anchor.click();
    expect((await copied(page)).length).toBe(1);
  });

  test('notion draws no anchors', async ({ page }) => {
    await openDocs(page, 1024);
    await page.getByRole('button', { name: 'notion', exact: true }).click();
    await expect(page.locator('.gotipe-block-editor[data-gt-view="notion"]')).toBeVisible();
    await expect(page.locator('.gotipe-heading-anchor')).toHaveCount(0);
  });
});
