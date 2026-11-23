// A host's own parts: a host of the library draws its pages over the library's parts. Its files
// sit in src/ beside the library's, and src/host.json names them (this repository has none):
//   tokens  — its token files, after the library's: with them, the only parts with literal values
//   styles  — its stylesheets, after the library's
//   icons   — its sprites, after the library's icons.svg
//   figures — its figures: the page then holds these alone, drawn with every style
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const KEYS = ["tokens", "styles", "icons", "figures"];

/**
 * @typedef {{ tokens: string[], styles: string[], icons: string[], figures: string[] }} Parts
 */

/**
 * A host as host.json writes it, checked: each key a list of part names, at least one figure.
 * @param {string} text
 * @returns {Parts}
 */
export function parseHost(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("host.json: not an object");
  for (const key of Object.keys(data))
    if (!KEYS.includes(key)) throw new Error(`host.json: unknown key \`${key}\``);
  /** @type {Record<string, string[]>} */
  const host = {};
  for (const key of KEYS) {
    const list = data[key] ?? [];
    if (!Array.isArray(list) || list.some((name) => typeof name !== "string" || !name))
      throw new Error(`host.json: \`${key}\` is not a list of part names`);
    host[key] = list;
  }
  if (!host.figures.length) throw new Error("host.json: `figures` names no figure");
  return /** @type {Parts} */ (host);
}

/** The host of the atlas in `src`, or null when the atlas is the library's alone. */
export function readHost(/** @type {string} */ src) {
  const file = path.join(src, "host.json");
  return existsSync(file) ? parseHost(readFileSync(file, "utf8")) : null;
}

/**
 * The parts of the page in their order: the library's alone, or with a host's after them. Every
 * token file comes before the other styles.
 * @param {Parts} library
 * @param {Parts | null} host
 * @returns {Parts}
 */
export function partsOf(library, host) {
  const tokens = [...library.tokens, ...(host?.tokens ?? [])];
  return {
    tokens,
    styles: [...tokens, ...library.styles, ...(host?.styles ?? [])],
    icons: [...library.icons, ...(host?.icons ?? [])],
    figures: host ? host.figures : library.figures,
  };
}
