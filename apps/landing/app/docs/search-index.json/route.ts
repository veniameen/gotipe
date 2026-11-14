import { buildSearchIndex } from "@/lib/docs/search-index";
import { loadDocs } from "@/lib/docs/source";

export const dynamic = "force-static";

/** The search index of every page, one static file fetched by the search dialog. */
export function GET() {
  return Response.json(buildSearchIndex(loadDocs()));
}
