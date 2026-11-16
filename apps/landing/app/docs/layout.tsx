import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
import "@/components/site/code-tokens.css";
import "./docs.css";
import "./docs-content.css";
import "./docs-search.css";
import type { ReactNode } from "react";
import { SearchRoot } from "./_components/search";

/**
 * Every docs page: the site's type around the library's `docs` view, and search behind ⌘K. The
 * whole page is in the view (`data-gt-view`, its tokens only): the head stands on the same columns
 * as the page below it, which the view's widths name.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site site-docs" data-gt-view="docs">
      <SearchRoot>{children}</SearchRoot>
    </div>
  );
}
