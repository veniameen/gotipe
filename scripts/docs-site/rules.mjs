// The rules of a documentation page (docs-site/README.md) that `pnpm check:docs-site` holds the
// pages to: the front matter, heading ids as GitHub writes them, links between pages and the names
// of the live demos. Pure functions; reading the disk is the check's (scripts/check-docs-site.mjs).
// The site that renders docs-site reads the pages by the same rules.

/**
 * @typedef {{ title?: string, description?: string, packages?: string[], license?: string }} FrontMatter
 */

/**
 * Splits `---` front matter off a page. The keys are `key: value` lines; a value is a bare or
 * quoted string, or a JSON array of strings. The body keeps its own bytes.
 * @param {string} source
 * @returns {{ data: FrontMatter, body: string, errors: string[] }}
 */
export function splitFrontMatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source, errors: ["no front matter"] };
  /** @type {Record<string, unknown>} */
  const data = {};
  const errors = [];
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) {
      errors.push(`front matter line not understood: ${line}`);
      continue;
    }
    const [, key, raw] = pair;
    const value = raw.trim();
    if (value.startsWith("[")) {
      try {
        const list = JSON.parse(value);
        if (!Array.isArray(list) || list.some((item) => typeof item !== "string"))
          throw new Error("not a list of strings");
        data[key] = list;
      } catch {
        errors.push(`front matter \`${key}\` is not a JSON list of strings`);
      }
    } else if (/^".*"$/.test(value)) {
      try {
        data[key] = JSON.parse(value);
      } catch {
        errors.push(`front matter \`${key}\` is not one quoted string: ${value}`);
      }
    } else if (/^'.*'$/.test(value)) {
      data[key] = value.slice(1, -1);
    } else data[key] = value;
  }
  errors.push(...frontMatterErrors(data));
  return { data: /** @type {FrontMatter} */ (data), body: source.slice(match[0].length), errors };
}

/**
 * What a page's front matter must hold: a title and a one-sentence description as text, packages
 * as a list of names, license MIT or Commercial.
 * @param {Record<string, unknown>} data
 * @returns {string[]}
 */
export function frontMatterErrors(data) {
  const errors = [];
  for (const key of ["title", "description"]) {
    if (data[key] === undefined || data[key] === "") errors.push(`front matter has no ${key}`);
    else if (typeof data[key] !== "string") errors.push(`front matter \`${key}\` is not text`);
  }
  if (typeof data.description === "string" && /`|\]\(|\*\*|__/.test(data.description))
    errors.push("front matter `description` holds Markdown");
  if (
    data.packages !== undefined &&
    (!Array.isArray(data.packages) || data.packages.some((name) => typeof name !== "string"))
  )
    errors.push("front matter `packages` is not a list of package names");
  if (data.license !== undefined && data.license !== "MIT" && data.license !== "Commercial")
    errors.push(
      `front matter \`license\` is ${JSON.stringify(data.license)}, not MIT or Commercial`,
    );
  return errors;
}

/**
 * The id of a heading, as GitHub writes it, so `/docs/page#anchor` links in the sources stay
 * valid on GitHub too: lower case (locale-free, Cyrillic included), punctuation dropped,
 * each space a hyphen.
 * @param {string} text
 */
export function headingSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Unique heading ids within one page: the second "Usage" becomes `usage-1`. */
export function createSlugger() {
  /** @type {Map<string, number>} */
  const seen = new Map();
  return (/** @type {string} */ text) => {
    const base = headingSlug(text) || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

/** The fence language of a live demo. */
export const DEMO_LANGUAGE = "demo";

/**
 * The demo names listed in docs-site/README.md («Names: `block-editor`, …»): the names a page's
 * `demo` block may use.
 * @param {string} readme
 * @returns {string[]}
 */
export function readmeDemoNames(readme) {
  const flat = readme.replace(/\s+/g, " ");
  const list = /Names: (.*?)\. At most one per page/.exec(flat);
  if (!list) return [];
  return [...list[1].matchAll(/`([a-z0-9-]+)`/g)].map((match) => match[1]);
}

/**
 * An internal docs link (`/docs/page` or `/docs/page#anchor`, or `#anchor` on the same page),
 * split into its page slug and anchor; null for any other link.
 * @param {string} href
 * @param {string} currentSlug
 * @returns {{ slug: string, anchor: string } | null}
 */
export function internalTarget(href, currentSlug) {
  if (href.startsWith("#")) return { slug: currentSlug, anchor: decodeAnchor(href.slice(1)) };
  const match = /^\/docs\/([^#?]*?)\/?(?:#(.*))?$/.exec(href);
  if (!match) return null;
  return { slug: match[1], anchor: match[2] ? decodeAnchor(match[2]) : "" };
}

/** A percent-encoded anchor as text; a malformed one (`#100%`) stays as written. */
function decodeAnchor(/** @type {string} */ anchor) {
  try {
    return decodeURIComponent(anchor);
  } catch {
    return anchor;
  }
}

/**
 * The text of a block's content on one line, a hard break ("\n") read as a space: for anchors.
 * @param {unknown} content rich text spans, raw text or null
 * @returns {string}
 */
export function plainText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((span) => String(span.text).replace(/\n/g, " ")).join("");
}
