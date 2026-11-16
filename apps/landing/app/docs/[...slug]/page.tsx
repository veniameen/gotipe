import { Badge } from "@/components/site/badge";
import { Icon } from "@/components/site/icon";
import { DocsFooter } from "@/components/site/site-footer";
import { DocsHeader } from "@/components/site/site-header";
import { docsUrl, editUrl, markdownUrl, siteUrl } from "@/lib/docs/paths";
import { renderPage } from "@/lib/docs/render";
import { loadDocs, neighbours } from "@/lib/docs/source";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyMarkdown } from "../_components/copy-markdown";
import { DocContent } from "../_components/doc-content";
import { DocEnhancer } from "../_components/doc-enhancer";
import { DocsNav, NavButton, NavPanel } from "../_components/nav-panel";
import { Outline } from "../_components/outline";
import { SearchButton, SearchField } from "../_components/search";
import { SideNav } from "../_components/side-nav";

type Props = { params: Promise<{ slug: string[] }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return loadDocs().pages.map((page) => ({ slug: page.slug.split("/") }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = loadDocs().bySlug.get((await params).slug.join("/"));
  if (!page) return {};
  const origin = siteUrl();
  return {
    title: `${page.title} — Docs`,
    description: page.description,
    alternates: {
      // a canonical address is absolute: none while the site's origin is not configured
      ...(origin ? { canonical: `${origin}${docsUrl(page.slug)}` } : {}),
      types: { "text/markdown": markdownUrl(page.slug) },
    },
    openGraph: { title: page.title, description: page.description, type: "article" },
  };
}

export default async function DocPage({ params }: Props) {
  const site = loadDocs();
  const page = site.bySlug.get((await params).slug.join("/"));
  if (!page) notFound();
  const { nodes, outline } = await renderPage(site, page);
  const { previous, next } = neighbours(site, page.slug);

  return (
    <DocsNav>
      <DocsHeader search={<SearchField />} searchButton={<SearchButton />} menu={<NavButton />} />
      <div className="site-docs-body" data-gt-view="docs">
        <NavPanel>
          <SideNav site={site} current={page.slug} />
        </NavPanel>
        <main id="main" className="site-docs-main" tabIndex={-1}>
          <article className="site-doc" id="doc">
            <div className="site-doc-top">
              <nav className="site-crumbs" aria-label="Breadcrumb">
                <ol>
                  <li>{page.section}</li>
                  <li aria-current="page">
                    <Icon name="chevron-right" />
                    {page.title}
                  </li>
                </ol>
              </nav>
              <span className="site-doc-tools">
                <CopyMarkdown url={markdownUrl(page.slug)} />
                <a
                  className="site-button is-quiet site-tool-button"
                  href={editUrl(page.slug)}
                  aria-label="Edit on GitHub"
                >
                  <Icon name="external" />
                  <span className="site-tool-label">Edit on GitHub</span>
                </a>
              </span>
            </div>
            <h1 className="site-doc-title">{page.title}</h1>
            <p className="site-doc-lede">{page.description}</p>
            {(page.packages.length > 0 || page.license) && (
              <div className="site-doc-meta">
                {page.packages.map((name) => (
                  <Badge key={name}>{name}</Badge>
                ))}
                {page.license && <Badge licence={page.license} />}
              </div>
            )}
            <DocContent nodes={nodes} />
            <nav className="site-pager" aria-label="Pages">
              {previous ? (
                <Link href={docsUrl(previous.slug)} rel="prev">
                  <small>
                    <Icon name="arrow-left" />
                    Previous
                  </small>
                  {previous.title}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link href={docsUrl(next.slug)} rel="next" className="is-next">
                  <small>
                    Next
                    <Icon name="arrow-right" />
                  </small>
                  {next.title}
                </Link>
              )}
            </nav>
          </article>
          <DocsFooter />
        </main>
        <aside className="site-toc">
          <Outline items={outline} />
        </aside>
      </div>
      <DocEnhancer root="doc" />
    </DocsNav>
  );
}
