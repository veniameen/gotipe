import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { optionalPeerProblems } from "./optional-peers.mjs";

/** Checks a fixture package whose optional peer is `engine`. */
function check(files, exports = { ".": "./dist/index.js" }) {
  const dir = mkdtempSync(path.join(tmpdir(), "gotipe-optional-peer-fixture-"));
  try {
    for (const [file, source] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), source);
    }
    const manifest = {
      name: "fixture",
      type: "module",
      exports,
      dependencies: { "fixture-dependency": "^1.0.0" },
      peerDependencies: { engine: "^1.0.0" },
      peerDependenciesMeta: { engine: { optional: true } },
    };
    return optionalPeerProblems({ dir, manifest, files: Object.keys(files) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("import() or require() written directly inside try is optional", () => {
  for (const source of [
    `import "fixture-dependency";
export async function load() {
  try {
    return await import("engine");
  } catch (error) {
    throw new Error("engine could not be loaded", { cause: error });
  }
}`,
    `export const load = async () => {
  let engine;
  try {
    engine = await import("engine/sub");
  } catch {
    try { engine = null; } finally { }
  }
  return engine;
};`,
    `exports.load = () => { try { return require("engine"); } catch { return null; } };`,
    `try { try { await import("fixture-dependency"); } catch { await import("engine"); } } catch {}`,
  ]) {
    assert.deepEqual(
      check({ "dist/index.js": source }),
      { peers: ["engine"], entries: 1, problems: [] },
      source,
    );
  }
});

test("a reference webpack and Turbopack cannot leave out is reported with its line", () => {
  for (const [source, line] of [
    [`export const load = () => import("engine").then((engine) => engine).catch(() => null);`, 1],
    ["export async function load() {\n  return await import('engine');\n}", 2],
    [
      `const call = (load) => load();\nexport function load() { try { return call(() => import("engine")); } catch { return null; } }`,
      2,
    ],
    [`export function load() {\n  try { return 1; } catch { return import("engine"); }\n}`, 2],
    [`export function load() {\n  try { return 1; } finally { require("engine"); }\n}`, 2],
    [`export { start } from "engine";`, 1],
    [`try { await import("fixture-dependency"); } catch { await import("engine"); }`, 1],
  ]) {
    const { problems } = check({ "dist/index.js": source });
    assert.equal(problems.length, 1, source);
    assert.match(
      problems[0],
      new RegExp(`^dist/index\\.js:${line} requires the optional peer engine`),
    );
  }
});

test("the graph of every JS target is followed; an entry named after the peer may need it", () => {
  const { entries, problems } = check(
    {
      "dist/index.js": `import { ready } from "./chunk.js";\nexport { ready };`,
      "dist/chunk.js": `export const ready = () => import("./lazy.js");`,
      "dist/lazy.js": `export * from "engine";`,
      "dist/index.cjs": "exports.ready = true;",
      "dist/engine.js": `export { default } from "engine";`,
    },
    {
      ".": { import: "./dist/index.js", require: "./dist/index.cjs" },
      "./engine": "./dist/engine.js",
      "./styles.css": "./dist/styles.css",
    },
  );
  assert.equal(entries, 3);
  assert.deepEqual(problems, [
    "dist/lazy.js:1 requires the optional peer engine for dist/index.js: webpack and Turbopack fail without it. Load it with import() written directly inside a try block.",
  ]);
});

test("a file the graph reaches but npm does not pack is reported", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gotipe-optional-peer-fixture-"));
  try {
    mkdirSync(path.join(dir, "dist"));
    writeFileSync(path.join(dir, "dist/index.js"), `export * from "./missing.js";`);
    const manifest = {
      exports: "./dist/index.js",
      peerDependencies: { engine: "^1.0.0" },
      peerDependenciesMeta: { engine: { optional: true } },
    };
    assert.deepEqual(optionalPeerProblems({ dir, manifest, files: ["dist/index.js"] }).problems, [
      "dist/index.js reaches dist/missing.js, which is not packed",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
