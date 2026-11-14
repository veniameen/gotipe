// A page of the documentation as a GoTipe document in the `docs` view: the blocks come from
// @gotipe/markdown, their text from the library's own HTML serializer (`serializeHtml` of
// @gotipe/core), and the site adds only what the view draws around a block — the code block's
// head, the callout's glyph, the table's scroll box, a heading's id and anchor. Each top-level
// block is one node, so the page component keeps the document's flow and a live demo stands in
// it as a React island.

import { serializeHtml } from "@gotipe/core";
import type { Block, Span } from "@gotipe/markdown";
import { type CodePanel, codeBlockHtml, codeTabsHtml, installVariants, panelOf } from "./code";
import { type IconName, iconSvg } from "./icons";
import { docsUrl } from "./paths";
import { DEMO_LANGUAGE, escapeHtml as escape, internalTarget } from "./rules.mjs";
import type { DocHeading, DocPage, DocsSite } from "./source";

export type DocNode =
  | { kind: "html"; tag: string; attrs: Record<string, string>; html: string }
  | { kind: "void"; tag: string; attrs: Record<string, string> }
  | { kind: "demo"; name: string };

export interface OutlineItem {
  id: string;
  text: string;
  /** 1 for H2, 2 for H3: the outline's own `data-level`. */
  level: number;
}

export interface RenderedPage {
  nodes: DocNode[];
  outline: OutlineItem[];
}

/** GFM alert → the callout variant of the theme and its glyph. */
const ALERTS: Record<string, { variant: string; icon: IconName; label: string }> = {
  NOTE: { variant: "info", icon: "info", label: "Note" },
  TIP: { variant: "tip", icon: "bulb", label: "Tip" },
  IMPORTANT: { variant: "important", icon: "flag", label: "Important" },
  WARNING: { variant: "warning", icon: "warning", label: "Warning" },
  CAUTION: { variant: "caution", icon: "warning", label: "Caution" },
};

/**
 * Long code in a table cell (`Promise<AiSuggestion[]>`, `showCollaborationCursors`) may break
 * after its punctuation and between the words of a camelCase name, so the table fits its column;
 * short names stay whole, which `overflow-wrap: anywhere` would not keep.
 */
