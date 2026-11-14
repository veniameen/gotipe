import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
import "@/components/site/code-tokens.css";
import "./docs.css";
import "./docs-content.css";
import "./docs-search.css";
import type { ReactNode } from "react";
import { SearchRoot } from "./_components/search";

/** Every docs page: the site's type around the library's `docs` view, and search behind ⌘K. */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site site-docs">
      <SearchRoot>{children}</SearchRoot>
    </div>
  );
}
