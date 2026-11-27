---
title: Apply AI edits after the document changes
description: Apply a model's proposed text edits after a human changes the draft, and detect ambiguous or stale replacements before saving any part of a batch.
packages: ["@gotipe/suggestions"]
license: MIT
---

A writing assistant proposes two changes to a release checklist. While it is working, an editor adds a heading at the top. Both stored character offsets have moved. GoTipe can still locate each proposal by its quoted text and the words on either side. If a quote and its context now appear twice, the application gets a conflict it can show the reviewer.

This Node.js example simulates a model response using two fixed replacements. It needs a string containing the draft, two proposed edits and the current text at the time of acceptance. You can run it locally without a model account.

## Install the published packages

Use an empty directory for the example. The suggestions package declares the editor core as a peer.

```sh
npm init -y
npm install --save-exact @gotipe/suggestions@0.1.3 @gotipe/core@0.1.6
```

## Capture the proposals against the draft the model read

Save the next three code blocks in order in `review.mjs`. An anchor carries the text to replace in `quote` and its immediate surroundings in `before` and `after`. GoTipe uses all three to find the selection again. The proposed `text` is the replacement. Here the setup locates two known selections in the original draft. In an editor, you can use the start and end of the selection that was actually sent to the model.

```js title="review.mjs"
import assert from "node:assert/strict";
import { anchorAt, applyAnchoredEdits } from "@gotipe/suggestions";

const contact = "Incident contact: Sam Ortiz handles release support.";
const draft = [
  "Deployment window: Friday morning, 09:00–11:00.",
  "",
  contact,
].join("\n");

function propose(quote, replacement) {
  const start = draft.indexOf(quote);
  assert.ok(start >= 0 && start === draft.lastIndexOf(quote));
  const anchor = anchorAt(draft, start, start + quote.length);
  return { ...anchor, text: replacement };
}

const proposals = [
  propose("Friday", "Monday"),
  propose("Sam Ortiz", "Alex Chen"),
];
```

## Accept against the current text

The heading shifts both ranges while leaving the target paragraphs intact. Supply the current text to `applyAnchoredEdits` at acceptance time. The resulting string includes the human's heading and both requested replacements.

```js
const current = "# Release week\n\n" + draft;
const accepted = applyAnchoredEdits(current, proposals);

assert.equal(accepted.ok, true);
assert.equal(
  accepted.text,
  current.replace("Friday", "Monday").replace("Sam Ortiz", "Alex Chen"),
);
console.log(accepted.text);
```

## Handle an ambiguous or missing quote

Suppose a teammate copies the contact paragraph to create a second shift. The whole context around `Sam Ortiz` now occurs twice. Another teammate might already have assigned the shift to a different person. Run both alternatives against the same proposals.

```js
const duplicated = current + "\n\n" + contact;
const reassigned = current.replace("Sam Ortiz", "Pat Flynn");

for (const [latest, reason] of [
  [duplicated, "ambiguous"],
  [reassigned, "missing"],
]) {
  const result = applyAnchoredEdits(latest, proposals);
  assert.deepEqual(result, { ok: false, reason, index: 1 });
  console.log(`Edit ${result.index + 1} needs review: ${result.reason}`);
}
```

```sh
node review.mjs
```

The first case prints the checklist with `Monday` and `Alex Chen`. The next two print `Edit 2 needs review: ambiguous` and `Edit 2 needs review: missing`. Even though the date was still identifiable, the failed batch returns no replacement document. Use the returned index to highlight the proposal that needs attention.

## Connect acceptance to your save operation

Keep the draft the model read until its proposals arrive. Show the reviewer each original quote and its replacement. On acceptance, read the latest document and its revision, apply the selected batch, and save the successful result conditional on that revision. If another writer saves in between, reread the content and run the anchors again. This last check belongs in your storage layer.

For a headless application these operations work on plain strings. GoTipe's PageEditor can also display anchored proposals as review cards. [Anchored edits and the PageEditor review interface](/docs/review/model-edits)
