import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SCHEMA = "https://ui.shadcn.com/schema/registry.json";
/** Packages every React project already has; an item does not install them. */
const PROJECT_PACKAGES = new Set(["react", "react-dom"]);

/**
 * registry.json makes this repository a shadcn GitHub registry
 * (`npx shadcn@latest add veniameen/gotipe/<item>`). Its items ship files of the starters in
 * `examples/`, so the starters' builds and browser checks cover exactly what an item installs.
 * Returns the problems found; an empty list means the registry is sound.
 */
export function registryProblems(root) {
  const registry = readJson(path.join(root, "registry.json"));
  const problems = [];
  if (registry.$schema !== SCHEMA) problems.push(`registry.json: $schema must be ${SCHEMA}`);
  for (const key of ["name", "homepage"]) {
    if (!registry[key]) problems.push(`registry.json: ${key} is missing`);
  }
  const names = new Set();
  for (const item of registry.items ?? []) {
    if (names.has(item.name)) problems.push(`registry.json: the name ${item.name} is repeated`);
    names.add(item.name);
    problems.push(...itemProblems(root, item));
  }
  if (names.size === 0) problems.push("registry.json: no items");
  return problems;
}

function itemProblems(root, item) {
  const label = `registry.json item ${item.name ?? "(unnamed)"}`;
  const problems = [];
  for (const key of ["name", "type", "title", "description"]) {
    if (typeof item[key] !== "string" || item[key] === "") {
      problems.push(`${label}: ${key} is missing`);
    }
  }
  const declared = new Set(item.dependencies ?? []);
  for (const dependency of declared) {
    if (dependency.lastIndexOf("@") > 0) {
      problems.push(`${label}: ${dependency} pins a version; items install the latest release`);
    }
  }
  if (!item.files?.length) problems.push(`${label}: no files`);
  for (const file of item.files ?? []) {
    const source = path.join(root, file.path);
    if ("content" in file) problems.push(`${label}: ${file.path} inlines its content`);
    if (!existsSync(source)) {
      problems.push(`${label}: ${file.path} does not exist`);
      continue;
    }
    for (const name of importedPackages(readFileSync(source, "utf8"))) {
      if (!PROJECT_PACKAGES.has(name) && !declared.has(name)) {
        problems.push(`${label}: ${file.path} imports ${name}, which dependencies do not list`);
      }
    }
    problems.push(...starterParity(root, label, file.path, declared));
  }
  return problems;
}

/**
 * An item installs the packages of the starter that holds its file: no more, so the starter's
 * build covers all of them, and no GoTipe package less, so the item builds where the starter does.
 */
function starterParity(root, label, file, declared) {
  const match = /^examples\/([^/]+)\//.exec(file);
  if (!match) return [`${label}: ${file} is not a file of a starter in examples/`];
  const starter = readJson(path.join(root, "examples", match[1], "package.json"));
  const installed = new Set(Object.keys(starter.dependencies ?? {}));
  const problems = [];
  for (const name of declared) {
    if (!installed.has(name)) problems.push(`${label}: ${name} is not a dependency of ${match[1]}`);
  }
  for (const name of installed) {
    if (name.startsWith("@gotipe/") && !declared.has(name)) {
      problems.push(`${label}: ${match[1]} depends on ${name}, which the item does not install`);
    }
  }
  return problems;
}

/** The package names of a module's bare `import … from "…"` and `import "…"` specifiers. */
export function importedPackages(source) {
  const names = new Set();
  const imports = /^\s*import\s+(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
  for (const [, specifier] of source.matchAll(imports)) {
    if (/^(?:\.|\/|@\/|node:)/.test(specifier)) continue;
    const parts = specifier.split("/");
    names.add(specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
  }
  return names;
}

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}
