/**
 * One configuration of the visual audit: an editor of the playground in a view, a theme and a
 * width. The pointer rests on every block of the audit document; the handle, the table's own
 * handles, the bubble, «/» and the block menu are measured where they stand.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import {
  AUDIT_DOCUMENT,
  AUDIT_MARKDOWN,
  type AuditTarget,
  type Mode,
  targetsFor,
} from "./document";
import { type Box, type HandleProbe, type LayoutProbe, installProbe } from "./probe";

export type View = "notion" | "docs" | "modern" | "minimal";
export type Theme = "light" | "dark";
export interface Configuration {
  mode: Mode;
  view: View;
  theme: Theme;
  width: number;
}
export interface Violation {
  check: string;
  target: string;
  detail: string;
  shot?: string;
}
export interface AuditResult {
  configuration: Configuration;
  cases: number;
  violations: Violation[];
}

/** Phones are as tall as the Atlas draws them; the rest as common screens. */
const HEIGHTS: Record<number, number> = { 320: 640, 375: 720, 768: 1024, 1024: 768, 1440: 900 };
/** Where the handle's centre may be off its line: rounding of line boxes and fonts. */
const LINE_TOLERANCE = 2.5;
const EDGE = 0.5;
const OUTPUT = resolve(__dirname, "../../../output/editor-visual-audit");
/** Views with the block handle (Atlas: modern and minimal draw none). */
const HANDLED: View[] = ["notion", "docs"];

/** Where each mode lives in the playground and how it takes a view. */
const SETUP: Record<Mode, { url: string; pick: (page: Page, view: View) => Promise<unknown> }> = {
  page: {
    url: "/?view=page#basic",
    pick: (page, view) => page.selectOption('select[aria-label="Вид страницы"]', view),
  },
  block: {
    url: "/?view=block#basic",
    pick: (page, view) => page.selectOption('select[aria-label="Вид редактора"]', view),
  },
  views: {
    url: "/#views",
    pick: (page, view) => page.getByRole("button", { name: view, exact: true }).click(),
  },
};
/** The playground's development handles (apps/playground/src/shared/use-debug-editor.ts). */
type Handles = Record<string, { setContent(content: unknown): void } | undefined> & {
  __GOTIPE_PAGE_EXAMPLE__?: { setMarkdown(markdown: string): void };
};

const within = (inner: Box, outer: Box) =>
  inner.left >= outer.left - EDGE &&
  inner.right <= outer.right + EDGE &&
  inner.top >= outer.top - EDGE &&
  inner.bottom <= outer.bottom + EDGE;
const across = (inner: Box, outer: Box) =>
  inner.left >= outer.left - EDGE && inner.right <= outer.right + EDGE;
const union = (boxes: Box[]): Box => ({
  left: Math.min(...boxes.map((b) => b.left)),
  top: Math.min(...boxes.map((b) => b.top)),
  right: Math.max(...boxes.map((b) => b.right)),
  bottom: Math.max(...boxes.map((b) => b.bottom)),
});
const round = (box: Box) =>
  `${Math.round(box.left)}–${Math.round(box.right)} × ${Math.round(box.top)}–${Math.round(box.bottom)}`;
const frames = (page: Page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

async function open(page: Page, { mode, view, theme, width }: Configuration) {
  await page.route(/^https?:\/\/(?!localhost[:/])/, (route) => route.abort());
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 });
  await page.goto(SETUP[mode].url);
  await page.locator("[data-gotipe-content]").first().waitFor();
  await SETUP[mode].pick(page, view);
  // the Views example also draws the counter under the document (Atlas frame 26)
  if (mode === "views") await page.getByRole("button", { name: "words", exact: true }).click();
  // PageEditor reads Markdown; BlockEditor takes the document as JSON
  const key =
    mode === "page"
      ? "__GOTIPE_PAGE_EXAMPLE__"
      : mode === "views"
        ? "__GOTIPE_VIEWS_EDITOR__"
        : "__GOTIPE_EDITOR__";
  await page.waitForFunction((name) => Boolean((window as unknown as Handles)[name]), key);
  await page.evaluate(
    ({ name, markdown, content }) => {
      const handles = window as unknown as Handles;
      if (markdown) handles.__GOTIPE_PAGE_EXAMPLE__?.setMarkdown(markdown);
      else handles[name]?.setContent(content);
    },
    { name: key, markdown: mode === "page" ? AUDIT_MARKDOWN : "", content: AUDIT_DOCUMENT },
  );
  await page.getByText("Cut the release note").first().waitFor();
  await page.locator(`[data-gt-view="${view}"] [data-gotipe-content]`).first().waitFor();
  await page.evaluate(installProbe);
  await frames(page);
}

