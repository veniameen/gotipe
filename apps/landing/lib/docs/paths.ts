// The addresses of the documentation. The static export writes every page as a folder with a
// trailing slash (components/site/links.ts), so links point there and need no redirect.

import { REPO_URL } from "@/components/site/links";
import { docsPath, pageHref } from "./rules.mjs";

/** The page's address with its anchor: `/docs/concepts/commands/#chain`. */
export function docsUrl(slug: string, anchor = ""): string {
  return `${docsPath(slug)}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`;
}

/** The raw Markdown of a page, as written in docs-site. */
export const markdownUrl = (slug: string) => `${pageHref(slug)}.md`;

/** The page's source on GitHub (NEXT_PUBLIC_REPO_URL, default github.com/veniameen/gotipe). */
export const editUrl = (slug: string) => `${REPO_URL}/blob/main/docs-site/${slug}.md`;

/**
 * The site's own origin for absolute links (canonical, sitemap, llms.txt): NEXT_PUBLIC_SITE_URL.
 * Null while it is unset or not a web address: the site then writes no absolute address at all,
 * rather than one of a host it does not own.
 */
export function siteUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/** A site path as an absolute address when the origin is known, else as the path itself. */
export const siteAddress = (path: string) => `${siteUrl() ?? ""}${path}`;

/** The address of the search index the dialog fetches. */
export const SEARCH_INDEX_URL = "/docs/search-index.json";
