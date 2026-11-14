// Where the documentation lives on disk: the docs-site folder, nav.json and the page files.
// Node only (the site's build, scripts/docs-markdown.mjs and `pnpm check:docs-site`).

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * @typedef {{ title: string, pages: string[] }} NavSection
 * @typedef {{ sections: NavSection[] }} Nav
 */

/** The `docs-site` folder: the nearest one above `from` that holds a `nav.json`. */
export function findDocsRoot(from = process.cwd()) {
  let dir = path.resolve(from);
  for (;;) {
    const candidate = path.join(dir, "docs-site");
    if (existsSync(path.join(candidate, "nav.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`docs-site/nav.json not found above ${from}`);
    dir = parent;
  }
}

/** @param {string} root @returns {Nav} */
export function readNav(root) {
  /** @type {Nav} */
  const nav = JSON.parse(readFileSync(path.join(root, "nav.json"), "utf8"));
  if (!Array.isArray(nav.sections)) throw new Error("nav.json: `sections` must be an array");
  return nav;
}

/** The Markdown file of a page slug such as `concepts/commands`. */
export const pageFile = (/** @type {string} */ root, /** @type {string} */ slug) =>
  path.join(root, `${slug}.md`);

/** The source of a page, as written. */
export const readPage = (/** @type {string} */ root, /** @type {string} */ slug) =>
  readFileSync(pageFile(root, slug), "utf8");