/** Records violations; the first of each kind and block gets a snapshot with the boxes drawn. */
class Recorder {
  readonly violations: Violation[] = [];
  cases = 0;
  constructor(
    private readonly page: Page,
    private readonly folder: string,
  ) {}

  async add(
    check: string,
    target: string,
    detail: string,
    boxes: { box: Box; color: string; label?: string }[] = [],
  ) {
    const shot = `${String(this.violations.length + 1).padStart(2, "0")}-${check}-${target}.png`;
    this.violations.push({ check, target, detail, shot });
    await this.page.evaluate((marks) => window.__visualAudit?.draw(marks), boxes);
    await mkdir(this.folder, { recursive: true });
    await this.page.screenshot({ path: resolve(this.folder, shot) });
    await this.page.evaluate(() => window.__visualAudit?.erase());
  }
}

async function hoverTarget(
  page: Page,
  target: AuditTarget,
  handled: boolean,
  align: "center" | "end" = "center",
) {
  // scroll first, then aim: the point is taken where the block stands after the scroll
  const aim = () =>
    page.evaluate(({ t, a }) => window.__visualAudit?.prepare(t, a) ?? null, {
      t: target,
      a: align,
    });
  if (!(await aim())) return null;
  await frames(page);
  const point = await aim();
  await page.mouse.move(point!.x, point!.y, { steps: 2 });
  await frames(page);
  const measure = () => page.evaluate((t) => window.__visualAudit!.handle(t), target);
  let probe = await measure();
  // the handle follows the pointer through React state: wait until it stands still
  for (let i = 0; i < 10; i++) {
    await frames(page);
    const next = await measure();
    const settled =
      JSON.stringify(next.buttons) === JSON.stringify(probe.buttons) &&
      (!handled || (next.visible && next.drag === next.unit));
    probe = next;
    if (settled) break;
  }
  return probe;
}

async function checkHandle(rec: Recorder, view: View, target: AuditTarget, probe: HandleProbe) {
  const handled = HANDLED.includes(view);
  const red = (box: Box, label?: string) => ({ box, color: "#e5484d", label });
  const handle = probe.buttons.length ? union(probe.buttons) : null;
  if (!handled) {
    if (probe.visible)
      await rec.add("handle-shown", target.name, `${view} draws no handle`, [red(handle!)]);
    return;
  }
  if (!probe.visible || !handle) {
    await rec.add("handle-missing", target.name, "no handle under the pointer", [
      { box: probe.block, color: "#0b6bcb" },
    ]);
    return;
  }
  const marks = [red(handle, "handle")];
  if (probe.drag !== probe.unit)
    await rec.add("handle-target", target.name, `moves ${probe.drag}, not ${probe.unit}`, marks);
  if (probe.hits.length)
    await rec.add(
      "handle-covers",
      target.name,
      probe.hits
        .map((hit) => `${hit.kind}${hit.text ? ` «${hit.text}»` : ""} ${round(hit.box)}`)
        .join("; "),
      [...marks, ...probe.hits.map((hit) => ({ box: hit.box, color: "#0b6bcb" }))],
    );
  if (!across(handle, probe.editor))
    await rec.add(
      "handle-outside-editor",
      target.name,
      `${round(handle)} beyond ${round(probe.editor)}`,
      [...marks, { box: probe.editor, color: "#0b6bcb" }],
    );
  if (!within(handle, probe.area))
    await rec.add(
      "handle-clipped",
      target.name,
      `${round(handle)} beyond ${round(probe.area)}`,
      marks,
    );
  const centre = (handle.top + handle.bottom) / 2;
  const expected = probe.line
    ? (probe.line.top + probe.line.bottom) / 2
    : probe.block.top +
      Math.min(probe.block.bottom - probe.block.top, handle.bottom - handle.top) / 2;
  if (Math.abs(centre - expected) > LINE_TOLERANCE)
    await rec.add(
      "handle-off-line",
      target.name,
      `centre ${centre.toFixed(1)}, line ${expected.toFixed(1)}`,
      [...marks, ...(probe.line ? [{ box: probe.line, color: "#0b6bcb" }] : [])],
    );
}

