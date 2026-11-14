// The documentation as the site reads it at build time: nav.json, then every listed page with its
// front matter, raw source and GoTipe document. Server only: it reads docs-site from the disk.

import { type Block, parseMarkdown } from "@gotipe/markdown";
import { findDocsRoot, readNav, readPage as readSource } from "./files.mjs";
import { createSlugger, plainText, splitFrontMatter } from "./rules.mjs";

export type License = "MIT" | "Commercial";

export interface DocHeading {
  id: string;
  text: string;
  level: number;
  /** The heading block, for its inline marks. */
  block: Block;
}

export interface DocPage {
  slug: string;
  section: string;
  title: string;
  description: string;
  packages: string[];
  license?: License;
  /** The file as written, front matter included: «Copy Markdown» and /docs/<slug>.md. */
  raw: string;
  /** The page without its front matter. */
  body: string;
  blocks: Block[];
  headings: DocHeading[];
}

export interface DocSection {
  title: string;
  pages: DocPage[];
}

export interface DocsSite {
  root: string;
  sections: DocSection[];
  pages: DocPage[];
  bySlug: Map<string, DocPage>;
}

/** The text of rich content with soft line breaks joined by a space (docs-site/README.md). */
export const spansText = (content: Block["content"]): string => plainText(content);

function headingsOf(blocks: Block[]): DocHeading[] {
  const slug = createSlugger();
  return blocks
    .filter((block) => block.type === "heading")
    .map((block) => {
      const text = spansText(block.content).trim();
      return { id: slug(text), text, level: Number(block.attrs.level) || 2, block };
    });
}

function readPage(root: string, slug: string, section: string): DocPage {
  const raw = readSource(root, slug);
  const { data, body, errors } = splitFrontMatter(raw);
  // a page that breaks the README's rules stops the build with the reason, not a stack trace
  if (errors.length) throw new Error(`docs-site/${slug}.md: ${errors.join("; ")}`);
  let next = 0;
  const { doc } = parseMarkdown(body, { createId: () => `b${next++}` });
  return {
    slug,
    section,
    title: data.title!,
    description: data.description!,
    packages: data.packages ?? [],
    license: data.license as License | undefined,
    raw,
    body,
    blocks: doc.blocks,
    headings: headingsOf(doc.blocks),
  };
}

let cached: DocsSite | null = null;

/** Every page of nav.json, read once per build. */
export function loadDocs(): DocsSite {
  if (cached) return cached;
  const root = findDocsRoot();
  const sections = readNav(root).sections.map((section) => ({
    title: section.title,
    pages: section.pages.map((slug) => readPage(root, slug, section.title)),
  }));
  const pages = sections.flatMap((section) => section.pages);
  cached = { root, sections, pages, bySlug: new Map(pages.map((page) => [page.slug, page])) };
  return cached;
}

/** The page before and after `slug` in the order of nav.json. */
export function neighbours(site: DocsSite, slug: string) {
  const index = site.pages.findIndex((page) => page.slug === slug);
  return { previous: site.pages[index - 1], next: site.pages[index + 1] };
}
