// The docs pages the rest of the site links to (the head, the foot, the landing). One list for the
// site (components/site/links.ts) and for `pnpm check:docs-site`, which checks that every page is
// listed in nav.json and that `docs` is its first page, where /docs leads.

export const SITE_PAGES = {
  docs: "getting-started/introduction",
  quickStart: "getting-started/quick-start",
  licensing: "resources/licensing",
  changelog: "resources/changelog",
  security: "resources/security",
  browsers: "resources/browser-support",
};
