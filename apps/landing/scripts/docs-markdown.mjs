// Writes each published docs page's Markdown source to public/docs/<slug>.md before the site is
// built, so the static export serves it beside the page (/docs/<slug>.md): «Copy Markdown»,
// llms.txt and readers that want the source. A route handler cannot share the page's dynamic
// segment, hence this step. The output is generated and ignored by Git.

import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { findDocsRoot, pageFile, readNav } from "../lib/docs/files.mjs";

const app = path.resolve(import.meta.dirname, "..");
const out = path.join(app, "public", "docs");
const root = findDocsRoot(app);

rmSync(out, { recursive: true, force: true });
let count = 0;
for (const section of readNav(root).sections) {
  for (const slug of section.pages) {
    const target = path.join(out, `${slug}.md`);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(pageFile(root, slug), target);
    count++;
  }
}
console.log(`docs: ${count} Markdown pages in public/docs`);
