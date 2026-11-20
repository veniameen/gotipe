import { expect, type Page, test } from '@playwright/test';

// A review whose proposals are still being written (`live`), on the public PageEditor showcase.
// The review is given through the showcase's own hook, as a host gives it: a new proposal object
// with a longer text under the same id.

type Edit = { before: string; quote: string; after: string; text: string };
type Proposal = { id: string; laneId: string; edits: Edit[]; live?: boolean; order?: number; reason?: string };
type Cursor = { laneId: string; id?: string; name?: string; label?: string; compact?: boolean; proposalId?: string };
type Review = { proposals?: Proposal[]; cursors?: Cursor[]; laneCursor?: 'caret' | 'pointer' };

/** After the code block of the sample page: where new sections are written. */
const place = { before: 'const message = "Hello, world";\n```', quote: '', after: '\n\n<details>' };
const part = (id: string, text: string, more: Partial<Proposal> = {}): Proposal => ({
  id,
  laneId: 'reviewer',
  live: true,
  edits: [{ ...place, text }],
  ...more,
});

async function open(page: Page) {
  await page.goto('/?view=page#basic');
  await page.waitForSelector('[data-gotipe-example="page"] [data-gotipe-content]');
  await page.waitForFunction(() => Boolean(window.__GOTIPE_PAGE_EXAMPLE__));
}

const show = (page: Page, review: Review) =>
  page.evaluate((next) => window.__GOTIPE_PAGE_EXAMPLE__!.setReview(next), review);

/** The suggested blocks of the page, top level only. */
const suggested = (page: Page) =>
  page.locator('[data-gotipe-phantom-id]:not([data-gotipe-phantom-id] [data-gotipe-phantom-id])');
const texts = (page: Page) => suggested(page).allTextContents();

