// Code blocks of a page in the code block's own markup (packages/theme code.css): a head with the
// title or language and a copy button, numbered lines, highlighted tokens. Consecutive fences
// with a `tab` meta, and an `npm install` line, become one block with tabs (docs-site/README.md).
// The tabs and the copy button are wired on the client by the page's enhancer (data-* hooks).

import { highlightLines, languageLabel } from "./highlight";
import { iconSvg } from "./icons";
import { escapeHtml as escape, parseFenceMeta } from "./rules.mjs";

export interface CodePanel {
  label?: string;
  title?: string;
  language: string;
  code: string;
}

const INSTALL = /^npm (?:install|i)\b(.*)$/;
const DEV_FLAG = /(?:^|\s)(?:-D|--save-dev)(?=\s|$)/;

/** `npm install a b` as pnpm, yarn and bun commands; null when a line is not an npm install. */
export function installVariants(code: string): CodePanel[] | null {
  const lines = code.split("\n").filter((line) => line.trim());
  if (!lines.length || !lines.every((line) => INSTALL.test(line.trim()))) return null;
  const rest = lines.map((line) => INSTALL.exec(line.trim())![1]!.trim());
  const as = (tool: string, dev: string) =>
    rest
      .map((args) => {
        const plain = args.replace(DEV_FLAG, " ").replace(/\s+/g, " ").trim();
        const flag = DEV_FLAG.test(args) ? ` ${dev}` : "";
        return `${tool} add${flag}${plain ? ` ${plain}` : ""}`;
      })
      .join("\n");
  return [
    { label: "npm", language: "sh", code: lines.map((line) => line.trim()).join("\n") },
    { label: "pnpm", language: "sh", code: as("pnpm", "-D") },
    { label: "yarn", language: "sh", code: as("yarn", "--dev") },
    { label: "bun", language: "sh", code: as("bun", "-d") },
  ];
}

/** A fence as a panel: its language and the title and tab of its meta. */
export function panelOf(language: string, code: string, meta: unknown): CodePanel {
  const { title, tab } = parseFenceMeta(meta);
  return { language, code, title, label: tab };
}

/** The numbers and the lines; the gutter is one text of numbers, the code view's own column. */
async function scrollHtml(panel: CodePanel): Promise<string> {
  const lines = await highlightLines(panel.code, panel.language);
  const numbers = lines.map((_, index) => index + 1).join("\n");
  return `<span class="gotipe-code-block-line-numbers" aria-hidden="true">${numbers}</span><pre><code class="language-${escape(panel.language)}">${lines.join("\n")}</code></pre>`;
}

/** The copy button; the page's enhancer swaps its glyph for a check and announces the copy. */
const copyButton = () =>
  `<button type="button" class="site-code-copy" data-copy-code aria-label="Copy code">${iconSvg("copy")}</button>`;

/** The caption of a panel in the head: its title, else the name of its language. */
const caption = (panel: CodePanel) => escape(panel.title ?? languageLabel(panel.language));

/** One code block. */
export async function codeBlockHtml(panel: CodePanel): Promise<string> {
  return `<div class="gotipe-code-block-header"><span class="site-code-title">${caption(panel)}</span>${copyButton()}</div><div class="gotipe-code-block-scroll" data-code-panel>${await scrollHtml(panel)}</div>`;
}

/**
 * Several panels behind tabs (the code block's head holds the segmented control). `group`
 * names the choice that pages share, e.g. the package manager. `id` is unique on the page.
 */
export async function codeTabsHtml(panels: CodePanel[], id: string, group: string) {
  const tabs = panels
    .map(
      (panel, index) =>
        `<button type="button" role="tab" id="${id}-tab-${index}" aria-controls="${id}-panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}"${index === 0 ? ' class="is-on"' : ""} data-tab="${escape(panel.label ?? "")}">${escape(panel.label ?? "")}</button>`,
    )
    .join("");
  const titled = panels.some((panel) => panel.title);
  const titles = titled
    ? panels
        .map(
          (panel, index) =>
            `<span class="site-code-title" data-tab-title="${index}"${index ? " hidden" : ""}>${escape(panel.title ?? "")}</span>`,
        )
        .join("")
    : "";
  const bodies = await Promise.all(
    panels.map(
      async (panel, index) =>
        `<div class="gotipe-code-block-scroll" role="tabpanel" id="${id}-panel-${index}" aria-labelledby="${id}-tab-${index}" data-code-panel${index ? " hidden" : ""}>${await scrollHtml(panel)}</div>`,
    ),
  );
  return {
    group,
    html: `<div class="gotipe-code-block-header"><span class="gotipe-seg" role="tablist" aria-label="${escape(group)}">${tabs}</span>${titles}${copyButton()}</div>${bodies.join("")}`,
  };
}
