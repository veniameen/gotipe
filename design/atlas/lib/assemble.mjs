// Assembles the atlas from its parts: one HTML file with every style and glyph inline, no
// network and no app bundler. Pure: the same parts always give the same bytes.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandFrames } from "./frames.mjs";
import { typeset } from "./typography.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SRC = path.join(ROOT, "src");
export const OUTPUT = path.join(ROOT, "atlas.html");

/** Order matters: tokens, the atlas page, the document, views, editor UI, then pictures. */
export const STYLES = [
  "tokens.css",
  "tokens-views.css",
  "tokens-ui.css",
  "tokens-site.css",
  "atlas.css",
  "document.css",
  "blocks.css",
  "views/notion.css",
  "views/docs.css",
  "views/modern.css",
  "views/minimal.css",
  "ui/overlay.css",
  "ui/menus.css",
  "ui/toolbar.css",
  "ui/popovers.css",
  "ui/collab.css",
  "ui/review.css",
  "ui/states.css",
  "ui/atoms.css",
  "ui/find.css",
  "ui/layout.css",
  "ui/history.css",
  "site/landing.css",
  "site/landing-hero.css",
  "site/landing-window.css",
  "site/landing-sections.css",
  "site/landing-closing.css",
  "site/docs.css",
  "content/diagram.css",
];

const INCLUDE = /<!--\s*@include\s+([\w./-]+)\s*-->/g;

export function readPart(name) {
  return readFileSync(path.join(SRC, name), "utf8");
}

/** Figures in the order of their numbers: figures/NN-name.html. */
export function figureNames() {
  return readdirSync(path.join(SRC, "figures"))
    .filter((name) => /^\d+-[\w-]+\.html$/.test(name))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
    .map((name) => `figures/${name}`);
}

function expand(name, chain = []) {
  if (chain.includes(name)) throw new Error(`include cycle: ${[...chain, name].join(" → ")}`);
  return readPart(name).replace(INCLUDE, (_, inner) => expand(inner, [...chain, name]).trim());
}

function slot(html, marker, value) {
  if (!html.includes(marker)) throw new Error(`shell.html has no ${marker}`);
  return html.replace(marker, () => value);
}

/** The index: figures grouped by data-section, in the order the sections first appear. */
function indexOf(figures) {
  const sections = new Map();
  for (const html of figures) {
    const head = /<figure\b[^>]*\bid="(f\d+)"[^>]*\bdata-section="([^"]+)"/.exec(html);
    const title = /<h2 class="at-figure-title">([\s\S]*?)<\/h2>/.exec(html);
    if (!head || !title)
      throw new Error(`a figure without id, data-section or title:\n${html.slice(0, 200)}`);
    const [, id, section] = head;
    if (!sections.has(section)) sections.set(section, []);
    sections
      .get(section)
      .push(`<a href="#${id}"><span class="at-num">${id.slice(1)}</span>${title[1].trim()}</a>`);
  }
  return [...sections]
    .map(
      ([section, links]) => `<div class="at-index-group"><p>${section}</p>${links.join("")}</div>`,
    )
    .join("\n");
}

/** Figures with a section heading before the first figure of every section. */
function body(figures) {
  let current = null;
  return figures
    .map((html) => {
      const section = /\bdata-section="([^"]+)"/.exec(html)?.[1];
      const heading = section !== current ? `<h2 class="at-section">${section}</h2>\n` : "";
      current = section;
      return heading + html;
    })
    .join("\n");
}

export function assemble() {
  const css = STYLES.map((name) => `/* ${name} */\n${readPart(name).trim()}`).join("\n\n");
  const figures = figureNames().map((name) => typeset(expandFrames(expand(name), name)).trim());
  let html = expand("shell.html");
  html = slot(html, "<!-- @styles -->", `<style>\n${css}\n</style>`);
  html = slot(html, "<!-- @script -->", `<script>\n${readPart("atlas.js").trim()}\n</script>`);
  html = slot(html, "<!-- @icons -->", readPart("icons.svg").trim());
  html = slot(html, "<!-- @index -->", indexOf(figures));
  html = slot(html, "<!-- @figures -->", body(figures));
  return `${html.trim()}\n`;
}
