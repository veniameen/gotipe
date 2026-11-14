// Machine-readable documentation (llmstxt.org): /llms.txt lists the sections and pages with their
// descriptions and links to each page's raw Markdown; /llms-full.txt holds every page in order.
// The links are absolute with NEXT_PUBLIC_SITE_URL and site-relative without it.

import { markdownUrl, siteAddress } from "./paths";
import type { DocsSite } from "./source";

const INTRO =
  "GoTipe is an editor library: a typed document model with transactions, JavaScript and Rust/WASM engines, its own Markdown codec, framework adapters, collaboration, review and a ready block editor UI.";

export function llmsIndex(site: DocsSite): string {
  const sections = site.sections.map(
    (section) =>
      `## ${section.title}\n\n${section.pages
        .map(
          (page) =>
            `- [${page.title}](${siteAddress(markdownUrl(page.slug))}): ${page.description}`,
        )
        .join("\n")}`,
  );
  return `# GoTipe\n\n> ${INTRO}\n\nThe full text of every page: ${siteAddress("/llms-full.txt")}\n\n${sections.join("\n\n")}\n`;
}

export function llmsFull(site: DocsSite): string {
  const pages = site.pages.map(
    (page) =>
      `# ${page.title}\n\nSource: ${siteAddress(markdownUrl(page.slug))}\nSection: ${page.section}\n\n> ${page.description}\n\n${page.body.trim()}\n`,
  );
  return `# GoTipe documentation\n\n> ${INTRO}\n\n${pages.join("\n---\n\n")}`;
}
