// The text-plates rule on frames written for it in the atlas's own styles: text that runs past its
// plate is found — the tooltip of D-98, a menu, a button, a keycap — and text that a plate holds,
// an ellipsis ends or a scroller hides is not. Needs Chromium; GOTIPE_E2E_CHANNEL=chrome runs it
// in an installed Chrome: node --test design/atlas/lib/*.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, test } from "node:test";
import { ROOT, STYLES, readPart } from "./assemble.mjs";
import { textOffPlates } from "./text-plates.mjs";

const { chromium } = createRequire(path.resolve(ROOT, "../../package.json"))("@playwright/test");
/** The atlas's styles and, for the tests only, plates, holders and scrollers of their own. */
const STYLE = `${STYLES.map(readPart).join("\n")}
.probe-w { width: 120px; }
.probe-key { width: 32px; white-space: nowrap; }
.probe-plate { display: inline-block; padding: 0 8px; background: rgb(0 0 0 / 0.1); font-size: 20px; white-space: nowrap; }
.probe-big { font-size: 40px; }
.probe-narrow { width: 40px; }
.probe-low { display: inline-flex; align-items: flex-end; height: 4px; }
.probe-ring { background: none; border: 1px solid rgb(0 0 0); }
.probe-side { background: none; border-bottom: 1px solid rgb(0 0 0); }
.probe-image { background: linear-gradient(rgb(0 0 0 / 0.1), rgb(0 0 0 / 0.1)); }
.probe-hidden { visibility: hidden; }
.probe-clear { opacity: 0; }
.probe-contents { display: contents; background: rgb(0 0 0 / 0.1); }
.probe-translate { translate: 0 0; }
.probe-filter { filter: opacity(1); }
.probe-will { will-change: transform; }
.probe-contain { contain: paint; }
.probe-fixed { position: fixed; top: 200px; left: 400px; transform: none; }
.gotipe-code-block { .probe-nested { display: block; margin: 0; white-space: pre; overflow-x: auto; } }
.probe-list { display: block; max-height: 240px; overflow: auto; }`;

let browser;
let page;
before(async () => {
  const channel = process.env.GOTIPE_E2E_CHANNEL;
  browser = await chromium.launch(channel ? { channel } : {});
  page = await browser.newPage({ viewport: { width: 1320, height: 900 }, deviceScaleFactor: 1 });
});
after(() => browser?.close());

/** What the rule finds in one light frame that holds the markup, after `prepare(arg)` in the page. */
async function audit(markup, { view = "modern", w = "768", prepare, arg } = {}) {
  await page.setContent(`<!doctype html>
<html lang="ru" data-theme="light"><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
<figure class="at-figure" id="f0"><section class="at-stage" data-w="${w}">
<div class="at-frame gotipe-root" data-gt-view="${view}" data-frame="probe" data-w="${w}" data-min="320">
${markup}
</div></section></figure></body></html>`);
  if (prepare) await page.evaluate(prepare, arg);
  return page.evaluate(textOffPlates, { theme: "light" });
}
const off = (plate, side) =>
  new RegExp(`leaves the background of <${plate.replace(".", "\\.")}> by [\\d.]+ px ${side}$`);

const TOOL = '<span class="gotipe-tool"><svg class="gt-icon"></svg></span>';
/** The fixed bar of frame 31 with a tool after eight others; the tool holds the tooltip. */
const bar = (tool, tooltip, track = "gotipe-toolbar-track is-open") =>
  `<div class="gotipe-modern"><div class="gotipe-toolbar gotipe-toolbar-fixed" role="toolbar">
<div class="${track}">${TOOL.repeat(8)}${tool.replace("</span>", `${tooltip}</span>`)}${TOOL.repeat(4)}</div>
</div></div>`;
const ALIGN =
  '<span class="gotipe-tool is-pick" aria-disabled="true"><svg class="gt-icon"></svg></span>';
const REASON = "Блок не выравнивается: выравниваются только абзацы и заголовки";
const SAID = `«${REASON.slice(0, 32)}»`;
const tip = (text, cls = "") =>
  `<span class="gotipe-tooltip${cls}" data-place="below">${text}</span>`;

test("D-98: a tooltip with nowrap and max-width lets a long reason run past its fill", async () => {
  const found = await audit(bar(ALIGN, tip(REASON)));
  assert.equal(found.length, 1, found.join("\n"));
  assert.ok(found[0].startsWith(`#f0/probe/light: ${SAID} leaves`), found[0]);
  assert.match(found[0], off("span.gotipe-tooltip", "to the right"));
});

test("a tooltip that wraps, or a reason that fits, stays on its fill", async () => {
  assert.deepEqual(await audit(bar(ALIGN, tip(REASON, " is-wrap"))), []);
  assert.deepEqual(await audit(bar(ALIGN, tip("Выравниваются абзацы и заголовки"))), []);
});

test("a tooltip out of the flow is measured on its own fill, not on the tool's", async () => {
  const active = '<span class="gotipe-tool is-active"><svg class="gt-icon"></svg></span>';
  assert.deepEqual(await audit(bar(active, tip('Жирный<span class="gotipe-key">⌘B</span>'))), []);
});

