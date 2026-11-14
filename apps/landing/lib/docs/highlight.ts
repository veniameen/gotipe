// Build-time highlighting of the docs' code: the library's own Shiki adapter
// (@gotipe/block-editor/shiki) with the GoTipe code theme, whose colours are the --gt-syn-*
// tokens. A token is written as a class, not an inline colour, so one HTML serves light and dark.
// It runs at build time only (the docs pages and the landing's sample).

import {
  type CodeHighlighter,
  codeLanguageAliases,
  createShikiHighlighter,
  gotipeCodeTheme,
} from "@gotipe/block-editor/shiki";
import { escapeText } from "./rules.mjs";

/** The grammars the pages use, beyond the library's set (JSX, Vue, Svelte, TOML, HTTP). */
const langs = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  vue: () => import("shiki/langs/vue.mjs"),
  svelte: () => import("shiki/langs/svelte.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  http: () => import("shiki/langs/http.mjs"),
};

const aliases: Record<string, string> = {
  ...codeLanguageAliases,
  tsx: "tsx",
  jsx: "jsx",
  zsh: "bash",
  console: "bash",
};

/** Names a reader sees in the head of a block without a title. */
const LANGUAGE_LABEL: Record<string, string> = {
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  js: "JavaScript",
  javascript: "JavaScript",
  jsx: "JSX",
  sh: "Terminal",
  bash: "Terminal",
  shell: "Terminal",
  json: "JSON",
  css: "CSS",
  html: "HTML",
  vue: "Vue",
  svelte: "Svelte",
  md: "Markdown",
  markdown: "Markdown",
  toml: "TOML",
  yaml: "YAML",
  yml: "YAML",
  rust: "Rust",
  rs: "Rust",
  http: "HTTP",
  text: "Text",
};

export const languageLabel = (language: string) => LANGUAGE_LABEL[language] ?? language;

/**
 * The library's code theme with the site's reading of two scopes, as the landing's accepted
 * sample draws them (Atlas frame 20): the name a function or component is declared with is a
 * type (`function Notes`), and an arrow `=>` is punctuation, not a keyword. Later and more
 * specific rules win over the theme's own.
 */
const siteCodeTheme = {
  ...gotipeCodeTheme,
  name: "gotipe-site",
  tokenColors: [
    ...gotipeCodeTheme.tokenColors,
    {
      scope: ["meta.definition.function entity.name.function", "meta.definition.class entity.name"],
      settings: { foreground: "var(--gt-syn-type)" },
    },
    { scope: ["storage.type.function.arrow"], settings: { foreground: "var(--gt-syn-punct)" } },
  ],
};
const siteCodeThemeLoader = () => Promise.resolve({ default: siteCodeTheme });

let highlighter: CodeHighlighter | null = null;

/**
 * The theme's colour of a token, `var(--gt-syn-keyword)`, as the one-letter class of its kind.
 * The page carries thousands of tokens, so the markup stays short: `<span class=k>`.
 */
const KIND: Record<string, string> = {
  keyword: "k",
  string: "s",
  number: "n",
  type: "t",
  punct: "p",
  comment: "c",
};
function kindOf(color: string | undefined): string {
  const match = color ? /^var\(--gt-syn-([a-z]+)\)$/.exec(color) : null;
  return (match && KIND[match[1]!]) ?? "";
}

/** One line of tokens as HTML: runs of one kind merged, spaces joined to the run before them. */
function lineHtml(tokens: { content: string; color?: string }[]): string {
  let html = "";
  let kind = "";
  let run = "";
  const flush = () => {
    if (run) html += kind ? `<span class=${kind}>${escapeText(run)}</span>` : escapeText(run);
    run = "";
  };
  for (const token of tokens) {
    const next = /^\s*$/.test(token.content) ? kind : kindOf(token.color);
    if (next !== kind) {
      flush();
      kind = next;
    }
    run += token.content;
  }
  flush();
  return html;
}

/**
 * The code as HTML lines: the tokens of a known language as short spans of their kind
 * (docs-content.css colours them with the --gt-syn-* tokens), any other language (or a grammar
 * that fails) as escaped text.
 */
export async function highlightLines(code: string, language: string): Promise<string[]> {
  highlighter ??= createShikiHighlighter({
    langs,
    aliases,
    themes: { light: siteCodeThemeLoader, dark: siteCodeThemeLoader },
  });
  let lines: Awaited<ReturnType<CodeHighlighter>> = null;
  try {
    lines = await highlighter(code, language);
  } catch (error) {
    console.warn(`docs: no highlighting for ${language}: ${String(error)}`);
  }
  if (!lines) return code.split("\n").map(escapeText);
  return lines.map(lineHtml);
}
