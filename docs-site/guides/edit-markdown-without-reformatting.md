---
title: Edit a Markdown file without reformatting it
description: Change one paragraph in a Markdown file with GoTipe and verify that the front matter, list markers, line endings and every untouched byte survive the edit.
packages: ["@gotipe/markdown"]
license: MIT
---

A release note in Git needs one word changed from `queued` to `ready`. Its author used a Setext heading, spaced list markers and Windows line endings. The reviewer should see one changed line. GoTipe's Markdown snapshot records the original source alongside the parsed blocks so a save can reuse the author's spelling and spacing.

This example reads a UTF-8 file and writes the revision to a new path. It uses Node.js and the published Markdown package. The final check compares the entire output against the exact bytes the edit should produce.

## Make a file with details worth preserving

Start in an empty directory. The script creates a UTF-8 byte order mark, YAML front matter, a Setext heading, two list items and CRLF line endings. Writing the fixture in JavaScript makes those details reproducible in any text editor.

```sh
npm init -y
npm install --save-exact @gotipe/markdown@0.1.3
```

```js title="make-note.mjs"
import { writeFileSync } from "node:fs";

const lines = [
  "---",
  'team: "Docs"',
  "---",
  "",
  "Release notes",
  "=============",
  "",
  "*   Check the résumé",
  "*   Package the build",
  "",
  "Status: queued.",
  "",
];

writeFileSync("release.md", "\uFEFF" + lines.join("\r\n"), { flag: "wx" });
```

## Change the parsed paragraph and save with its snapshot

The script looks for a status paragraph with a single text span and requires exactly one match. A mention of the same words inside a heading or code block stays untouched. It keeps the block's ID, attributes and marks. The serializer can then match the other blocks to their original source ranges.

```js title="edit-status.mjs"
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { parseMarkdown, serializeMarkdown } from "@gotipe/markdown";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error("Usage: node edit-status.mjs input.md output.md");
}

const { doc, snapshot } = parseMarkdown(readFileSync(input, "utf8"));
const matches = doc.blocks.filter(
  (block) =>
    block.type === "paragraph" &&
    Array.isArray(block.content) &&
    block.content.length === 1 &&
    block.content[0].text === "Status: queued.",
);
assert.equal(matches.length, 1, "Expected one queued status paragraph");

const status = matches[0];
const revised = {
  ...doc,
  blocks: doc.blocks.map((block) =>
    block.id === status.id
      ? { ...block, content: [{ ...status.content[0], text: "Status: ready." }] }
      : block,
  ),
};
const saved = serializeMarkdown(revised, snapshot);
writeFileSync(output, saved.text, { flag: "wx" });
```

Run the two scripts. The exclusive write flag keeps an existing input or output file from being overwritten.

```sh
node make-note.mjs
node edit-status.mjs release.md release-updated.md
```

## Compare the bytes that Git will see

Build the expected result independently from the input by replacing its one status string. Comparing buffers checks the BOM, the accented letters, both bytes of each CRLF and the final newline along with the visible text.

```js title="check-edit.mjs"
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const before = readFileSync("release.md", "utf8");
const after = readFileSync("release-updated.md");
const expected = before.replace("Status: queued.", "Status: ready.");
assert.deepEqual(after, Buffer.from(expected, "utf8"));
console.log("Only the status changed.");
```

```sh
node check-edit.mjs
```

The check prints `Only the status changed.` Try changing the spacing of an untouched list marker in the output before running the check again. The byte comparison will catch it even though the list still renders the same way.

## Keep the snapshot for the next save

In a longer editing session, store `saved.snapshot` alongside the revised document for the next serialization. Front matter lives in the snapshot. A changed block can be rewritten in the serializer's preferred syntax, so put byte-preservation assertions around the parts your application promises to leave untouched. The same codec can save the document from a live editor with `serializeMarkdown(editor.getJSON(), snapshot)`. [Markdown snapshots and editor integration](/docs/conversion/markdown)