test("a toolbar track that scrolls only sideways cuts the tooltip below it", async () => {
  assert.deepEqual(await audit(bar(ALIGN, tip(REASON), "gotipe-toolbar-track")), [
    `#f0/probe/light: ${SAID} is cut vertically by <div.gotipe-toolbar-track>, which is not meant to scroll vertically`,
  ]);
});

test("an absolute tooltip escapes the clips up to the box that holds it", async () => {
  const card = (outer, inner) =>
    `<div class="${outer}"><div class="${inner}">Карточка${tip(REASON)}</div></div>`;
  const escaped = await audit(card("gotipe-anchor", "gotipe-card-title"));
  assert.equal(escaped.length, 1, escaped.join("\n"));
  assert.match(escaped[0], off("span.gotipe-tooltip", "to the right"));
  assert.deepEqual(await audit(card("gotipe-card-title", "gotipe-anchor")), []);
  for (const holder of ["probe-translate", "probe-filter", "probe-will", "probe-contain"]) {
    assert.deepEqual(await audit(card("gotipe-anchor", `gotipe-card-title ${holder}`)), [], holder);
  }
});

test("a fixed tooltip escapes every clip but one of a box that holds fixed boxes", async () => {
  const fixed = (clip) =>
    `<div class="${clip}"><span class="gotipe-anchor">Карточка<span class="gotipe-tooltip probe-fixed">${REASON}</span></span></div>`;
  const found = await audit(fixed("gotipe-card-title"));
  assert.equal(found.length, 1, found.join("\n"));
  assert.match(found[0], off("span.gotipe-tooltip", "to the right"));
  assert.deepEqual(await audit(fixed("gotipe-card-title probe-translate")), []);
});

const LABEL = "Основные блоки документа и встраиваемые элементы";
const GROUP = `<span class="gotipe-menu-group"><span class="gotipe-menu-label">${LABEL}</span><span class="gotipe-menu-item"><span class="gotipe-menu-text">Текст</span></span></span>`;
const menu = (inner) =>
  `<p class="gotipe-anchor"><span class="gotipe-overlay gotipe-menu" data-place="below">${inner}</span></p>`;

test("a menu of fixed width lets a long label run past its fill", async () => {
  const found = await audit(menu(GROUP));
  assert.equal(found.length, 1, found.join("\n"));
  assert.ok(found[0].includes(`«${LABEL.slice(0, 32)}» leaves`), found[0]);
  assert.match(found[0], off("span.gotipe-overlay", "to the right"));
});

test("a menu list that scrolls only up and down cuts a long label sideways", async () => {
  assert.deepEqual(await audit(menu(`<span class="gotipe-menu-scroll">${GROUP}</span>`)), [
    `#f0/probe/light: «${LABEL.slice(0, 32)}» is cut sideways by <span.gotipe-menu-scroll>, which is not meant to scroll sideways`,
  ]);
});

test("scroll axes come from the rules: nested ones, and `overflow` names both", async () => {
  const line = "const pending = journal.pending(); ".repeat(8);
  const code = `<div class="gotipe-code-block"><pre class="probe-nested"><code>${line}</code></pre></div>`;
  assert.deepEqual(await audit(`<article class="gotipe-page">${code}</article>`), []);
  const items = '<span class="gotipe-menu-item"><span class="gotipe-menu-text">Пункт</span></span>';
  const list = `<span class="probe-list">${GROUP}${items.repeat(16)}</span>`;
  assert.deepEqual(await audit(menu(list)), []);
});

test("an ellipsis ends a long item, a sideways scroller hides a long line", async () => {
  const item = `<span class="gotipe-menu-item"><span class="gotipe-menu-text">${LABEL}, ${LABEL}</span></span>`;
  assert.deepEqual(await audit(menu(`<span class="gotipe-menu-group">${item}</span>`)), []);
  const list = `<span class="gotipe-menu-scroll"><span class="gotipe-menu-group">${item}</span></span>`;
  assert.deepEqual(await audit(menu(list)), []);
  const line = "const pending = journal.pending(); ".repeat(8);
  const code = `<div class="gotipe-code-block"><pre class="gotipe-code-block-scroll"><code>${line}</code></pre></div>`;
  assert.deepEqual(
    await audit(`<article class="gotipe-page"><div class="gotipe-doc">${code}</div></article>`),
    [],
  );
});

test("a button with a fill and a keycap with a ring hold their text, or report it", async () => {
  const button = await audit(
    '<p><span class="gotipe-button probe-w">Сохранить изменения в документе</span></p>',
  );
  assert.equal(button.length, 1, button.join("\n"));
  assert.match(button[0], off("span.gotipe-button", "to the (?:left|right)"));
  const key = await audit('<p><span class="gotipe-kbd probe-key">Ctrl+Shift+Alt+K</span></p>');
  assert.equal(key.length, 1, key.join("\n"));
  assert.match(key[0], off("span.gotipe-kbd", "to the right"));
  assert.deepEqual(
    await audit(
      '<p><span class="gotipe-button">Сохранить</span> <span class="gotipe-kbd">⌘S</span></p>',
    ),
    [],
  );
});

