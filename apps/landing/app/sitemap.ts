import { docsUrl, siteUrl } from "@/lib/docs/paths";
import { loadDocs } from "@/lib/docs/source";
import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/**
 * The landing and every docs page at NEXT_PUBLIC_SITE_URL. A sitemap holds absolute addresses
 * only, so without that origin it is empty rather than naming a host the site does not own.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  if (!base) return [];
  return [
    { url: `${base}/`, priority: 1 },
    ...loadDocs().pages.map((page) => ({ url: `${base}${docsUrl(page.slug)}`, priority: 0.7 })),
  ];
}
