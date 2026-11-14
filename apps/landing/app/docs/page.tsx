import { docsUrl } from "@/lib/docs/paths";
import { loadDocs } from "@/lib/docs/source";
import Link from "next/link";

/**
 * /docs opens the first page of nav.json. The static export has no server redirect, so the page
 * refreshes to it (React places the meta in the head) and links to it for anyone who stays.
 */
export default function DocsIndex() {
  const first = loadDocs().pages[0]!;
  const href = docsUrl(first.slug);
  return (
    <main id="main" className="site-doc site-docs-index">
      <meta httpEquiv="refresh" content={`0; url=${href}`} />
      <p>
        <Link href={href}>Open the documentation: {first.title}</Link>
      </p>
    </main>
  );
}