test("a plate is a fill, an image, a border all round or a shadow, and it must be seen", async () => {
  const plate = (cls) =>
    `<p><span class="probe-plate probe-narrow ${cls}">Сохранить изменения</span></p>`;
  for (const [cls, found] of [
    ["", 1],
    ["probe-ring", 1],
    ["probe-image", 1],
    ["probe-side", 0],
    ["probe-hidden", 0],
    ["probe-clear", 0],
  ]) {
    assert.equal((await audit(plate(cls))).length, found, cls || "fill");
  }
  assert.deepEqual(await audit('<p><span class="probe-contents">Сохранить</span></p>'), []);
  const wrapped = (cls) =>
    `<p><span class="probe-plate probe-narrow"><span class="probe-contents ${cls}">Сохранить изменения</span></span></p>`;
  assert.equal((await audit(wrapped(""))).length, 1, "text in display: contents");
  assert.deepEqual(await audit(wrapped("probe-hidden")), []);
});

test("text that leaves nested plates is told once, on the innermost", async () => {
  const nested =
    '<p><span class="probe-plate"><span class="probe-plate probe-narrow">Сохранить изменения</span></span></p>';
  const found = await audit(nested);
  assert.equal(found.length, 1, found.join("\n"));
  assert.match(found[0], off("span.probe-plate", "to the right"));
});

test("a line is measured on every side", async () => {
  const rtl = await audit(
    '<p dir="rtl"><span class="probe-plate probe-narrow">Сохранить изменения</span></p>',
  );
  assert.match(rtl[0] ?? "", off("span.probe-plate", "to the left"));
  const low = await audit('<p><span class="probe-plate probe-low">Сохранить</span></p>');
  assert.match(low[0] ?? "", off("span.probe-plate", "upwards"));
});

/** Sets the width of the plate to its padding and text, plus `spare` px (negative: less). */
function fit(spare) {
  const plate = document.querySelector(".probe-plate");
  const range = document.createRange();
  range.selectNodeContents(plate.firstChild);
  const zoom = plate.currentCSSZoom;
  const text = range.getBoundingClientRect().width / zoom;
  const before = Number.parseFloat(getComputedStyle(plate).paddingLeft);
  Object.assign(plate.style, { boxSizing: "border-box", width: `${before + text + spare}px` });
}

test("sideways a line keeps to the half pixel", async () => {
  const key = '<p><span class="probe-plate">Ctrl+Shift+K</span></p>';
  assert.deepEqual(await audit(key, { prepare: fit, arg: 0 }), []);
  assert.deepEqual(await audit(key, { prepare: fit, arg: -0.4 }), []);
  const found = await audit(key, { prepare: fit, arg: -2 });
  assert.match(found[0] ?? "", /by 2 px to the right$/);
});

/** Sets the line of the plate so that its text passes it up and down by `share` of its font size. */
function squeeze(share) {
  const plate = document.querySelector(".probe-plate");
  const range = document.createRange();
  range.selectNodeContents(plate.firstChild);
  const zoom = plate.currentCSSZoom;
  const area = range.getBoundingClientRect().height / zoom;
  const line = area - 2 * share * Number.parseFloat(getComputedStyle(plate).fontSize);
  Object.assign(plate.style, {
    height: `${line}px`,
    lineHeight: `${line}px`,
    verticalAlign: "top",
  });
}

test("up and down a line may pass a plate by a quarter of its font size, zoomed or not", async () => {
  const plate = '<p><span class="probe-plate probe-big">Сохранить</span></p>';
  for (const w of ["768", "1440"]) {
    assert.deepEqual(await audit(plate, { w, prepare: squeeze, arg: 0.22 }), [], w);
    const found = await audit(plate, { w, prepare: squeeze, arg: 0.28 });
    assert.match(found[0] ?? "", off("span.probe-plate", "(?:upwards|downwards)"), w);
  }
});

test("a line's box may pass a plate by a quarter of its font size, its letters may not (D-108)", async () => {
  const line = (atom) =>
    `<article class="gotipe-page"><div class="gotipe-doc"><p>ниже ${atom}, где</p></div></article>`;
  const hover = '<span class="gotipe-math-inline is-hover">10<sup>−3</sup></span>';
  assert.deepEqual(await audit(line(hover), { view: "notion" }), []);
  const fraction = await audit(
    line(
      '<span class="gotipe-math-inline is-selected"><i>p</i><span class="gotipe-mo">=</span><span class="gotipe-frac"><span><i>L</i></span><span><i>N</i></span></span></span>',
    ),
    { view: "notion" },
  );
  assert.ok(
    fraction.some((problem) => /^#f0\/probe\/light: «N» leaves/.test(problem)),
    fraction.join("\n"),
  );
  assert.ok(fraction.every((problem) => off("span.gotipe-math-inline", "\\w+").test(problem)));
});
