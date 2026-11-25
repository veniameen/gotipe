import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// An optional peer has to stay optional for the bundler of an app that leaves it out.
// webpack and Turbopack, the bundlers of Next.js, resolve every import they meet while
// building and let one fail only when the import() or require() is written directly inside a
// try block: not in its catch or finally, not in a callback the block calls, and a .catch() on
// the promise does not count. esbuild and Rolldown accept more, so they cannot stand in for
// this rule. The check follows the import graph of every JS entry through the packed files and
// holds each reference to an optional peer to it.

/** The peers a manifest marks optional. */
export function optionalPeers(manifest) {
  return Object.entries(manifest.peerDependenciesMeta ?? {})
    .filter(([, meta]) => meta?.optional)
    .map(([name]) => name);
}

/** JS files of the exports map with their subpath; wildcards and declarations aside. */
function jsEntries(manifest) {
  const entries = new Map();
  const visit = (subpath, value) => {
    if (typeof value === "string") {
      if (/\.(?:mjs|cjs|js)$/.test(value)) entries.set(path.posix.normalize(value), subpath);
    } else if (value && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        visit(key.startsWith(".") ? key : subpath, inner);
      }
    }
  };
  visit(".", manifest.exports);
  return [...entries]
    .filter(([, subpath]) => !subpath.includes("*"))
    .map(([file, subpath]) => ({ file, subpath }));
}

/** Whether a node sits in the try block of a try statement of its own function. */
function insideTry(node) {
  for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
    if (ts.isFunctionLike(parent) || ts.isClassStaticBlockDeclaration(parent)) return false;
    if (ts.isTryStatement(parent) && parent.tryBlock === child) return true;
  }
  return false;
}

/** Module references of a file: static imports and re-exports, import() and require(). */
function referencesOf(file, code) {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const references = [];
  const scan = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      references.push({ specifier: node.moduleSpecifier.text, node, call: false });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      references.push({ specifier: node.arguments[0].text, node, call: true });
    }
    ts.forEachChild(node, scan);
  };
  scan(source);
  return references.map(({ specifier, node, call }) => ({
    specifier,
    optional: call && insideTry(node),
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
  }));
}

/**
 * Checks every JS entry of a package against the bundlers' rule for its optional peers. An
 * entry named after a peer, such as `./shiki`, exists to load that peer and may require it.
 * @param {{ dir: string, manifest: Record<string, any>, files: Iterable<string> }} pkg
 *   `files` are the paths npm packs, relative to `dir`.
 * @returns {{ peers: string[], entries: number, problems: string[] }}
 */
export function optionalPeerProblems({ dir, manifest, files }) {
  const peers = optionalPeers(manifest);
  if (!peers.length) return { peers, entries: 0, problems: [] };
  const packed = new Set([...files].map((file) => path.posix.normalize(file)));
  const cache = new Map();
  const referencesIn = (file) => {
    if (!cache.has(file))
      cache.set(file, referencesOf(file, readFileSync(path.join(dir, file), "utf8")));
    return cache.get(file);
  };
  const problems = new Set();
  const entries = jsEntries(manifest);
  for (const { file: entry, subpath } of entries) {
    const checked = peers.filter((peer) => subpath !== `./${peer}`);
    const seen = new Set();
    const visit = (file) => {
      if (seen.has(file)) return;
      seen.add(file);
      if (!packed.has(file)) {
        problems.add(`${entry} reaches ${file}, which is not packed`);
        return;
      }
      if (!/\.(?:mjs|cjs|js)$/.test(file)) return;
      for (const { specifier, optional, line } of referencesIn(file)) {
        if (specifier.startsWith(".")) {
          visit(path.posix.join(path.posix.dirname(file), specifier));
          continue;
        }
        const peer = checked.find((name) => specifier === name || specifier.startsWith(`${name}/`));
        if (peer && !optional) {
          problems.add(
            `${file}:${line} requires the optional peer ${specifier} for ${entry}: webpack and Turbopack fail without it. Load it with import() written directly inside a try block.`,
          );
        }
      }
    };
    visit(entry);
  }
  return { peers, entries: entries.length, problems: [...problems] };
}
