// `pnpm check:docs-site`: the public documentation (docs-site) against its own rules
// (docs-site/README.md, scripts/docs-site/rules.mjs):
// - nav.json and the pages on disk agree; no page is listed twice;
// - front matter has a title and a one-sentence description; license is MIT or Commercial;
// - the GoTipe Markdown codec reads every page with no raw (markdownRaw) blocks;
// - the body starts at H2; alerts are GFM kinds; fenced code names its language;
// - `demo` blocks name a demo of the README's list, at most one per page;
// - internal links point at a listed page and, with an anchor, at one of its headings.
// The site that renders these pages checks them against its renderer in its own repository.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEMO_LANGUAGE,
  createSlugger,
  internalTarget,
  plainText,
  readmeDemoNames,
  splitFrontMatter,
} from "./docs-site/rules.mjs";

const repo = path.resolve(import.meta.dirname, "..");
const rootArg = process.argv.indexOf("--root");
const root = rootArg > 0 ? path.resolve(process.argv[rootArg + 1]) : path.join(repo, "docs-site");
const markdownEntry = path.join(repo, "packages/markdown/dist/index.js");
const ALERTS = new Set(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]);

const errors = [];
const fail = (slug, message) => errors.push(`docs-site/${slug}.md: ${message}`);

if (!existsSync(markdownEntry)) {
  console.error("check:docs-site needs the built codec: pnpm --filter @gotipe/markdown build");
  process.exit(1);
}
const { parseMarkdown } = await import(pathToFileURL(markdownEntry).href);

/** The demo names a page may use: the README's list. */
function demoNames() {
  const readme = readmeDemoNames(readFileSync(path.join(root, "README.md"), "utf8"));
  if (!readme.length) errors.push("docs-site/README.md: the list of demo names is not found");
  return new Set(readme);
}

/** nav.json: the sections and their pages in order. */
function readNav() {
  const nav = JSON.parse(readFileSync(path.join(root, "nav.json"), "utf8"));
  if (!Array.isArray(nav.sections)) throw new Error("nav.json: `sections` must be an array");
  return nav;
}

const readPage = (slug) => readFileSync(path.join(root, `${slug}.md`), "utf8");

function pagesOnDisk(dir = root, prefix = "") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory())
      return pagesOnDisk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
    if (!entry.name.endsWith(".md") || (!prefix && entry.name === "README.md")) return [];
    return [`${prefix}${entry.name.slice(0, -3)}`];
  });
}

function walk(blocks, visit) {
  for (const block of blocks) {
    visit(block);
    walk(block.children ?? [], visit);
  }
}

// ---- nav.json and the files ----
const nav = readNav();
const listed = nav.sections.flatMap((section) => section.pages);
const seen = new Set();
for (const slug of listed) {
  if (seen.has(slug)) fail(slug, "listed twice in nav.json");
  seen.add(slug);
  if (!existsSync(path.join(root, `${slug}.md`))) fail(slug, "listed in nav.json but missing");
}
for (const slug of pagesOnDisk()) if (!seen.has(slug)) fail(slug, "not listed in nav.json");

// ---- every page: front matter, blocks, headings ----
const demos = demoNames();
const pages = new Map();
for (const slug of seen) {
  if (!existsSync(path.join(root, `${slug}.md`))) continue;
  // title, description, packages and license (frontMatterErrors)
  const { body, errors: frontErrors } = splitFrontMatter(readPage(slug));
  for (const message of frontErrors) fail(slug, message);

  const { doc } = parseMarkdown(body);
  const slugger = createSlugger();
  const anchors = new Set();
  const links = [];
  let demoCount = 0;
  walk(doc.blocks, (block) => {
    if (block.type === "markdownRaw")
      fail(
        slug,
        `raw Markdown block (${block.attrs.kind || "unknown"}): ${String(block.content).slice(0, 60).replace(/\n/g, " ")}`,
      );
    if (block.type === "heading") {
      anchors.add(slugger(plainText(block.content).trim()));
      if (block.attrs.level === 1) fail(slug, "H1 in the body: the title is the H1, start at ##");
    }
    if (block.type === "callout" && !ALERTS.has(String(block.attrs.alert ?? "")))
      fail(slug, `callout ${block.attrs.alert ?? "without an alert kind"} is not a GFM alert`);
    if (block.type === "codeBlock") {
      const language = String(block.attrs.language ?? "").trim();
      if (!language) fail(slug, `code without a language: ${String(block.content).split("\n")[0]}`);
      if (language === DEMO_LANGUAGE) {
        demoCount++;
        const name = String(block.content).trim();
        if (!demos.has(name)) fail(slug, `unknown demo \`${name}\``);
      }
    }
    if (Array.isArray(block.content))
      for (const span of block.content)
        for (const mark of span.marks)
          if (mark.type === "link") links.push(String(mark.attrs?.href ?? ""));
  });
  if (demoCount > 1) fail(slug, `${demoCount} demos: at most one per page`);
  pages.set(slug, { anchors, links });
}

// ---- links between pages ----
for (const [slug, { links }] of pages) {
  for (const href of links) {
    const target = internalTarget(href, slug);
    if (!target) {
      if (/^\/docs(?:\/|$)/.test(href) || /^\.{0,2}\/.*\.md(?:#|$)/.test(href))
        fail(slug, `link ${href} is not a /docs/<page> path`);
      continue;
    }
    const page = pages.get(target.slug);
    if (!page) fail(slug, `link ${href}: no page ${target.slug} in nav.json`);
    else if (target.anchor && !page.anchors.has(target.anchor))
      fail(slug, `link ${href}: no heading #${target.anchor} on ${target.slug}`);
  }
}

if (errors.length) {
  console.error(`check:docs-site: ${errors.length} problem(s)\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `check:docs-site: ${pages.size} pages in ${nav.sections.length} sections, ${demos.size} demos — ok`,
);
