/**
 * Where the site's links go. One owner for every address the header, the footer and the landing
 * share. The docs pages come from lib/docs/site-pages.mjs, which `pnpm check:docs-site` holds
 * against nav.json (static export, trailing slash).
 */

import { docsPath } from "@/lib/docs/rules.mjs";
import { SITE_PAGES } from "@/lib/docs/site-pages.mjs";

const DEFAULT_REPO = "https://github.com/veniameen/gotipe";

/** An absolute http(s) address from the environment, or null when unset or not a web address. */
function webAddress(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** NEXT_PUBLIC_* values are inlined at build time; the static export reads them once. */
export const PLAYGROUND_URL = webAddress(process.env.NEXT_PUBLIC_PLAYGROUND_URL);
export const REPO_URL = (webAddress(process.env.NEXT_PUBLIC_REPO_URL) ?? DEFAULT_REPO).replace(
  /\/$/,
  "",
);

export const LINKS = {
  home: "/",
  docs: docsPath(SITE_PAGES.docs),
  quickStart: docsPath(SITE_PAGES.quickStart),
  licensing: docsPath(SITE_PAGES.licensing),
  changelog: docsPath(SITE_PAGES.changelog),
  security: docsPath(SITE_PAGES.security),
  browsers: docsPath(SITE_PAGES.browsers),
  repo: REPO_URL,
  contributing: `${REPO_URL}/blob/main/CONTRIBUTING.md`,
  vulnerability: `${REPO_URL}/blob/main/SECURITY.md`,
  npm: "https://www.npmjs.com/package/@gotipe/core",
  playground: PLAYGROUND_URL,
} as const;

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

/** The four links of the head; Playground is left out while its address is unset. */
export function primaryNav(): NavLink[] {
  const links: (NavLink | null)[] = [
    { label: "Docs", href: LINKS.docs },
    PLAYGROUND_URL ? { label: "Playground", href: PLAYGROUND_URL, external: true } : null,
    { label: "Licensing", href: LINKS.licensing },
    { label: "Changelog", href: LINKS.changelog },
  ];
  return links.filter((link): link is NavLink => link !== null);
}
