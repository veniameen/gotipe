import { Badge } from "@/components/site/badge";
import { Icon } from "@/components/site/icon";
import { docsUrl } from "@/lib/docs/paths";
import type { DocsSite } from "@/lib/docs/source";
import Link from "next/link";

/** Atlas frame 21 keeps the first four sections open: Getting started to Editor UI. */
const OPEN_SECTIONS = 4;

/** A section is Commercial when most of its pages that name a license are (frame 21: Editor UI). */
function commercial(pages: DocsSite["sections"][number]["pages"]): boolean {
  const named = pages.filter((page) => page.license);
  return named.filter((page) => page.license === "Commercial").length * 2 > named.length;
}

/**
 * The navigation of every page (nav.json). The first sections and the current page's stand open
 * under their labels; the others fold behind their names and open on a click, without script
 * (details/summary). Links are not prefetched: sixty pages would be fetched for one.
 */
export function SideNav({ site, current }: { site: DocsSite; current: string }) {
  return (
    <>
      {site.sections.map((section, index) => {
        const open = index < OPEN_SECTIONS || section.pages.some((page) => page.slug === current);
        return (
          <details key={section.title} className="site-side-group" open={open || undefined}>
            <summary className="site-side-title">
              <span>{section.title}</span>
              {commercial(section.pages) && <Badge licence="Commercial" />}
              <Icon name="chevron-right" className="site-icon site-side-chevron" />
            </summary>
            <ul className="site-side-pages">
              {section.pages.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={docsUrl(page.slug)}
                    prefetch={false}
                    className={page.slug === current ? "is-current" : undefined}
                    aria-current={page.slug === current ? "page" : undefined}
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </>
  );
}