const breakable = (code: string) =>
  code.replace(/(&lt;|[.,(\[|/:{])(?=[^\s])/g, "$1<wbr>").replace(/([a-z])(?=[A-Z])/g, "$1<wbr>");

class PageRenderer {
  readonly errors: string[] = [];
  private headingIndex = 0;
  private codeIndex = 0;

  constructor(
    private readonly site: DocsSite,
    private readonly page: DocPage,
  ) {}

  /** Soft breaks joined with a space; internal links checked and written as site URLs. */
  private spans(content: Block["content"]): Span[] {
    if (!Array.isArray(content)) return [];
    return content.map((span) => ({
      text: span.text.replace(/\n/g, " "),
      marks: span.marks.map((mark) =>
        mark.type === "link"
          ? { ...mark, attrs: { ...mark.attrs, href: this.href(mark.attrs) } }
          : mark,
      ),
    }));
  }

  private href(attrs: Record<string, unknown> | undefined): string {
    const href = String(attrs?.href ?? "");
    const target = internalTarget(href, this.page.slug);
    if (!target) {
      if (/^\/docs(?:\/|$)/.test(href)) this.errors.push(`link ${href} is not a docs page path`);
      return href;
    }
    const page = this.site.bySlug.get(target.slug);
    if (!page) {
      this.errors.push(`link ${href}: no page ${target.slug} in nav.json`);
      return href;
    }
    if (target.anchor && !page.headings.some((heading) => heading.id === target.anchor))
      this.errors.push(`link ${href}: no heading #${target.anchor} on ${target.slug}`);
    return docsUrl(target.slug, target.anchor);
  }

  /** A tree of blocks with prepared text, for the serializer. */
  private prepare(block: Block): Block {
    return {
      ...block,
      content: Array.isArray(block.content) ? this.spans(block.content) : block.content,
      children: block.children.map((child) => this.prepare(child)),
    };
  }

  private inline(content: Block["content"]): string {
    const html = serializeHtml([
      { type: "paragraph", attrs: {}, content: this.spans(content), children: [] },
    ]);
    return html.replace(/^<p>/, "").replace(/<\/p>$/, "");
  }

  private heading(block: Block, heading: DocHeading): DocNode {
    const level = Math.min(Math.max(heading.level, 2), 6);
    // the heading's text is its own link: reachable from the keyboard, and the heading's name stays
    // its text; the # in the gutter is drawn by CSS. A link inside a heading would nest, so a
    // heading's own links read as text.
    const content = Array.isArray(block.content)
      ? block.content.map((span) => ({
          ...span,
          marks: span.marks.filter((mark) => mark.type !== "link"),
        }))
      : block.content;
    return {
      kind: "html",
      tag: `h${level}`,
      attrs: { id: heading.id },
      html: `<a class="site-heading-link" href="#${escape(heading.id)}">${this.inline(content)}</a>`,
    };
  }

  private callout(block: Block): DocNode {
    const alert = ALERTS[String(block.attrs.alert ?? "").toUpperCase()] ?? ALERTS.NOTE!;
    const icon = `<span class="gotipe-callout-icon">${iconSvg(alert.icon)}<span class="site-sr">${alert.label}:</span></span>`;
    const children = block.children.length
      ? serializeHtml(block.children.map((child) => this.prepare(child)))
      : "";
    return {
      kind: "html",
      tag: "div",
      attrs: { className: "gotipe-callout", "data-variant": alert.variant },
      html: `${icon}<div class="gotipe-callout-content"><p>${this.inline(block.content)}</p>${children}</div>`,
    };
  }

  private async code(panels: CodePanel[]): Promise<DocNode> {
    const id = `code-${this.codeIndex++}`;
    const attrs = { className: "gotipe-code-block", "data-block-type": "codeBlock" };
    if (panels.length === 1) {
      const install = installVariants(panels[0]!.code);
      if (!install || panels[0]!.label)
        return { kind: "html", tag: "div", attrs, html: await codeBlockHtml(panels[0]!) };
      const tabs = await codeTabsHtml(install, id, "Package manager");
      return {
        kind: "html",
        tag: "div",
        attrs: { ...attrs, "data-tabs": tabs.group },
        html: tabs.html,
      };
    }
    const tabs = await codeTabsHtml(panels, id, panels.map((panel) => panel.label).join(" / "));
    return {
      kind: "html",
      tag: "div",
      attrs: { ...attrs, "data-tabs": tabs.group },
      html: tabs.html,
    };
  }

  /** The serializer's element of a block, its outer tag kept for the page's flow. */
  private serialized(block: Block): DocNode {
    const html = serializeHtml([this.prepare(block)]);
    if (/^<hr>$/.test(html)) return { kind: "void", tag: "hr", attrs: {} };
    const outer = /^<([a-z][a-z0-9]*)((?:\s[a-z-]+="[^"]*")*)>([\s\S]*)<\/\1>$/.exec(html);
    if (!outer) return { kind: "html", tag: "div", attrs: { className: "site-block" }, html };
    const attrs: Record<string, string> = {};
    for (const [, name, value] of outer[2]!.matchAll(/\s([a-z-]+)="([^"]*)"/g))
      attrs[name === "class" ? "className" : name!] = value!
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    return { kind: "html", tag: outer[1]!, attrs, html: outer[3]! };
  }

  private table(block: Block): DocNode {
    const html = serializeHtml([this.prepare(block)])
      .replace(/^<table>/, '<table class="gotipe-table">')
      .replace(
        /<code>([^<]{16,})<\/code>/g,
        (_, code: string) => `<code>${breakable(code)}</code>`,
      );
    return { kind: "html", tag: "div", attrs: { className: "gotipe-table-wrapper" }, html };
  }

  async render(): Promise<RenderedPage> {
    const nodes: DocNode[] = [];
    const blocks = this.page.blocks;
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index]!;
      if (block.type === "heading") {
        nodes.push(this.heading(block, this.page.headings[this.headingIndex++]!));
      } else if (block.type === "codeBlock" && block.attrs.language === DEMO_LANGUAGE) {
        nodes.push({ kind: "demo", name: String(block.content ?? "").trim() });
      } else if (block.type === "codeBlock") {
        const panels = [this.panel(block)];
        if (panels[0]!.label)
          while (blocks[index + 1]?.type === "codeBlock") {
            const next = this.panel(blocks[index + 1]!);
            if (!next.label || blocks[index + 1]!.attrs.language === DEMO_LANGUAGE) break;
            panels.push(next);
            index++;
          }
        nodes.push(await this.code(panels));
      } else if (block.type === "callout") nodes.push(this.callout(block));
      else if (block.type === "table") nodes.push(this.table(block));
      else nodes.push(this.serialized(block));
    }
    return { nodes, outline: this.outline() };
  }

  private panel(block: Block): CodePanel {
    return panelOf(
      String(block.attrs.language ?? ""),
      String(block.content ?? ""),
      block.attrs.meta,
    );
  }

  private outline(): OutlineItem[] {
    return this.page.headings
      .filter((heading) => heading.level === 2 || heading.level === 3)
      .map((heading) => ({ id: heading.id, text: heading.text, level: heading.level - 1 }));
  }
}

/** Renders a page; a broken internal link stops the build with the list of every one. */
export async function renderPage(site: DocsSite, page: DocPage): Promise<RenderedPage> {
  const renderer = new PageRenderer(site, page);
  const rendered = await renderer.render();
  if (renderer.errors.length)
    throw new Error(`docs-site/${page.slug}.md:\n  ${renderer.errors.join("\n  ")}`);
  return rendered;
}
