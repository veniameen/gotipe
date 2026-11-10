import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { measureClosure } from "./bundle-graph.mjs";

test("entry shells cannot hide shared chunks, named lazy imports, or workspace dependencies", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gotipe-bundle-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = {
    "index.js":
      'export * from "./shared.js"; import "./shared.js"; import("./lazy.js"); import "@gotipe/markdown"; import "react";',
    "shared.js": 'export const large = "a".repeat(10000);',
    "lazy.js": "export const lazy = true;",
    "markdown.js": "export const parser = true;",
  };
  for (const [name, content] of Object.entries(source))
    fs.writeFileSync(path.join(root, name), content);
  const packages = new Map([
    [
      "@gotipe/markdown",
      { directory: root, manifest: { exports: { ".": { import: "./markdown.js" } } } },
    ],
  ]);
  const graph = measureClosure(root, ["index.js"], ["react"], packages);
  assert.equal(graph.files.length, 4);
  assert.equal(
    graph.gzip,
    Object.values(source).reduce((sum, content) => sum + gzipSync(content, { level: 9 }).length, 0),
  );
  assert.deepEqual(graph.externals, ["react"]);
});

test("missing or dynamically unresolvable modules fail instead of shrinking the reported graph", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gotipe-bundle-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry = path.join(root, "index.js");
  fs.writeFileSync(entry, 'import "./missing.js"');
  assert.throws(() => measureClosure(root, ["index.js"], [], new Map()), /Missing build artifact/);
  fs.writeFileSync(entry, "import(name)");
  assert.throws(
    () => measureClosure(root, ["index.js"], [], new Map()),
    /Unmeasurable dynamic import/,
  );
  fs.writeFileSync(entry, 'import "external-package"');
  assert.throws(() => measureClosure(root, ["index.js"], [], new Map()), /Unmeasured dependency/);
});
