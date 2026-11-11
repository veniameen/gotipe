// Browser audit of the built atlas, once in each theme of the page's switch: it loads without
// errors or network; every figure of the index has frames; nothing leaves its frame or clips;
// blocks do not overlap and the block handle does not cover text; text keeps its contrast on the
// background it really sits on.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** [selector, least contrast, pseudo-element] — measured wherever the selector is present. */
const CONTRAST = [
  [".gotipe-page-title:not(.is-empty)", 7],
  [".gotipe-doc > p:not(.is-empty)", 7],
  [".gotipe-page-byline", 4.5],
  [".gotipe-figure > figcaption", 4.5],
  [".gotipe-table th", 4.5],
  ['.gotipe-todo-item[data-checked="true"] .gotipe-todo-item-content', 3],
  [".gotipe-code-block-scroll", 7],
  [".gotipe-code-block .tk-com", 3],
  [".gotipe-callout-content", 7],
  [".gotipe-outline a", 4.5],
  [".gotipe-menu-item:not([aria-disabled]) > .gotipe-menu-text", 7],
  [".gotipe-menu-item > .gotipe-key", 3],
  [".gotipe-menu-label", 3],
  [".gotipe-tool:not([aria-disabled])", 4.5],
  [".gotipe-tooltip", 7],
  [".gotipe-toast", 7],
  [".gotipe-button.is-primary", 7],
  [".gotipe-comment-body", 7],
  [".gotipe-comment-time", 3],
  [".gotipe-remote-flag", 4.5],
  [".gotipe-review-fact", 4.5],
  [".gotipe-version-meta", 3],
  [".gotipe-ghost", 3],
  [".gotipe-doc .is-empty", 3, "::after"],
  [".gotipe-page-title.is-empty", 3, "::after"],
];

/* Runs inside the page; self-contained because Playwright serialises it. */
function auditPage({ roles, theme }) {
  const problems = [];
  const frames = [];
  const describe = (el) => {
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28);
    const cls = typeof el.className === "string" && el.classList[0] ? `.${el.classList[0]}` : "";
    return `<${el.tagName.toLowerCase()}${cls}> «${text}»`;
  };
  const parse = (value) => {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return { r: 0, g: 0, b: 0, a: 0 };
    const [r, g, b, a = 1] = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r, g, b, a };
  };
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  const luminance = ({ r, g, b }) => {
    const f = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** The colour behind an element: its own and its ancestors' backgrounds down to an opaque one. */
  const backdrop = (el, frame) => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg.a > 0) layers.push(bg);
      if (bg.a === 1 || node === frame) break;
    }
    return layers
      .reverse()
      .reduce((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 });
  };
  const scrolls = (el, frame) => {
    for (let node = el.parentElement; node && node !== frame; node = node.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(node).overflowX)) return true;
    }
    return false;
  };
  const intersects = (a, b) =>
    a.left < b.right - 0.5 &&
    b.left < a.right - 0.5 &&
    a.top < b.bottom - 0.5 &&
    b.top < a.bottom - 0.5;

  const index = [...document.querySelectorAll('.at-index a[href^="#"]')].map((a) =>
    a.getAttribute("href").slice(1),
  );
  const figures = [...document.querySelectorAll("figure.at-figure")];
  for (const id of index) {
    if (!document.getElementById(id)?.matches("figure.at-figure"))
      problems.push(`index #${id} leads nowhere`);
  }
  for (const figure of figures) {
    if (!index.includes(figure.id)) problems.push(`figure #${figure.id} is not in the index`);
    if (!figure.querySelector(".at-stage > .at-frame")) problems.push(`#${figure.id}: no frames`);
  }

  for (const stage of document.querySelectorAll(".at-stage")) {
    const frame = stage.querySelector(".at-frame");
    const name = `#${stage.closest("figure")?.id}/${frame?.dataset.frame}/${theme}`;
    if (!frame) {
      problems.push(`${name}: a stage without a frame`);
      continue;
    }
    const box = frame.getBoundingClientRect();
    const cut = frame.hasAttribute("data-h");
    const background = parse(getComputedStyle(frame).backgroundColor);
    const contrast = {};
    frames.push({
      name,
      theme,
      width: Math.round(box.width),
      height: Math.round(box.height),
      contrast,
    });
    if (box.height < 120) problems.push(`${name}: the frame is empty`);
    if ((theme === "dark") !== luminance(background) < 0.2) {
      problems.push(`${name}: background is not ${theme}`);
    }

    for (const el of frame.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const inScroller = scrolls(el, frame);
      if (!inScroller && (r.left < box.left - 0.5 || r.right > box.right + 0.5)) {
        problems.push(`${name}: ${describe(el)} leaves the frame sideways`);
      }
      if (!cut && !inScroller && (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5)) {
        problems.push(`${name}: ${describe(el)} leaves the frame vertically`);
      }
      const s = getComputedStyle(el);
      const clips = /hidden|clip/.test(s.overflowX) && s.textOverflow !== "ellipsis";
      if (clips && el.scrollWidth > el.clientWidth + 1 && el.tagName !== "svg") {
        problems.push(`${name}: ${describe(el)} clips its content`);
      }
    }

    for (const doc of frame.querySelectorAll(".gotipe-doc, .gotipe-page")) {
      const blocks = [...doc.children].filter((b) => getComputedStyle(b).position !== "absolute");
      for (let i = 1; i < blocks.length; i++) {
        const a = blocks[i - 1].getBoundingClientRect();
        const b = blocks[i].getBoundingClientRect();
        if (b.top < a.bottom - 0.5)
          problems.push(`${name}: ${describe(blocks[i])} overlaps ${describe(blocks[i - 1])}`);
      }
    }

    const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
    const lines = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) lines.push({ node, rect });
    }
    for (const handle of frame.querySelectorAll(".gotipe-block-handle")) {
      const h = handle.getBoundingClientRect();
      if (!h.width) continue;
      for (const { node, rect } of lines) {
        if (!handle.contains(node) && intersects(h, rect)) {
          problems.push(
            `${name}: the block handle covers «${node.textContent.trim().slice(0, 24)}»`,
          );
        }
      }
    }

    for (const [selector, least, pseudo] of roles) {
      const el = frame.querySelector(selector);
      if (!el || !el.getBoundingClientRect().width) continue;
      const base = backdrop(el, frame);
      const value = ratio(over(parse(getComputedStyle(el, pseudo).color), base), base);
      contrast[selector] = Math.round(value * 10) / 10;
      if (value < least)
        problems.push(`${name}: ${selector} contrast ${value.toFixed(2)} < ${least}`);
    }
  }
  return { problems, frames };
}