async function checkControls(rec: Recorder, page: Page, target: AuditTarget) {
  if (target.type !== "tableCell" && target.type !== "tableHeader") return;
  for (const control of await page.evaluate((t) => window.__visualAudit!.controls(t), target)) {
    const name = `${target.name} ${control.name}`;
    if (!control.visible || !control.box) {
      await rec.add("table-control-missing", name, "not shown under the pointer");
      continue;
    }
    const marks = [{ box: control.box, color: "#e5484d", label: control.name }];
    if (control.hits.length)
      await rec.add(
        "table-control-covers",
        name,
        control.hits.map((h) => round(h.box)).join("; "),
        [...marks, ...control.hits.map((hit) => ({ box: hit.box, color: "#0b6bcb" }))],
      );
    if (!across(control.box, control.room))
      await rec.add(
        "table-control-room",
        name,
        `${round(control.box)} beyond its room ${round(control.room)}`,
        marks,
      );
    if (!within(control.box, control.area))
      await rec.add(
        "table-control-clipped",
        name,
        `${round(control.box)} beyond ${round(control.area)}`,
        marks,
      );
  }
}

/** What sticks out of its place, measured after `reveal` brought it to the middle of the screen. */
async function layoutAt(page: Page, selector?: string, index = 0) {
  if (selector !== undefined) {
    await page.evaluate(({ s, i }) => window.__visualAudit!.reveal(s, i), {
      s: selector,
      i: index,
    });
    await frames(page);
  }
  return page.evaluate(() => window.__visualAudit!.layout());
}

async function checkLayout(rec: Recorder, page: Page, when: string) {
  rec.cases++;
  let layout = await layoutAt(page);
  for (const scroller of layout.scrollers)
    await rec.add(
      "horizontal-scroll",
      when,
      `${scroller.name}: ${scroller.scrollWidth} > ${scroller.clientWidth}`,
    );
  if (layout.overflow.length) {
    layout = await layoutAt(page, "");
    await rec.add(
      "editor-overflow",
      when,
      layout.overflow.map((item) => `${item.name} ${round(item.box)}`).join("; "),
      layout.overflow.map((item) => ({ box: item.box, color: "#e5484d" })),
    );
  }
  for (const item of layout.misaligned)
    await rec.add(
      "column-alignment",
      when,
      `${item.name} starts at ${item.left.toFixed(1)}, the text column at ${item.column.toFixed(1)}`,
    );
  for (let index = 0; index < layout.columns.length; index++) {
    rec.cases++;
    const faults = (columns: LayoutProbe["columns"][number]) => {
      const boxes = columns.columns.map((column) => column.box);
      const crossing = boxes.some((a, i) =>
        boxes.some(
          (b, j) =>
            j > i &&
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > EDGE &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > EDGE,
        ),
      );
      const outside = boxes.filter((box) => !across(box, columns.box));
      const spilled = columns.columns.flatMap((column) =>
        column.text.filter((t) => !across(t, column.box)),
      );
      return { boxes, crossing, outside, spilled };
    };
    if (!layout.columns[index]) continue;
    const { crossing, outside, spilled } = faults(layout.columns[index]);
    if (!crossing && !outside.length && !spilled.length) continue;
    const shown = (await layoutAt(page, ".gotipe-columns", index)).columns[index];
    const marks = shown ? faults(shown) : { boxes: [], spilled: [] };
    await rec.add(
      "columns-margins",
      when,
      `columns outside ${outside.length}, crossing ${crossing}, text out of its column ${spilled.length}`,
      [
        ...marks.boxes.map((box) => ({ box, color: "#e5484d" })),
        ...marks.spilled.map((box) => ({ box, color: "#0b6bcb" })),
      ],
    );
  }
}

async function checkMenu(
  rec: Recorder,
  page: Page,
  selector: string,
  check: string,
  target: string,
) {
  rec.cases++;
  const menu = await page
    .waitForFunction((s) => window.__visualAudit!.menu(s), selector, { timeout: 2000 })
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  if (!menu) return rec.add(`${check}-missing`, target, `${selector} did not open`);
  const viewport = page.viewportSize()!;
  const screen = { left: 0, top: 0, right: viewport.width, bottom: viewport.height };
  if (!within(menu, screen))
    await rec.add(`${check}-offscreen`, target, `${round(menu)} beyond ${round(screen)}`, [
      { box: menu, color: "#e5484d" },
    ]);
}

