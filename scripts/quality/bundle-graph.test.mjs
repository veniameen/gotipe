import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { checkComments, keptComments } from "./bundle-comments.mjs";
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

test("comments esbuild keeps inside expressions and class bodies are found; statements, annotations and strings are not", () => {
  const code = [
    "// src/index.ts",
    "var A = class {",
    "  /** member */",
    "  m() {",
    "    // statement",
    "    return 1;",
    "  }",
    "};",
    "var o = {",
    "  /** property */",
    "  a: [",
    "    // element",
    "    1",
    "  ],",
    "  b: f(",
    "    /* argument */",
    "    2",
    "  ),",
    "  c: /* @__PURE__ */ g(),",
    "  d: `// not ${'/* a */'} comment`,",
    "  e: /\\/\\*x/,",
    "};",
    "/*! legal */",
    "//# sourceMappingURL=index.js.map",
  ].join("\n");
  assert.deepEqual(
    keptComments(code).map(({ line, text }) => [line, text]),
    [
      [3, "/** member */"],
      [10, "/** property */"],
      [12, "// element"],
      [16, "/* argument */"],
    ],
  );
});

test("a package fails above its known count of kept comments and when the count can be lowered", () => {
  const comment = { file: "a/dist/index.js", line: 1, text: "/** a */" };
  const comments = new Map([
    ["@gotipe/a", [comment]],
    ["@gotipe/b", []],
    ["@gotipe/c", [comment]],
  ]);
  const errors = checkComments(comments, { "@gotipe/b": 1, "@gotipe/c": 1, "@gotipe/gone": 1 });
  assert.equal(errors.length, 3);
  assert.match(errors.join("\n"), /@gotipe\/gone: no build/);
  assert.match(
    errors.join("\n"),
    /@gotipe\/a: 1 comments inside[\s\S]*a\/dist\/index\.js:1 \/\*\* a \*\//,
  );
  assert.match(errors.join("\n"), /@gotipe\/b: 0 kept comments, fewer than the known 1/);
});