test.describe('PageEditor review: a growing proposal', () => {
  test.beforeEach(async ({ page }) => {
    await open(page);
  });

  test('its text grows in place, whole at every step, and is not revealed when it is written', async ({ page }) => {
    await show(page, { proposals: [part('p', '')] });
    await expect(page.locator('.gotipe-review-bar')).toBeVisible();
    await expect(suggested(page)).toHaveCount(0);
    await show(page, { proposals: [part('p', '\n\n## Summary\n\nThe first sen')] });
    // no reveal: the whole text is there at once
    await expect.poll(() => texts(page)).toEqual(['Summary', 'The first sen']);
    // the heading written before keeps its element while the text grows
    await suggested(page).first().evaluate((element) => {
      (window as unknown as { kept: Element }).kept = element;
    });
    await show(page, { proposals: [part('p', '\n\n## Summary\n\nThe first sentence.\n\n- one\n- tw')] });
    await expect.poll(() => texts(page)).toEqual(['Summary', 'The first sentence.', 'onetw']);
    const same = () =>
      suggested(page).first().evaluate((element) => element === (window as unknown as { kept: Element }).kept);
    expect(await same()).toBe(true);
    // growing: it waits for no answer
    await expect(page.locator('.gotipe-review-bar')).not.toContainText(/\d suggestion/);
    await expect(page.locator('.gotipe-review-bar').getByRole('button', { name: 'Accept all' })).toHaveCount(0);
    await suggested(page).first().click();
    const card = page.locator('[data-gotipe-review-card="proposal"]');
    await expect(card).toBeVisible();
    await expect(card.getByRole('button')).toHaveCount(0);
    // written: the same id without `live`
    const written = { ...part('p', '\n\n## Summary\n\nThe first sentence.\n\n- one\n- two\n'), live: false };
    await page.evaluate((next) => {
      window.__GOTIPE_PAGE_EXAMPLE__!.setReview(next);
      // right after the change, before any frame: a reveal would have cut the text here
      return new Promise<void>((done) => queueMicrotask(done));
    }, { proposals: [written] });
    await expect.poll(() => texts(page)).toEqual(['Summary', 'The first sentence.', 'onetwo']);
    // and stays whole on every frame after: a reveal would show it letter by letter
    const whole = 'SummaryThe first sentence.onetwo'.length;
    for (let frame = 0; frame < 6; frame++) {
      expect((await texts(page)).join('').length).toBe(whole);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => done(null))));
    }
    expect(await same()).toBe(true);
    await expect(page.locator('.gotipe-review-bar')).toContainText('1 suggestion');
    await expect(card.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Reject' })).toBeVisible();
  });

  test('several growing proposals at one point stand in their order and keep it as they grow', async ({ page }) => {
    await show(page, { proposals: [part('b', '\n\n## Second', { order: 2 })] });
    await expect.poll(() => texts(page)).toEqual(['Second']);
    await show(page, {
      proposals: [part('b', '\n\n## Second\n\nSecond text', { order: 2 }), part('a', '\n\n## First', { order: 1 })],
    });
    await expect.poll(() => texts(page)).toEqual(['First', 'Second', 'Second text']);
    await show(page, {
      proposals: [
        part('b', '\n\n## Second\n\nSecond text grows', { order: 2 }),
        part('a', '\n\n## First\n\nFirst text', { order: 1 }),
      ],
    });
    await expect.poll(() => texts(page)).toEqual(['First', 'First text', 'Second', 'Second text grows']);
    // the sections stand in the page's flow, one under the other
    const tops = await suggested(page).evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    // without an order: as they are listed
    await show(page, { proposals: [part('z', '\n\nListed first'), part('y', '\n\nListed second')] });
    await expect.poll(() => texts(page)).toEqual(['Listed first', 'Listed second']);
  });

  test('a lane has several cursors, each with its own name; a compact one is one line', async ({ page }) => {
    const proposals = [
      part('a', '\n\n## First\n\nFirst text', { order: 1 }),
      part('b', '\n\n## Second\n\nSecond text', { order: 2 }),
    ];
    await show(page, {
      proposals,
      cursors: [
        { laneId: 'reviewer', id: 'one', name: 'First', label: 'writing', compact: true, proposalId: 'a' },
        { laneId: 'reviewer', id: 'two', name: 'Second', label: 'writing', proposalId: 'b' },
      ],
    });
    const cursors = page.locator('.gotipe-lane-cursor');
    await expect(cursors).toHaveCount(2);
    await expect(cursors.locator('.gotipe-lane-chip-name')).toHaveText(['First', 'Second']);
    // each stands at the end of its own text
    const ends = await page.evaluate(() =>
      ['a', 'b'].map((id) => {
        const blocks = document.querySelectorAll(`[data-gotipe-proposal="${id}"].gotipe-sug-block-ins`);
        const range = document.createRange();
        range.selectNodeContents(blocks[blocks.length - 1]!);
        const rects = range.getClientRects();
        const last = rects[rects.length - 1]!;
        return { top: last.top, left: last.right };
      }),
    );
    for (const [index, end] of ends.entries()) {
      const box = await cursors.nth(index).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, left: rect.left };
      });
      expect(Math.abs(box.left - end.left)).toBeLessThan(1.5);
      expect(Math.abs(box.top - end.top)).toBeLessThan(1.5);
    }
    // compact: the name and what it does share a line; otherwise the label is under the name
    const lines = (index: number) =>
      cursors.nth(index).evaluate((element) => {
        const name = element.querySelector('.gotipe-lane-chip-name')!.getBoundingClientRect();
        const label = element.querySelector('.gotipe-lane-chip-label')!.getBoundingClientRect();
        return { sameLine: Math.abs(name.top - label.top) < 3 && label.left >= name.right, under: label.top >= name.bottom - 1 };
      });
    await expect(cursors.first()).toHaveAttribute('data-compact', '');
    expect(await lines(0)).toEqual({ sameLine: true, under: false });
    expect(await lines(1)).toEqual({ sameLine: false, under: true });
  });

  test('a compact flag is placed by the pointer tokens, and stands left of its cursor at the page edge', async ({ page }) => {
    // a host's place for a compact flag: on the cursor's own row, after it
    await page.addStyleTag({
      content:
        '.gotipe-lane-cursor[data-compact] { --gt-lane-pointer-at: 0px; --gt-lane-pointer-chip-x: 12px; --gt-lane-pointer-chip-y: 0px; }',
    });
    const cursor = { laneId: 'reviewer', id: 'c', name: 'Summary', label: 'writing', compact: true, proposalId: 'p' };
    await show(page, { proposals: [part('p', '\n\n## Summary')], cursors: [cursor], laneCursor: 'pointer' });
    const element = page.locator('.gotipe-lane-cursor');
    await expect(element).toHaveAttribute('data-variant', 'pointer');
    await expect(element).toHaveAttribute('data-chip-side', 'right');
    const boxes = () =>
      element.evaluate((node) => {
        const own = node.getBoundingClientRect();
        const chip = node.querySelector('.gotipe-lane-chip')!.getBoundingClientRect();
        const page = node.ownerDocument.querySelector('.gotipe-page')!.getBoundingClientRect();
        return { left: own.left, top: own.top, bottom: own.bottom, chip: { left: chip.left, right: chip.right, top: chip.top, bottom: chip.bottom }, pageRight: page.right };
      });
    const placed = await boxes();
    expect(Math.abs(placed.chip.left - (placed.left + 12))).toBeLessThan(1);
    expect(Math.abs(placed.chip.top - placed.top)).toBeLessThan(1);
    expect(placed.chip.right).toBeLessThanOrEqual(placed.pageRight);
    // the page narrows until the flag has no room after its cursor
    const surface = page.locator('.gotipe-page-example-surface');
    const narrow = async (side: 'left' | 'right') => {
      for (let width = 520; width >= 200; width -= 20) {
        await surface.evaluate((node, value) => {
          (node as HTMLElement).style.width = `${value}px`;
        }, width);
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))));
        if ((await element.getAttribute('data-chip-side')) === side) return width;
      }
      return 0;
    };
    const at = await narrow('left');
    expect(at).toBeGreaterThan(0);
    const flipped = await boxes();
    // before the cursor and above its row, inside the page
    expect(Math.abs(flipped.chip.right - flipped.left)).toBeLessThan(1);
    expect(flipped.chip.bottom).toBeLessThanOrEqual(flipped.top);
    expect(flipped.chip.right).toBeLessThanOrEqual(flipped.pageRight);
    // one step wider it would fit again by a little: it keeps its side; with the page wide, it is back
    await surface.evaluate((node, value) => {
      (node as HTMLElement).style.width = `${value}px`;
    }, at + 4);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))));
    await expect(element).toHaveAttribute('data-chip-side', 'left');
    await surface.evaluate((node) => {
      (node as HTMLElement).style.width = '';
    });
    await expect(element).toHaveAttribute('data-chip-side', 'right');
    // a flag that is not compact keeps its place whatever the side says
    await show(page, { cursors: [{ ...cursor, compact: false }] });
    await expect(element).not.toHaveAttribute('data-compact', '');
    expect(await narrow('left')).toBeGreaterThan(0);
    const loose = await boxes();
    expect(loose.chip.left).toBeGreaterThan(loose.left);
    expect(loose.chip.top).toBeGreaterThanOrEqual(loose.top);
  });

  test("a flag finds its side again when only the page's edge moves", async ({ page }) => {
    await page.addStyleTag({
      content: [
        '.gotipe-lane-cursor[data-compact] { --gt-lane-pointer-at: 0px; --gt-lane-pointer-chip-x: 12px; --gt-lane-pointer-chip-y: 0px; }',
        // the page's end edge moves and its text does not: its width and its end padding change together
        '.gotipe-page-example-surface .gotipe-page { box-sizing: border-box; margin-right: auto; width: calc(460px + var(--edge, 400px)); padding-right: var(--edge, 400px); }',
        // the text being written ends at the end of its row, so its cursor stands by the page's edge
        '.gotipe-page-example-surface [data-gotipe-phantom-id] { text-align: right; }',
        // and the cursor is at its place at once: its box is measured where it stands
        '.gotipe-page-example-surface { --gt-lane-cursor-move: 0s; }',
      ].join('\n'),
    });
    const cursor = { laneId: 'reviewer', id: 'c', name: 'Summary', label: 'writing', compact: true, proposalId: 'p' };
    await show(page, { proposals: [part('p', '\n\n## Summary')], cursors: [cursor], laneCursor: 'pointer' });
    await expect(suggested(page)).toHaveText(['Summary']);
    const element = page.locator('.gotipe-lane-cursor');
    // it stands at the end of the written text
    const textEnd = () =>
      page.locator('.gotipe-sug-live').evaluate((node) => {
        const range = node.ownerDocument.createRange();
        range.selectNodeContents(node);
        const rects = range.getClientRects();
        return rects[rects.length - 1]!.right;
      });
    await expect
      .poll(async () => Math.abs((await element.evaluate((node) => node.getBoundingClientRect().left)) - (await textEnd())))
      .toBeLessThan(1.5);
    await expect(element).toHaveAttribute('data-chip-side', 'right');
    const boxes = () =>
      element.evaluate((node) => {
        const own = node.getBoundingClientRect();
        const chip = node.querySelector('.gotipe-lane-chip')!.getBoundingClientRect();
        const page = node.ownerDocument.querySelector('.gotipe-page')!.getBoundingClientRect();
        return { left: own.left, top: own.top, chip: { left: chip.left, right: chip.right, bottom: chip.bottom }, page: { left: page.left, right: page.right } };
      });
    const wide = await boxes();
    // the flag has room after its cursor, and ends past the text's own column
    expect(wide.chip.right).toBeLessThan(wide.page.right);
    expect(wide.chip.right).toBeGreaterThan(wide.page.left + 460 + 8);
    const surface = page.locator('.gotipe-page-example-surface');
    /** Puts the page's end edge at `x` of the window and lets two frames pass. */
    const edgeAt = async (x: number) => {
      await surface.evaluate((node, value) => {
        (node as HTMLElement).style.setProperty('--edge', `${value}px`);
      }, x - wide.page.left - 460);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))));
    };
    // the edge comes in and crosses the flag by a little; the text and its cursor stay where they were
    await edgeAt(wide.chip.right - 4);
    await expect(element).toHaveAttribute('data-chip-side', 'left');
    const flipped = await boxes();
    expect(Math.abs(flipped.page.right - (wide.chip.right - 4))).toBeLessThan(1);
    expect([flipped.left, flipped.top]).toEqual([wide.left, wide.top]);
    expect(Math.abs(flipped.chip.right - flipped.left)).toBeLessThan(1);
    expect(flipped.chip.bottom).toBeLessThanOrEqual(flipped.top);
    // the flag would fit after its cursor again by a little: it keeps its side
    await edgeAt(wide.chip.right + 4);
    await expect(element).toHaveAttribute('data-chip-side', 'left');
    // with room to spare it is back, and the cursor has not moved all the while
    await edgeAt(wide.chip.right + 40);
    await expect(element).toHaveAttribute('data-chip-side', 'right');
    const back = await boxes();
    expect([back.left, back.top]).toEqual([wide.left, wide.top]);
    expect(Math.abs(back.chip.right - wide.chip.right)).toBeLessThan(1);
  });

  test('its cursor waits where the text will start and follows the text; no motion when reduced', async ({ page }) => {
    const cursor = { laneId: 'reviewer', id: 'c', label: 'writing', proposalId: 'p' };
    await show(page, { proposals: [part('p', '')], cursors: [cursor] });
    const element = page.locator('.gotipe-lane-cursor');
    await expect(element).toHaveCount(1);
    // no text yet: at the end of the block the text will follow
    const anchor = await page.evaluate(() => {
      const code = document.querySelector('[data-block-type="codeBlock"] code')!;
      const range = document.createRange();
      range.selectNodeContents(code);
      const rects = range.getClientRects();
      return rects[rects.length - 1]!.right;
    });
    const at = () => element.evaluate((node) => node.getBoundingClientRect().left);
    expect(Math.abs((await at()) - anchor)).toBeLessThan(1.5);
    await expect(element).toHaveAttribute('data-glide', '');
    const move = () => element.evaluate((node) => getComputedStyle(node).transitionDuration);
    expect(await move()).toBe('0.1s');
    await show(page, { proposals: [part('p', '\n\nSome text')], cursors: [cursor] });
    await expect(suggested(page)).toHaveText(['Some text']);
    await expect.poll(async () => Math.abs((await at()) - anchor)).toBeGreaterThan(5);
    // a host's own duration, set above the page
    await page.locator('.gotipe-page-example-surface').evaluate((node) => node.style.setProperty('--gt-lane-cursor-move', '250ms'));
    expect(await move()).toBe('0.25s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(Number.parseFloat(await move())).toBeLessThan(0.001);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // a scroll moves it at once
    await page.locator('.gotipe-page-example-surface').evaluate((node) => {
      node.scrollTop += 40;
    });
    await expect(element).not.toHaveAttribute('data-glide', '');
    // the text grows on: a glide again, and a scroll elsewhere on the screen does not end it
    await show(page, { proposals: [part('p', '\n\nSome text more')], cursors: [cursor] });
    await expect(element).toHaveAttribute('data-glide', '');
    await page.evaluate(async () => {
      const other = document.createElement('div');
      other.style.cssText = 'position: fixed; top: 0; left: 0; width: 40px; height: 40px; overflow: auto;';
      const tall = document.createElement('div');
      tall.style.height = '400px';
      other.append(tall);
      document.body.append(other);
      const scrolled = new Promise((done) => other.addEventListener('scroll', done, { once: true }));
      other.scrollTop = 60;
      await scrolled;
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null))));
      other.remove();
    });
    await expect(element).toHaveAttribute('data-glide', '');
    // the page narrows: it is at its new place at once
    await page.locator('.gotipe-page-example-surface').evaluate((node) => {
      (node as HTMLElement).style.width = `${node.getBoundingClientRect().width - 60}px`;
    });
    await expect(element).not.toHaveAttribute('data-glide', '');
  });

  test('unfinished Markdown at its end is text and changes nothing shown before or after it', async ({ page }) => {
    // the page's own blocks: a suggested one is marked as such
    const pageBlocks = () =>
      page.locator('[data-gotipe-content]').evaluate((element) =>
        [...element.querySelectorAll('[data-block-id]:not([data-gotipe-phantom-id])')].map((block) =>
          block.getAttribute('data-block-type'),
        ),
      );
    const before = await pageBlocks();
    await show(page, { proposals: [part('p', '\n\nA **bold** word and **unfin')] });
    await expect.poll(() => texts(page)).toEqual(['A bold word and **unfin']);
    await expect(suggested(page).locator('strong')).toHaveText(['bold']);
    await show(page, { proposals: [part('p', '\n\nA **bold** word and `code` and [a link](https://exa')] });
    await expect.poll(() => texts(page)).toEqual(['A bold word and code and [a link](https://exa']);
    await expect(suggested(page).locator('a')).toHaveCount(0);
    // a table: its head and delimiter rows are text until both are whole, then it stands with
    // all its columns and grows by whole rows; a row being written is a line of text under it
    await show(page, { proposals: [part('p', '\n\n| a | b |')] });
    await expect.poll(() => texts(page)).toEqual(['| a | b |']);
    await show(page, { proposals: [part('p', '\n\n| a | b |\n| --- | --- |')] });
    await expect.poll(() => texts(page)).toEqual(['| a | b |', '| --- | --- |']);
    await expect(suggested(page).locator('table')).toHaveCount(0);
    await show(page, { proposals: [part('p', '\n\n| a | b |\n| --- | --- |\n')] });
    await expect(suggested(page).locator('table')).toHaveCount(1);
    await expect(suggested(page).locator('th')).toHaveText(['a', 'b']);
    await show(page, { proposals: [part('p', '\n\n| a | b |\n| --- | --- |\n| 1 | `co')] });
    await expect(suggested(page)).toHaveCount(2);
    await expect(suggested(page).locator('tr')).toHaveCount(1);
    await expect(suggested(page).nth(1)).toHaveText('| 1 | `co');
    await expect(suggested(page).locator('code')).toHaveCount(0);
    await show(page, { proposals: [part('p', '\n\n| a | b |\n| --- | --- |\n| 1 | `code` |\n| 2')] });
    await expect(suggested(page).locator('tr')).toHaveCount(2);
    await expect(suggested(page).locator('td')).toHaveText(['1', 'code']);
    await expect(suggested(page).locator('td code')).toHaveText('code');
    await expect(suggested(page).nth(1)).toHaveText('| 2');
    // an open code block: the code so far in a code block, and the page below untouched
    await show(page, { proposals: [part('p', '\n\nText.\n\n```ts\nconst open = 1;')] });
    await expect(suggested(page)).toHaveCount(2);
    await expect(suggested(page).nth(1)).toHaveAttribute('data-block-type', 'codeBlock');
    await expect(suggested(page).nth(1).locator('code')).toHaveText('const open = 1;');
    expect(await pageBlocks()).toEqual(before);
  });

  test('a suggested table stays a table, and the row being written stands under it as after a table', async ({ page }) => {
    // a host's head fill: the suggested table's head keeps it
    await page.locator('.gotipe-page-example-surface').evaluate((node) => {
      (node as HTMLElement).style.setProperty('--gt-table-head-fill', 'rgb(230, 230, 230)');
    });
    await show(page, { proposals: [part('p', '\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3')] });
    await expect(suggested(page)).toHaveCount(2);
    const cells = await suggested(page)
      .first()
      .locator('th, td')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return { tag: node.tagName, radius: style.borderTopLeftRadius, fill: style.backgroundColor, tint: style.backgroundImage };
        }),
      );
    expect(cells.map((cell) => cell.tag)).toEqual(['TH', 'TH', 'TD', 'TD']);
    for (const cell of cells) {
      expect(cell.radius).toBe('0px');
      expect(cell.tint).toContain('gradient');
    }
    expect(cells.filter((cell) => cell.tag === 'TH').map((cell) => cell.fill)).toEqual(['rgb(230, 230, 230)', 'rgb(230, 230, 230)']);
    expect(cells.filter((cell) => cell.tag === 'TD').map((cell) => cell.fill)).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
    // the row being written: the next block after the table, as far below it as a block after a table
    const tail = await page.evaluate(() => {
      const [table, row] = [
        ...document.querySelectorAll('[data-gotipe-phantom-id]:not([data-gotipe-phantom-id] [data-gotipe-phantom-id])'),
      ] as HTMLElement[];
      return {
        next: table!.nextElementSibling === row,
        gap: row!.getBoundingClientRect().top - table!.getBoundingClientRect().bottom,
        flow: Number.parseFloat(getComputedStyle(row!).getPropertyValue('--gt-flow-block')),
        text: row!.textContent,
      };
    });
    expect(tail.text).toBe('| 3');
    expect(tail.next).toBe(true);
    expect(tail.flow).toBeGreaterThan(0);
    expect(Math.abs(tail.gap - tail.flow)).toBeLessThan(0.5);
  });

  test('the end of the text is marked; a host gives it a caret through a token', async ({ page }) => {
    await show(page, { proposals: [part('p', '\n\n## Summary\n\nSome **bold** text')] });
    const end = page.locator('.gotipe-sug-live');
    await expect(end).toHaveCount(1);
    await expect(end).toHaveText(' text');
    const shadow = () =>
      end.evaluate((element) => {
        const value = getComputedStyle(element).boxShadow;
        const lengths = value.replace(/rgba?\([^)]*\)|color\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? [];
        return lengths.map((length) => Number.parseFloat(length));
      });
    // no caret unless a host asks for one: a shadow of no size
    expect((await shadow()).every((length) => length === 0)).toBe(true);
    const width = await end.evaluate((element) => element.getBoundingClientRect().width);
    await page.locator('.gotipe-page-example-surface').evaluate((node) => node.style.setProperty('--gt-sug-live-caret-width', '2px'));
    expect((await shadow())[0]).toBe(2);
    // the caret takes no room: the text does not move
    expect(await end.evaluate((element) => element.getBoundingClientRect().width)).toBe(width);
    // written: no mark
    await show(page, { proposals: [{ ...part('p', '\n\n## Summary\n\nSome **bold** text'), live: false }] });
    await expect(end).toHaveCount(0);
  });

  test('"Demo writing" writes two sections at one place and leaves them to accept', async ({ page }) => {
    await page.getByRole('button', { name: 'Demo writing' }).click();
    await expect(page.locator('.gotipe-lane-cursor')).toHaveCount(2);
    await expect(page.locator('.gotipe-lane-cursor .gotipe-lane-chip-name')).toHaveText(['Summary', 'Next steps']);
    await expect(page.locator('.gotipe-review-bar')).toContainText('2 suggestions', { timeout: 15000 });
    await expect(page.locator('.gotipe-lane-cursor')).toHaveCount(0);
    await expect(page.locator('.gotipe-sug-live')).toHaveCount(0);
    expect((await texts(page))[0]).toBe('Summary');
    await page.locator('.gotipe-review-bar').getByRole('button', { name: 'Accept all' }).click();
    await expect(suggested(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Markdown' }).click();
    const md = await page.locator('[data-gotipe-page-source]').innerText();
    expect(md.indexOf('## Summary')).toBeGreaterThan(md.indexOf('const message'));
    expect(md.indexOf('## Next steps')).toBeGreaterThan(md.indexOf('## Summary'));
    expect(md.indexOf('<details>')).toBeGreaterThan(md.indexOf('## Next steps'));
  });
});