const PARAGRAPH: AuditTarget = { name: "paragraph", type: "paragraph", text: "Абзац:" };
const LAST: AuditTarget = { name: "last", type: "paragraph", text: "Последний абзац" };
const TOOLBAR = ".gotipe-block-toolbar .gotipe-block-toolbar-control > button";

async function checkMenus(rec: Recorder, page: Page, view: View) {
  // the bubble over a word at the start and at the end of a line
  for (const end of [false, true]) {
    const point = await page.evaluate(({ t, e }) => window.__visualAudit!.textPoint(t, e), {
      t: PARAGRAPH,
      e: end,
    });
    if (!point) continue;
    await page.mouse.dblclick(point.x, point.y);
    await checkMenu(
      rec,
      page,
      "[data-gotipe-bubble-menu]",
      "bubble",
      end ? "line-end" : "line-start",
    );
    await page.keyboard.press("Escape");
    await page.mouse.click(1, 1);
  }
  if (HANDLED.includes(view)) {
    // the handle's tooltips, the block menu and «Turn into» beside it
    if ((await hoverTarget(page, PARAGRAPH, true))?.visible) {
      await page.locator(TOOLBAR).first().hover();
      await checkMenu(rec, page, '[data-gotipe-toolbar-tooltip="add"]', "tooltip", "add");
      await page.locator(TOOLBAR).nth(1).hover();
      await checkMenu(rec, page, '[data-gotipe-toolbar-tooltip="drag"]', "tooltip", "grip");
      await page.locator(TOOLBAR).nth(1).click();
      await checkMenu(rec, page, "[data-gotipe-context-menu]", "block-menu", "paragraph");
      await page.locator(".gotipe-context-item-has-submenu").first().hover();
      await checkMenu(rec, page, ".gotipe-context-submenu", "turn-into", "paragraph");
      await page.keyboard.press("Escape");
      await page.mouse.move(1, 1);
    }
    // the block menu of a block at the bottom of the screen
    if ((await hoverTarget(page, LAST, true, "end"))?.visible) {
      await page.locator(TOOLBAR).nth(1).click();
      await checkMenu(rec, page, "[data-gotipe-context-menu]", "block-menu", "bottom");
      await page.keyboard.press("Escape");
      await page.mouse.move(1, 1);
    }
    // «+» at the bottom of the screen: a new block below with «/» open
    if ((await hoverTarget(page, LAST, true, "end"))?.visible) {
      await page.locator(TOOLBAR).first().click();
      await checkMenu(rec, page, "[data-gotipe-slash-menu]", "slash", "add-bottom");
      await page.keyboard.press("Escape");
      await page.mouse.move(1, 1);
    }
  }
  // «/» typed in a new paragraph at the bottom of the screen
  const end = await page.evaluate((t) => window.__visualAudit!.textPoint(t, true), LAST);
  if (end) {
    await page.mouse.click(end.x + 3, end.y);
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.evaluate(() =>
      document.getSelection()?.focusNode?.parentElement?.scrollIntoView({ block: "end" }),
    );
    await page.keyboard.type("/");
    await checkMenu(rec, page, "[data-gotipe-slash-menu]", "slash", "bottom");
    await page.keyboard.press("Escape");
  }
}

export async function auditConfiguration(page: Page, configuration: Configuration, info: TestInfo) {
  const { mode, view, theme, width } = configuration;
  const name = `${mode}-${view}-${theme}-${width}`;
  const rec = new Recorder(page, resolve(OUTPUT, info.project.name, name));
  await open(page, configuration);
  await checkLayout(rec, page, "document");
  for (const target of targetsFor(mode)) {
    rec.cases++;
    const probe = await hoverTarget(page, target, HANDLED.includes(view));
    if (!probe?.found) throw new Error(`${name}: the audit document has no ${target.name}`);
    await checkHandle(rec, view, target, probe);
    await checkControls(rec, page, target);
  }
  await page.mouse.move(1, 1);
  await checkMenus(rec, page, view);
  await checkLayout(rec, page, "menus");
  const result: AuditResult = { configuration, cases: rec.cases, violations: rec.violations };
  await mkdir(resolve(OUTPUT, info.project.name), { recursive: true });
  await writeFile(
    resolve(OUTPUT, info.project.name, `${name}.json`),
    JSON.stringify(result, null, 2),
  );
  return result;
}
