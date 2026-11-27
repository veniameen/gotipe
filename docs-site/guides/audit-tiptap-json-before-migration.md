---
title: Audit saved Tiptap JSON before migrating to GoTipe
description: Run a read-only CLI on saved Tiptap documents to find custom nodes and fields that need a mapping before you switch editors.
packages: ["@gotipe/migration", "@gotipe/core"]
---

A release note can keep its bold paragraph and its heading after conversion and still lose
its approval workflow. If your Tiptap editor stores a rule such as “two people from QA must
approve” in a custom node, check what happens to that rule before you replace the editor.
The script below reads exported JSON files and prints one report per document. You can run
it on a copy of your data without starting an editor or connecting to a database.

## Start with one saved document

In an empty directory, install the versions used in this example. The script runs on Node.js
and uses the ProseMirror converter because Tiptap stores documents in that format.

```sh
npm init -y
npm install --save-exact @gotipe/migration@0.1.1 @gotipe/core@0.1.6
```

Save this fixture as `release-note.json`. The paragraph uses a built-in mark. The heading
has an extra field supplied by the application. The final block belongs to a custom Tiptap
extension.

```json title="release-note.json"
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [{ "type": "text", "text": "Ship after sign-off.", "marks": [{ "type": "bold" }] }]
    },
    {
      "type": "heading",
      "attrs": { "level": 2, "releaseOwner": "QA" },
      "content": [{ "type": "text", "text": "Approval" }]
    },
    {
      "type": "approvalGate",
      "attrs": { "team": "QA", "required": 2 },
      "content": [{ "type": "text", "text": "Release candidate" }]
    }
  ]
}
```

## Check a batch without writing to it

Save the script as `audit.mjs`. It gives you the source path of every preserved subtree
and the names of fields held outside the converted document. It also checks warnings
separately, since a warning can describe a replaced block ID.

```js title="audit.mjs"
import { readFile } from "node:fs/promises";
import { convertProseMirrorToGoTipe } from "@gotipe/migration";

const files = process.argv.slice(2);
let exitCode = 0;
if (files.length === 0) {
  console.error("Usage: node audit.mjs <document.json> [document.json ...]");
  exitCode = 2;
}

for (const file of files) {
  try {
    const source = JSON.parse(await readFile(file, "utf8"));
    const { document, preserved, unmapped, warnings } = convertProseMirrorToGoTipe(source);
    const review = preserved.length > 0 || unmapped.length > 0 || warnings.length > 0;
    console.log(JSON.stringify({
      file,
      status: review ? "review" : "ready-for-validation",
      topLevelBlocks: document.blocks.length,
      preserved: preserved.map(({ path, sourceType }) => ({ path, sourceType })),
      unmapped: unmapped.map(({ path, fields }) => ({ path, keys: Object.keys(fields) })),
      warnings
    }));
    if (review) exitCode = Math.max(exitCode, 1);
  } catch (error) {
    console.error(JSON.stringify({ file, status: "error", message: error.message }));
    exitCode = 2;
  }
}
process.exitCode = exitCode;
```

```sh
node audit.mjs release-note.json
```

The sample returns exit code `1` and the following report, formatted here for readability.
Pass several filenames or a shell glob to check a batch. Exit code `0` means every file is
ready for schema validation. Exit code `2` means at least one file could not be read, parsed
or converted, or no filename was supplied. An error in one file leaves the rest of the batch
available for inspection.

```json
{
  "file": "release-note.json",
  "status": "review",
  "topLevelBlocks": 3,
  "preserved": [{ "path": "content[2]", "sourceType": "approvalGate" }],
  "unmapped": [{ "path": "content[1].attrs", "keys": ["releaseOwner"] }],
  "warnings": [
    "ProseMirror/Tiptap content[2]: Unknown node approvalGate; source preserved as markdownRaw",
    "ProseMirror/Tiptap content[1].attrs: heading field releaseOwner does not fit the GoTipe schema; kept in unmapped"
  ]
}
```

## Compare a document with only standard content

Save a plain paragraph as `plain-note.json` and run the same audit. This fixture can proceed to schema validation.

```json title="plain-note.json"
{
  "type": "doc",
  "content": [
    { "type": "paragraph", "content": [{ "type": "text", "text": "Ship after sign-off." }] }
  ]
}
```

```sh
node audit.mjs plain-note.json
node audit.mjs plain-note.json release-note.json
```

The first command reports `ready-for-validation` and exits with code `0`. The second prints two reports and exits with code `1` because the release note contains the approval gate and heading field.

## Decide what to port

The paragraph becomes a GoTipe paragraph with a bold span. The heading keeps level 2.
Its `releaseOwner` value, `"QA"`, lives in `result.unmapped[0].fields`. Saving only
`result.document` at this point would drop the heading’s owner.

The approval node becomes a `markdownRaw` block. Its content is a JSON string. Parsing
that string recovers the source node, including `team: "QA"`, `required: 2` and the text
`"Release candidate"`. The raw block preserves the rule as data. The application still
needs code to enforce two approvals before a release.

Warnings alone can miss a field. If the first paragraph of a list item has
`textAlign: "left"`, its text moves into the list item and the converter records
`align: "left"` in `unmapped` without a warning. The script flags that field too. If
your app already draws those items left aligned, you can exempt that exact case
and keep centered list text in the review queue.

For this fixture, keep the original export, decide where the heading owner belongs and port
the approval rule and its editing control. Then rerun the audit and validate the converted
document against the extensions your application actually loads. A clean report makes a
document a candidate for that test. In the app, try releasing with one approval and again
with two. [Port custom nodes and marks](/docs/conversion/from-tiptap#step-4-port-custom-nodes-and-marks)
and [check a converted document against your schema](/docs/conversion/migration#check-the-result).
