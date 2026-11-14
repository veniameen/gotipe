// The search index, built with the pages and served as one static JSON file. Each entry is a page
// or one of its headings with a little of the prose under it, read straight from the page's
// blocks (no rendering, no highlighting). Every paragraph, list item and table cell stays its
// own segment, so a snippet never runs one cell into the next. search-rank.ts reads the shape.

import type { Block } from "@gotipe/markdown";
import { docsUrl } from "./paths";
import type { SearchEntry } from "./search-rank";
import { type DocPage, type DocsSite, spansText } from "./source";

/** Prose kept per entry: enough to find a term near the heading and draw a line around it. */
const TEXT_LIMIT = 280;

interface Section {
  id: string;
  heading: string;
  level: number;
  segments: string[];
}

/** The text segments of a block: its own text, its children's; code and raw blocks have none. */
function segmentsOf(block: Block, out: string[]): void {
  if (block.type === "codeBlock" || block.type === "markdownRaw" || block.type === "tableHeader")
    return;
  if (Array.isArray(block.content)) {
    const text = spansText(block.content).replace(/\s+/g, " ").trim();
    if (text) out.push(text);
  }
  for (const child of block.children) segmentsOf(child, out);
}

/** The intro and every heading of a page with the segments under it. */
export function pageSections(page: DocPage): Section[] {
  const sections: Section[] = [{ id: "", heading: page.title, level: 1, segments: [] }];
  let heading = 0;
  for (const block of page.blocks) {
    if (block.type === "heading") {
      const { id, text, level } = page.headings[heading++]!;
      sections.push({ id, heading: text, level, segments: [] });
    } else segmentsOf(block, sections[sections.length - 1]!.segments);
  }
  return sections;
}

/** The first segments up to the limit; the last one cut at a word. */
export function trimSegments(segments: string[], limit = TEXT_LIMIT): string[] {
  const kept: string[] = [];
  let room = limit;
  for (const segment of segments) {
    if (room <= 0) break;
    kept.push(
      segment.length <= room ? segment : `${segment.slice(0, room).replace(/\s+\S*$/, "")}…`,
    );
    room -= segment.length;
  }
  return kept;
}

export function buildSearchIndex(site: DocsSite): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const page of site.pages) {
    const [intro, ...rest] = pageSections(page);
    entries.push({
      k: "page",
      s: page.section,
      p: page.title,
      t: page.title,
      d: page.description,
      x: trimSegments(intro?.segments ?? []),
      u: docsUrl(page.slug),
    });
    for (const section of rest) {
      if (section.level > 3) continue;
      entries.push({
        k: "heading",
        s: page.section,
        p: page.title,
        t: section.heading,
        d: "",
        x: trimSegments(section.segments),
        u: docsUrl(page.slug, section.id),
      });
    }
  }
  return entries;
}
