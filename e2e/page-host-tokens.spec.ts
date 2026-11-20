import { expect, type Page, test } from '@playwright/test';

// Tokens a host sets on the page, each unset by default (the look as it was): the gap above a
// heading that comes first after the title, the label of a lane cursor's flag, the corners of
// inline code in a table cell.

async function open(page: Page) {
  await page.goto('/?view=page#basic');
  await page.waitForSelector('[data-gotipe-example="page"] [data-gotipe-content]');
  await page.waitForFunction(() => Boolean(window.__GOTIPE_PAGE_EXAMPLE__));
}

const surface = (page: Page) => page.locator('.gotipe-page-example-surface');
const setToken = (page: Page, name: string, value: string) =>
  surface(page).evaluate((node, [token, to]) => (node as HTMLElement).style.setProperty(token!, to!), [name, value]);

test.describe('PageEditor: host tokens of 0.1.5', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test('a heading first after the title stands as a paragraph would, and --gt-head-after-heading sets its own gap', async ({ page }) => {
    /** The gap between the title and the first block after it, for a page of this Markdown. */
    const gap = async (markdown: string) => {
      await page.evaluate((text) => window.__GOTIPE_PAGE_EXAMPLE__!.setMarkdown(text), markdown);
      await expect(page.locator('[data-gotipe-content] > .gotipe-page-title')).toHaveText('Title');
      return page.evaluate(() => {
        const title = document.querySelector('[data-gotipe-content] > .gotipe-page-title')!;
        const first = title.nextElementSibling!;
        return first.getBoundingClientRect().top - title.getBoundingClientRect().bottom;
      });
    };
    const paragraph = await gap('# Title\n\nA paragraph first.\n');
    const heading = await gap('# Title\n\n## A heading first\n\nText.\n');
    expect(paragraph).toBeGreaterThan(0);
    expect(Math.abs(heading - paragraph)).toBeLessThan(0.5);
    // two pixels over the title's own gap: the heading, and only the heading, stands lower
    await setToken(page, '--gt-head-after-heading', 'calc(var(--gt-head-after) + 2px)');
    expect(Math.abs((await gap('# Title\n\n## A heading first\n\nText.\n')) - (paragraph + 2))).toBeLessThan(0.5);
    expect(Math.abs((await gap('# Title\n\nA paragraph first.\n')) - paragraph)).toBeLessThan(0.5);
  });

  test("a cursor flag's label takes the flag's size by default and its own with the tokens, compact or not", async ({ page }) => {
    const anchor = { before: 'Text with ', quote: '`code`', after: ' keeps its formatting.' };
    const cursors = [
      { laneId: 'reviewer', id: 'one', name: 'Reviewer', label: 'writing', anchor },
      { laneId: 'reviewer', id: 'two', name: 'Reviewer', label: 'checking', compact: true, anchor },
    ];
    await page.evaluate((next) => window.__GOTIPE_PAGE_EXAMPLE__!.setReview(next), { cursors });
    await expect(page.locator('.gotipe-lane-cursor')).toHaveCount(2);
    const sizes = () =>
      page.locator('.gotipe-lane-cursor').evaluateAll((nodes) =>
        nodes.map((node) => {
          const name = getComputedStyle(node.querySelector('.gotipe-lane-chip-name')!);
          const label = getComputedStyle(node.querySelector('.gotipe-lane-chip-label')!);
          return { name: [name.fontSize, name.lineHeight], label: [label.fontSize, label.lineHeight] };
        }),
      );
    for (const flag of await sizes()) expect(flag.label).toEqual(flag.name);
    const names = (await sizes()).map((flag) => flag.name);
    await setToken(page, '--gt-flag-label-size', '10px');
    await setToken(page, '--gt-flag-label-leading', '13px');
    const set = await sizes();
    expect(set.map((flag) => flag.label)).toEqual([
      ['10px', '13px'],
      ['10px', '13px'],
    ]);
    expect(set.map((flag) => flag.name)).toEqual(names);
  });

  test('inline code in a table cell keeps inline code corners by default, --gt-table-code-radius sets its own', async ({ page }) => {
    const corners = () =>
      page
        .locator('[data-gotipe-content] td code')
        .first()
        .evaluate((node) => getComputedStyle(node).borderTopLeftRadius);
    const inText = await page
      .locator('[data-gotipe-content] :not(pre):not(td):not(th) > code')
      .first()
      .evaluate((node) => getComputedStyle(node).borderTopLeftRadius);
    expect(await corners()).toBe(inText);
    await setToken(page, '--gt-table-code-radius', '0px');
    expect(await corners()).toBe('0px');
  });
});
