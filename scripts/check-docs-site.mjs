// `pnpm check:docs-site`: the public documentation (docs-site) against its own rules
// (docs-site/README.md) and the site that renders it (apps/landing/lib/docs).
// - nav.json and the pages on disk agree; no page is listed twice;
// - front matter has a title and a one-sentence description; license is MIT or Commercial;
// - the docs pages the site links to (site-pages.mjs) exist, and its Docs link is /docs's page;
// - the GoTipe Markdown codec reads every page with no raw (markdownRaw) blocks;
// - the body starts at H2; alerts are GFM kinds; fenced code names its language;
// - `demo` blocks name a known demo, at most one per page;
// - internal links point at a listed page and, with an anchor, at one of its headings.
// The heading ids, front matter and link rules are the site's own (lib/docs/rules.mjs).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readNav, readPage } from "../apps/landing/lib/docs/files.mjs";
import {
  DEMO_LANGUAGE,
  createSlugger,
  internalTarget,
  plainText,
  readmeDemoNames,
  splitFrontMatter,
} from "../apps/landing/lib/docs/rules.mjs";
import { SITE_PAGES } from "../apps/landing/lib/docs/site-pages.mjs";

const repo = path.resolve(import.meta.dirname, "..");
const rootArg = process.argv.indexOf("--root");
const root = rootArg > 0 ? path.resolve(process.argv[rootArg + 1]) : path.join(repo, "docs-site");
const markdownEntry = path.join(repo, "packages/markdown/dist/index.js");
const demoNamesFile = path.join(repo, "apps/landing/components/demos/names.ts");
const ALERTS = new Set(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"]);

const errors = [];
const fail = (slug, message) => errors.push(`docs-site/${slug}.md: ${message}`);

if (!existsSync(markdownEntry)) {
  console.error("check:docs-site needs the built codec: pnpm --filter @gotipe/markdown build");
  process.exit(1);
}
const { parseMarkdown } = await import(pathToFileURL(markdownEntry).href);

/** Demo names: the README's list, which must match the site's demos when they exist. */
function demoNames() {
  const readme = readmeDemoNames(readFileSync(path.join(root, "README.md"), "utf8"));
  if (!readme.length) errors.push("docs-site/README.md: the list of demo names is not found");
  if (!existsSync(demoNamesFile)) return new Set(readme);
  // the site's list is plain data (`DEMO_NAMES = [...] as const`): read it, not run it
  const list = /DEMO_NAMES = \[([^\]]*)\]/.exec(readFileSync(demoNamesFile, "utf8"));
  if (!list) errors.push(`${relative(demoNamesFile)}: DEMO_NAMES is not found`);
  const site = new Set([...(list?.[1] ?? "").matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]));
  for (const name of readme)
    if (!site.has(name))
      errors.push(`README demo \`${name}\` has no demo in ${relative(demoNamesFile)}`);
  for (const name of site)
    if (!readme.includes(name)) errors.push(`demo \`${name}\` is missing from the README's list`);
  return new Set([...readme].filter((name) => site.has(name)));
}

const relative = (file) => path.relative(repo, file).split(path.sep).join("/");

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
const nav = readNav(root);
const listed = nav.sections.flatMap((section) => section.pages);
const seen = new Set();
for (const slug of listed) {
  if (seen.has(slug)) fail(slug, "listed twice in nav.json");
  seen.add(slug);
  if (!existsSync(path.join(root, `${slug}.md`))) fail(slug, "listed in nav.json but missing");
}
for (const slug of pagesOnDisk()) if (!seen.has(slug)) fail(slug, "not listed in nav.json");

// ---- the pages the rest of the site links to (lib/docs/site-pages.mjs) ----
for (const [name, slug] of Object.entries(SITE_PAGES))
  if (!seen.has(slug))
    errors.push(`site-pages.mjs: \`${name}\` is ${slug}, not a page of nav.json`);
if (SITE_PAGES.docs !== listed[0])
  errors.push(
    `site-pages.mjs: \`docs\` is ${SITE_PAGES.docs}; /docs opens ${listed[0]}, the first page`,
  );

// ---- every page: front matter, blocks, headings ----
const demos = demoNames();
const pages = new Map();
for (const slug of seen) {
  if (!existsSync(path.join(root, `${slug}.md`))) continue;
  // title, description, packages and license: the site's own rules (frontMatterErrors)
  const { body, errors: frontErrors } = splitFrontMatter(readPage(root, slug));
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
