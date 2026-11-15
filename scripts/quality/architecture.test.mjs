import assert from "node:assert/strict";
import test from "node:test";
import { checkBudgets, checkImports, checkManifest, checkPlatformCalls } from "./architecture.mjs";
import { cyclesOf, importsOf } from "./imports.mjs";

test("runtime imports include side effects and lazy imports but exclude type-only edges", () => {
  assert.deepEqual(
    importsOf(
      "sample.ts",
      `
    import type { A } from "./a";
    import { type B } from "./b";
    import "./effect";
    export type { C } from "./c";
    export { type D } from "./d";
    export { E } from "./e";
    const load = () => import("./lazy");
    const x = require("./cjs");
  `,
    ),
    ["./effect", "./e", "./lazy", "./cjs"],
  );
});
test("cycles distinguish real runtime loops from diamonds", () => {
  assert.deepEqual(
    cyclesOf(
      new Map([
        ["a", ["b", "c"]],
        ["b", ["c"]],
        ["c", []],
      ]),
    ),
    [],
  );
  assert.deepEqual(
    cyclesOf(
      new Map([
        ["a", ["b"]],
        ["b", ["a"]],
      ]),
    ),
    [["a", "b"]],
  );
});
test("size debt cannot grow, remain stale or bypass release check", () => {
  const files = [{ name: "packages/core/src/large.ts", source: "x\n".repeat(650) }];
  const baseline = { files: { [files[0].name]: 650 }, directories: {} };
  assert.equal(checkBudgets(files, baseline).length, 0);
  assert.equal(checkBudgets(files, baseline, true).length, 1);
  assert.equal(checkBudgets([{ ...files[0], source: "x\n".repeat(651) }], baseline).length, 1);
  assert.equal(checkBudgets([{ ...files[0], source: "x\n".repeat(649) }], baseline).length, 1);
});
test("core cannot import UI or an external utility; adapter peers are allowed", () => {
  assert.equal(
    checkImports([
      {
        name: "packages/core/src/x.ts",
        source: 'import "react"; import "@gotipe/react"; import "tiny-lib";',
      },
    ]).length,
    3,
  );
  assert.equal(
    checkImports([
      { name: "packages/react/src/x.tsx", source: 'import "react"; import "@gotipe/core";' },
    ]).length,
    0,
  );
});
test("only the Node conditions of the WASM packages read files", () => {
  const nodeEntry = 'import { readFile } from "node:fs/promises";';
  for (const name of ["packages/wasm/node.js", "packages/export-wasm/node.js"])
    assert.deepEqual(checkImports([{ name, source: nodeEntry }]), []);
  for (const name of ["packages/core/src/wasm-loader.ts", "packages/wasm/src/index.ts"])
    assert.equal(checkImports([{ name, source: nodeEntry }]).length, 1);
  assert.equal(
    checkImports([{ name: "packages/wasm/node.js", source: 'import "node:child_process";' }])
      .length,
    1,
  );
});
test("third-party parser cannot be reintroduced even before release", () => {
  const files = [
    { name: "packages/markdown/src/parse.ts", source: 'import "mdast-util-from-markdown";' },
  ];
  assert.equal(checkImports(files).length, 1);
  assert.equal(checkImports(files, true).length, 1);
});

test("unused dependencies and optional runtime utilities cannot bypass policy", () => {
  assert.equal(
    checkManifest({ name: "@gotipe/sdk", optionalDependencies: { "tiny-lib": "1" } }).length,
    1,
  );
  assert.equal(checkManifest({ name: "@gotipe/react", dependencies: { react: "19" } }).length, 1);
  assert.equal(
    checkManifest({ name: "@gotipe/react", peerDependencies: { react: ">=18" } }).length,
    0,
  );
});

test("public entrypoints cannot hide a package runtime cycle", () => {
  assert.equal(
    checkImports([
      { name: "packages/comments/src/x.ts", source: 'import "@gotipe/versions";' },
      { name: "packages/versions/src/x.ts", source: 'import "@gotipe/comments";' },
    ]).filter((error) => error.startsWith("Runtime package cycle")).length,
    1,
  );
});
test("IDs come from createId: crypto.randomUUID is missing on plain HTTP", () => {
  const call = "const id = crypto.randomUUID();";
  assert.equal(
    checkPlatformCalls([{ name: "packages/comments/src/manager.ts", source: call }]).length,
    1,
  );
  assert.equal(
    checkPlatformCalls([{ name: "packages/core/src/document/id.ts", source: call }]).length,
    0,
  );
  // a mention in a comment and code outside the packages are not calls of a package
  assert.equal(
    checkPlatformCalls([
      { name: "packages/core/src/polyfills.ts", source: "// crypto.randomUUID needs HTTPS" },
      { name: "apps/playground/src/main.ts", source: call },
    ]).length,
    0,
  );
});
