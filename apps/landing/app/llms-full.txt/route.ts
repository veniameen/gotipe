import { llmsFull } from "@/lib/docs/llms";
import { loadDocs } from "@/lib/docs/source";

export const dynamic = "force-static";

export function GET() {
  return new Response(llmsFull(loadDocs()), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
