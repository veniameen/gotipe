import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { importedPackages, registryProblems } from "./registry.mjs";
import { caretAccepts, rangeProblems } from "./releases.mjs";

test("a caret range takes releases as npm reads it", () => {
  assert.equal(caretAccepts("^0.1.5", "0.1.5"), true);
  assert.equal(caretAccepts("^0.1.5", "0.1.9"), true);
  assert.equal(caretAccepts("^0.1.5", "0.1.4"), false);
  assert.equal(caretAccepts("^0.1.5", "0.2.0"), false);
  assert.equal(caretAccepts("^1.2.3", "1.9.0"), true);
  assert.equal(caretAccepts("^1.2.3", "1.2.2"), false);
  assert.equal(caretAccepts("^1.2.3", "2.0.0"), false);
  assert.equal(caretAccepts("^0.0.3", "0.0.4"), false);
  assert.equal(caretAccepts("~0.1.5", "0.1.5"), false, "only caret ranges are read");
  assert.equal(caretAccepts("^0.1.5", "0.1.6-beta.1"), false, "prereleases are not releases");
});

test("a starter range that misses the latest release is reported", async () => {
  const latest = async (name) => (name === "@gotipe/core" ? "0.2.0" : "0.1.9");
  const problems = await rangeProblems(
    [
      {
        name: "demo",
        manifest: {
          dependencies: { "@gotipe/core": "^0.1.5", "@gotipe/react": "^0.1.5", react: "^19.0.0" },
        },
      },
    ],
    latest,
  );
  assert.deepEqual(problems, ["examples/demo: @gotipe/core ^0.1.5 does not take the latest 0.2.0"]);
});

test("imported packages are read from bare specifiers only", () => {
  const source = `"use client";
import { A } from "@gotipe/block-editor";
import type { B } from "@gotipe/core";
import { C } from "@gotipe/core/presets";
import {
  D,
  E,
} from "react";
import "@gotipe/theme/base.css";
import { F } from "./local";
import { G } from "@/components/g";
import path from "node:path";
`;
  assert.deepEqual([...importedPackages(source)].sort(), [
    "@gotipe/block-editor",
    "@gotipe/core",
    "@gotipe/theme",
    "react",
  ]);
});

test("the registry reports missing files, undeclared imports and starter drift", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gotipe-registry-"));
  try {
    mkdirSync(path.join(root, "examples/demo/components"), { recursive: true });
    writeFileSync(
      path.join(root, "examples/demo/package.json"),
      JSON.stringify({
        dependencies: { "@gotipe/core": "^0.1.5", "@gotipe/wasm": "^0.1.2", react: "^19" },
      }),
    );
    writeFileSync(
      path.join(root, "examples/demo/components/editor.tsx"),
      'import { useEditor } from "@gotipe/react";\nimport type { Document } from "@gotipe/core";\n',
    );
    const item = (overrides) => ({
      name: "editor",
      type: "registry:component",
      title: "Editor",
      description: "An editor.",
      dependencies: ["@gotipe/core", "@gotipe/wasm"],
      files: [{ path: "examples/demo/components/editor.tsx", type: "registry:component" }],
      ...overrides,
    });
    const write = (items) =>
      writeFileSync(
        path.join(root, "registry.json"),
        JSON.stringify({
          $schema: "https://ui.shadcn.com/schema/registry.json",
          name: "demo",
          homepage: "https://example.com",
          items,
        }),
      );

    write([item({})]);
    assert.deepEqual(registryProblems(root), [
      "registry.json item editor: examples/demo/components/editor.tsx imports @gotipe/react, which dependencies do not list",
    ]);

    write([item({ dependencies: ["@gotipe/core", "@gotipe/react@0.1.5"] })]);
    assert.deepEqual(registryProblems(root).sort(), [
      "registry.json item editor: @gotipe/react@0.1.5 is not a dependency of demo",
      "registry.json item editor: @gotipe/react@0.1.5 pins a version; items install the latest release",
      "registry.json item editor: demo depends on @gotipe/wasm, which the item does not install",
      "registry.json item editor: examples/demo/components/editor.tsx imports @gotipe/react, which dependencies do not list",
    ]);

    write([item({ files: [{ path: "examples/demo/missing.tsx", type: "registry:component" }] })]);
    assert.deepEqual(registryProblems(root), [
      "registry.json item editor: examples/demo/missing.tsx does not exist",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
