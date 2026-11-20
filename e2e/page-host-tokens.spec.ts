import { expect, type Page, test } from '@playwright/test';

// Tokens a host sets on the page, each unset by default (the look as it was): the gap above a
// heading that comes first after the title, the label of a lane cursor's flag, the corners of
// inline code in a table cell, the room under an editable table.

async function open(page: Page) {
  await page.goto('/?view=page#basic');
  await page.waitForSelector('[data-gotipe-example="page"] [data-gotipe-content]');
  await page.waitForFunction(() => Boolean(window.__GOTIPE_PAGE_EXAMPLE__));
}

const surface = (page: Page) => page.locator('.gotipe-page-example-surface');
const setToken = (page: Page, name: string, value: string) =>
  surface(page).evaluate((node, [token, to]) => (node as HTMLElement).style.setProperty(token!, to!), [name, value]);

/** A page with an editable table and a paragraph after it. */
async function tablePage(page: Page) {
  await page.evaluate(
    (text) => window.__GOTIPE_PAGE_EXAMPLE__!.setMarkdown(text),
    '# Title\n\n| Name | Value |\n| --- | --- |\n| one | 1 |\n\nAfter the table.\n',
  );
  const table = page.locator('[data-gotipe-content] .gotipe-table-wrapper');
  const rows = table.locator('tr');
  await expect(rows).toHaveCount(2);
  const next = page.locator('[data-gotipe-content] p[data-block-id]', { hasText: 'After the table.' });
  return {
    table,
    rows,
    bar: table.getByRole('button', { name: 'Add row', exact: true }),
    nextId: await next.getAttribute('data-block-id'),
    caretIn: () => page.evaluate(() => window.__GOTIPE_EDITOR__!.getViewState().selection.anchor.blockId),
    /** In the window: the table's bottom, its room, the row bar, the top of what follows. */
    measure: () =>
      page.evaluate(() => {
        const wrapper = document.querySelector<HTMLElement>('[data-gotipe-content] .gotipe-table-wrapper')!;
        const bottom = wrapper.querySelector('.gotipe-table-scroll')!.getBoundingClientRect().bottom;
        const element = wrapper.querySelector('.gotipe-table-add-row')!;
        const bar = element.getBoundingClientRect();
        const next = [...document.querySelectorAll('[data-gotipe-content] p[data-block-id]')]
          .find((node) => node.textContent === 'After the table.')!
          .getBoundingClientRect();
        const style = getComputedStyle(wrapper);
        return {
          add: Number.parseFloat(style.getPropertyValue('--gt-table-add')),
          gap: Number.parseFloat(style.getPropertyValue('--gt-table-add-gap')),
          room: wrapper.getBoundingClientRect().bottom - bottom,
          bar: { top: bar.top - bottom, bottom: bar.bottom - bottom, x: bar.left + bar.width / 2 },
          next: next.top - bottom,
          bottom,
          clip: getComputedStyle(element).clipPath,
        };
      }),
    /** What takes the pointer at a point: the row bar, or something else. */
    onBar: (x: number, y: number) =>
      page.evaluate(
        ([px, py]) => Boolean(document.elementFromPoint(px!, py!)?.closest('.gotipe-table-add-row')),
        [x, y],
      ),
  };
}

type Measured = Awaited<ReturnType<Awaited<ReturnType<typeof tablePage>>['measure']>>;
/** A point of the row bar over the top of what follows the table. */
const overNext = (at: Measured) => ({ x: at.bar.x, y: at.bottom + (Math.max(at.next, at.bar.top) + at.bar.bottom) / 2 });

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

  test('by default the gap between a table and its row bar is the table\'s own room: a click there adds no row', async ({ page }) => {
    const the = await tablePage(page);
    const at = await the.measure();
    expect(at.room).toBe(at.add + at.gap);
    // the pointer on the table, then in the gap under it: the table's room, not the bar
    const last = (await the.rows.last().boundingBox())!;
    const gap = { x: at.bar.x, y: at.bottom + at.gap / 2 };
    await page.mouse.move(gap.x, last.y + last.height / 2);
    await page.mouse.move(gap.x, gap.y, { steps: 4 });
    await expect(the.bar).toHaveCSS('opacity', '1');
    expect(await the.onBar(gap.x, gap.y)).toBe(false);
    await page.mouse.click(gap.x, gap.y);
    await expect(the.rows).toHaveCount(2);
    // the bar itself still adds one
    await page.mouse.click(gap.x, at.bottom + at.gap + at.add / 2);
    await expect(the.rows).toHaveCount(3);
  });

  test('--gt-table-add-room: with no room (0px or 0) the row bar stands over what follows for the pointer on the table and for the keyboard alone', async ({ page }) => {
    const the = await tablePage(page);
    const { rows, bar, caretIn, measure, onBar } = the;
    const room = await measure();
    // by default: room for the bar and its gap, the bar in it, what follows under it
    expect(room.room).toBe(room.add + room.gap);
    expect(room.bar.top).toBe(room.gap);
    expect(room.bar.bottom).toBe(room.gap + room.add);
    expect(room.next).toBeGreaterThanOrEqual(room.bar.bottom);

    await setToken(page, '--gt-table-add-room', '0px');
    const none = await measure();
    expect(none.room).toBe(0);
    // what follows moves up by the room; the bar stays a gap under the table, over its top
    expect(Math.abs(none.next - (room.next - room.room))).toBeLessThan(0.5);
    expect(none.bar.top).toBe(none.gap);
    expect(none.bar.bottom).toBe(none.gap + none.add);
    expect(none.next).toBeLessThan(none.bar.bottom - 2);
    // a unitless 0 is the same: the bar's place and its cut
    await setToken(page, '--gt-table-add-room', '0');
    expect(await measure()).toEqual(none);
    const at = overNext(none);

    // the pointer elsewhere: nothing of the bar is there, a click goes to what follows
    await page.mouse.move(1, 1);
    expect(await onBar(at.x, at.y)).toBe(false);
    await page.mouse.click(at.x, at.y);
    await expect.poll(caretIn).toBe(the.nextId);
    await expect(rows).toHaveCount(2);

    // from the table down to the bar, a pixel at a time across the gap: it shows and adds a row
    const last = (await rows.last().boundingBox())!;
    await page.mouse.move(at.x, last.y + last.height / 2);
    await page.mouse.move(at.x, at.y, { steps: Math.ceil(at.y - (last.y + last.height / 2)) });
    expect(await onBar(at.x, at.y)).toBe(true);
    await expect(bar).toHaveCSS('opacity', '1');
    await page.mouse.click(at.x, at.y);
    await expect(rows).toHaveCount(3);

    // a caret in the table does not bring the bar over what follows; Tab from the last cell does
    await rows.last().locator('td').last().click();
    await page.mouse.move(1, 1);
    const below = overNext(await measure());
    expect(await onBar(below.x, below.y)).toBe(false);
    await page.keyboard.press('Tab');
    await expect(bar).toBeFocused();
    await expect(bar).toHaveCSS('clip-path', 'none');
    expect(await onBar(below.x, below.y)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(rows).toHaveCount(4);
  });
});
