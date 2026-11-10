import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cyclesOf, importsOf } from "./imports.mjs";
import { lineCount, productionFiles, read, relative, resolveLocal, root } from "./sources.mjs";

export function checkBudgets(files, baseline, strict = false) {
  const errors = [];
  const directories = new Map();
  const seen = new Set();
  for (const { name, source } of files) {
    seen.add(name);
    const lines = lineCount(source);
    const allowance = strict ? 600 : (baseline.files[name] ?? 600);
    if (lines > allowance)
      errors.push(`${name}: ${lines} lines exceeds ${allowance}; extract a responsibility`);
    if (!strict && baseline.files[name] && lines < baseline.files[name]) {
      errors.push(
        `${name}: lower/remove stale size baseline ${baseline.files[name]} to ${Math.max(600, lines)}`,
      );
    }
    const directory = path.posix.dirname(name);
    directories.set(directory, (directories.get(directory) ?? 0) + 1);
  }
  for (const [name, count] of directories) {
    const allowance = strict ? 24 : (baseline.directories[name] ?? 24);
    if (count > allowance) errors.push(`${name}: ${count} direct code files exceeds ${allowance}`);
    if (!strict && baseline.directories[name] && count < baseline.directories[name]) {
      errors.push(`${name}: lower/remove stale directory baseline to ${Math.max(24, count)}`);
    }
  }
  for (const name of Object.keys(baseline.files)) {
    if (!seen.has(name)) errors.push(`${name}: remove deleted file from baseline`);
  }
  return errors;
}

const packageOf = (name) => name.match(/^packages\/([^/]+)\//)?.[1];
const framework = /^(?:react(?:-dom)?(?:\/.*)?|vue|svelte(?:\/.*)?|solid-js(?:\/.*)?)$/;
const uiPackages = new Set([
  "react",
  "vue",
  "svelte",
  "solid",
  "block-editor",
  "block-editor-vue",
  "ai-ui",
]);

export function checkImports(files) {
  const errors = [];
  const graph = new Map();
  const packages = new Map();
  const filenames = new Set(files.map((entry) => entry.name));
  for (const { name, source } of files) {
    if (!/\.[cm]?[jt]sx?$/.test(name)) continue;
    const owner = packageOf(name);
    const edges = [];
    for (const specifier of importsOf(name, source)) {
      if (specifier.startsWith(".")) {
        const resolved = resolveLocal(path.join(root, name), specifier);
        if (!resolved) continue; // tsc validates unresolved/type-only/asset imports.
        const target = relative(resolved);
        if (filenames.has(target)) edges.push(target);
        if (
          owner &&
          (target.startsWith("apps/") || (packageOf(target) && packageOf(target) !== owner))
        ) {
          errors.push(`${name}: use the public package entry instead of ${specifier}`);
        }
        continue;
      }
      if (!owner) continue;
      if (specifier.startsWith("@gotipe/")) {
        const target = specifier.split("/")[1];
        if (!packages.has(owner)) packages.set(owner, []);
        if (target !== owner) packages.get(owner).push(target);
        const allowedHeadless = owner === "core" ? ["wasm", "markdown"] : [];
        if (["core", "markdown", "sdk"].includes(owner) && !allowedHeadless.includes(target)) {
          errors.push(`${name}: headless ${owner} cannot import ${specifier}`);
        }
      } else if (framework.test(specifier)) {
        if (!uiPackages.has(owner))
          errors.push(`${name}: framework import outside adapter/UI: ${specifier}`);
      } else if (
        specifier.startsWith("shiki/") &&
        name === "packages/block-editor/src/highlight/shiki.ts"
      ) {
        // Explicit optional host adapter; kept out of the main/core entry.
      } else if (name === "packages/export-wasm/node.js" && specifier === "node:fs/promises") {
        // Native platform file loading is isolated in the Node condition of the optional exporter.
      } else {
        errors.push(`${name}: unapproved runtime dependency ${specifier}`);
      }
    }
    graph.set(name, edges);
  }
  for (const cycle of cyclesOf(graph)) errors.push(`Runtime import cycle: ${cycle.join(" → ")}`);
  for (const cycle of cyclesOf(packages))
    errors.push(`Runtime package cycle: ${cycle.join(" → ")}`);
  return errors;
}

export function checkManifest(manifest) {
  const errors = [];
  const owner = manifest.name?.replace("@gotipe/", "");
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    for (const dependency of Object.keys(manifest[field] ?? {})) {
      if (dependency.startsWith("@gotipe/")) continue;
      if (field === "peerDependencies" && framework.test(dependency) && uiPackages.has(owner))
        continue;
      if (
        owner === "block-editor" &&
        dependency === "shiki" &&
        field === "peerDependencies" &&
        manifest.peerDependenciesMeta?.shiki?.optional
      )
        continue;
      errors.push(`${manifest.name}: unapproved ${field} ${dependency}`);
    }
  }
  return errors;
}

export function main() {
  const strict = process.argv.includes("--release");
  const baseline = JSON.parse(
    readFileSync(path.join(root, "config/architecture-baseline.json"), "utf8"),
  );
  const files = productionFiles().map((file) => ({ name: relative(file), source: read(file) }));
  const manifests = readdirSync(path.join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      JSON.parse(readFileSync(path.join(root, "packages", entry.name, "package.json"), "utf8")),
    );
  const errors = [
    ...checkBudgets(files, baseline, strict),
    ...checkImports(files),
    ...manifests.flatMap((manifest) => checkManifest(manifest)),
  ];
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      `Architecture: ${files.length} production files; boundaries/cycles/budgets passed${strict ? " (release: no debt)" : ""}.`,
    );
    if (!strict && Object.keys(baseline.files).length) {
      console.log(
        `Recorded release debt: ${Object.keys(baseline.files).length} oversized files; see R-014.`,
      );
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main();