export async function browserAudit({ file, shotsDir, chromium }) {
  // GOTIPE_E2E_CHANNEL (e.g. "chrome") runs the audit in an installed browser, as the e2e do.
  const channel = process.env.GOTIPE_E2E_CHANNEL;
  const browser = await chromium.launch(channel ? { channel } : {});
  const page = await browser.newPage({
    viewport: { width: 1320, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const problems = [];
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("request", (request) => {
    const url = request.url();
    if (!/^(?:file|data):/.test(url)) problems.push(`network request: ${url}`);
  });
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  if (shotsDir) mkdirSync(shotsDir, { recursive: true });

  const frames = [];
  const shots = [];
  for (const theme of ["light", "dark"]) {
    await page.locator(`.at-seg > button[data-theme-choice="${theme}"]`).click();
    const chosen = await page.evaluate(() => document.documentElement.dataset.theme);
    if (chosen !== theme) problems.push(`the theme switch did not choose ${theme}`);
    const audit = await page.evaluate(auditPage, { roles: CONTRAST, theme });
    problems.push(...audit.problems);
    frames.push(...audit.frames);
    if (!shotsDir) continue;
    const stages = page.locator(".at-stage");
    const count = await stages.count();
    for (let i = 0; i < count; i++) {
      const stage = stages.nth(i);
      const frame = stage.locator(".at-frame");
      const figure = await stage.evaluate((s) => s.closest("figure")?.id ?? "figure");
      const name = `${figure}-${await frame.getAttribute("data-frame")}-${theme}.png`;
      await frame.screenshot({
        path: path.join(shotsDir, name),
        animations: "disabled",
        caret: "hide",
      });
      shots.push(name);
    }
  }
  await browser.close();
  return { problems, frames, shots, roles: CONTRAST.map(([selector]) => selector) };
}
