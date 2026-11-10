import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const root = path.resolve(import.meta.dirname, "../..");
const excluded = new Set([
  "node_modules",
  "dist",
  "dist-wiki",
  "target",
  "pkg",
  "output",
  "tests",
  "__tests__",
  "benches",
  "fixtures",
]);
const code = /\.(?:[cm]?[jt]sx?|rs|go|css)$/;

export function sourceFiles(directory = root) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || excluded.has(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...sourceFiles(filename));
    else if (
      code.test(entry.name) &&
      !/(?:\.test|\.spec|\.d)\.[^.]+$|_test\.go$/.test(entry.name)
    ) {
      result.push(filename);
    }
  }
  return result.sort();
}

export function productionFiles() {
  return ["packages", "crates", "apps/playground/src", "apps/cloud"]
    .flatMap((entry) => sourceFiles(path.join(root, entry)))
    .filter(
      (file) =>
        !file.endsWith("/build.rs") &&
        (file.includes("/src/") ||
          file.includes("/apps/cloud/") ||
          (relative(file).startsWith("packages/") &&
            !/\/(?:[^/]*\.config|vitest\.setup)\.[cm]?[jt]s$/.test(file))),
    );
}

export const relative = (filename) => path.relative(root, filename).split(path.sep).join("/");
export const read = (filename) => readFileSync(filename, "utf8");
export const lineCount = (source) => source.replace(/\n$/, "").split("\n").length;

export function resolveLocal(from, specifier) {
  const target = path.resolve(path.dirname(from), specifier);
  const base = target.replace(/\.(?:[cm]?js|jsx)$/, "");
  return [
    target,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(target, "index.ts"),
    path.join(target, "index.tsx"),
  ].find((file) => existsSync(file) && /\.(?:[cm]?[jt]sx?)$/.test(file));
}
