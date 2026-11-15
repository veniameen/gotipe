---
title: AI
description: The AI layer of GoTipe — your provider, the manager that builds context and applies results, the built-in commands, cancellation, ghost text and PII blocking.
packages: ["@gotipe/ai"]
license: MIT
---

`@gotipe/ai` connects the editor to a language model of your choice. You implement an
`AiProvider` that talks to your backend or to GoTipe Cloud. The package builds the request
context from the document, runs one request at a time, checks every result against the
document it was made for, and applies it as a single undoable change. It ships no vendor
SDK and no tool calling: a provider returns text, proofreading edits or review comments.

## Install

```sh
npm install @gotipe/ai
```

## Set up

```tsx title="writing-assistant.tsx"
import { defineAi, defineAiAgent, defineAiContext } from "@gotipe/ai";
import { BlockEditor } from "@gotipe/block-editor";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { backendProvider } from "./ai-provider";

export function WritingAssistant() {
  const editor = useEditor({
    extensions: [
      DefaultPreset,
      defineAi.configure({ provider: backendProvider, enableAutoComplete: true }),
      defineAiContext,
      defineAiAgent,
    ],
  });
  return <BlockEditor editor={editor} />;
}
```

[AI provider](/docs/ai/provider) shows `backendProvider`. Without a provider every command
fails with "No AI provider configured". [AI UI](/docs/ai/ui) covers the command bar,
Improve, ghost text and proofreading controls.

## Extensions

| Extension | Adds |
| --- | --- |
| `defineAi` | The manager (`getAiManager(editor)`), ghost text (opt-in) and the `cancelAi` command. The other two need it. |
| `defineAiContext` | `rewrite`, `continueWriting`, `askAi`, and the slash items Continue Writing (`/continue`, `/write`, `/generate`) and Ask AI (`/ai`, `/ask`, `/prompt`). |
| `defineAiAgent` | `freeText`, `proofread`, `addParagraph`, `review`. |
| `AiPreset` | The three extensions without options. It sets no provider, so most apps configure `defineAi` instead. |

`defineAiContext` and `defineAiAgent` also accept `{ provider }`, which replaces the
provider of the shared manager. Options of `defineAi.configure()`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `provider` | `AiProvider` | — | Your adapter. |
| `enableAutoComplete` | `boolean` | `false` | Ghost text after a pause. |
| `debounceMs` | `number` | `500` | The pause, in ms, before ghost text is requested. |
| `maxContextBlocks` | `number` | `5` | Blocks before and after the current one sent as context, 0 to 100. |
| `enablePiiDetection` | `boolean` | `false` | Block requests that contain an email address, a phone number or a card number. |

## Commands

Run a command by emitting `executeAiCommand`. The UI components do the same.

```ts
editor.emit("executeAiCommand", { commandId: "proofread" });
editor.emit("executeAiCommand", { commandId: "askAi", prompt: "the risks of this plan" });
```

| Command | Description |
| --- | --- |
| `rewrite` | Rewrites the selection with `streamRewrite` (or `executeCommand("rewrite")`) and replaces it. Fails with "Select text to improve" without a selection. |
| `continueWriting` | Continues with `generateCompletion` in a new paragraph after the current block, or in a new list or to-do item after an item. |
| `askAi` | With a `prompt`, inserts a block after the current one from `generateParagraph` (or `executeCommand("addParagraph:" + prompt)`). Without one, nothing is requested and a shown AI command bar opens. |
| `addParagraph` | Same as `askAi` with a `prompt`. |
| `freeText` | `prompt` `proofread`, `proofread document` or `check grammar` runs `proofread`; `review`, `review document` or `check document` runs `review`; any other prompt adds a paragraph, without a leading `add paragraph about` or `add paragraph:`. |
| `proofread` | Gets edits from `proofread`, validates them and emits `aiProofreadChange`. Read them with `getProofreadSuggestions(editor)`; apply them with `acceptProofreadSuggestion`, `rejectProofreadSuggestion`, `acceptAllProofreadSuggestions` or `rejectAllProofreadSuggestions`. |
| `review` | Gets comments from `reviewComments`, validates them and emits `commentAdded` for each. Read them with `getAiReviewComments(editor)`. |
| `cancelAi` | Cancels the running request. |

Generated text is collected completely before it is inserted, so an error or a
cancellation never leaves a half-written block. Accept All of proofreading is one
transaction and one undo step.

`aiStatusChange` reports `{ active, label }` when a request starts and ends. A failure,
other than a cancellation, emits `error` with a `GoTipeError` of code `EXTENSION_ERROR` and
`details.extension === "ai"`, and a final `aiStatusChange` whose `label` is the message.

## Context

Each request gets an `AiContext` built from the document's public JSON, so the provider
works on detached copies.

| Field | Description |
| --- | --- |
| `signal` | The request's `AbortSignal`. |
| `selectedText` | The selected text, blocks joined with line breaks. Absent for a caret. |
| `currentBlock` | The block that holds the selection anchor. |
| `surroundingBlocks` | The current block with up to `maxContextBlocks` blocks before and after it, in document order; nested blocks count one by one. Proofread and review get every block. |
| `fullText` | The whole document as text. Proofread and review only. |

## Cancellation

- A manager runs one request at a time. A new request cancels the previous one.
- A request is cancelled by `cancelAi`, by any document change (yours or a collaborator's),
  by switching to read-only, by changing the provider and by destroying the editor.
- The provider receives `context.signal`. Pass it to `fetch` to stop network work.
- A late result is dropped even when the provider ignores the signal. Before applying
  anything, the manager checks that the document is the one the request was made for.
- A cancellation is silent: an `AbortError` is not reported as an error.

## Ghost text

With `enableAutoComplete: true`, a pause of `debounceMs` after typing or moving the caret
requests a completion when the editor has focus, the caret sits at the end of a text block
and no other AI request runs. The provider's `generateCompletion` streams into
`aiGhostTextChange` events `{ text, blockId, offset }`, and `null` clears them.

- Tab inserts the suggestion at the caret where it was requested, as one change.
- Escape dismisses it. Typing, moving the caret, leaving the editor and read-only mode
  dismiss it and abort the stream.

`BlockEditor` draws the text after the caret; see [AI UI](/docs/ai/ui#ghost-text).

## PII blocking

With `enablePiiDetection: true`, the manager checks every string of the context and the
prompt before it calls the provider. A match stops the request with "AI request contains a
detected email, phone or card number. Remove it or disable PII detection explicitly." The
manager never edits the text, because a redacted context would no longer match the
document's offsets.

It detects email addresses, North American phone numbers with at least 10 digits (an
optional `+1`, area code and separators), and 16-digit card numbers, with or without
separators between groups of four, that pass the Luhn check. `detectPii(text)` returns the
matches as `{ pii_type, start, end, matched_text }` with UTF-16 offsets.

## Use the manager directly

`getAiManager(editor)` returns the manager that `defineAi` created for the editor, or
`undefined` without the extension and after the editor is destroyed. It is the manager the
commands, ghost text and `cancelAi` use, with their provider (also one set by
`defineAiContext` or `defineAiAgent`). It runs one request at a time, yours or theirs: a new
request cancels the running one, and so do closing the command bar and any change to the
document. A cancelled request rejects with an `AbortError`. The extension owns the manager and
releases it with the editor, so do not call `destroy()` on it.

```ts title="summarize.ts"
import { getAiManager } from "@gotipe/ai";
import { type GoTipeEditor, createId } from "@gotipe/core";

export async function summarizeSelection(editor: GoTipeEditor) {
  const ai = getAiManager(editor);
  if (!ai) throw new Error("Add defineAi to the editor");
  const target = ai.captureTarget(); // the document and selection to change
  const content = await ai.executeCommand("summarize");
  ai.applySuggestion({ id: createId(), type: "summarize", content, confidence: 1 }, target);
}
```

`AiManager` also works without the extensions: `new AiManager(editor, { provider })` is a
manager of your own, with its own request, which you release with `destroy()`.

| Method | Description |
| --- | --- |
| `setProvider(provider)` / `getProvider()` | Changes the provider (cancels the running request) / returns it. |
| `processing` | `true` while a request runs. |
| `buildContext()` / `buildFullContext()` | The context for a request / with every block and `fullText`. |
| `captureTarget()` | The current document and selection, to apply a result to later. |
| `executeCommand(command)` / `getSuggestions(prompt)` | One text / validated `AiSuggestion[]` from the provider. |
| `streamCompletion(signal?)`, `streamRewrite(text)`, `streamContinueWriting()`, `streamGenerateParagraph(prompt)` | Chunk streams for a preview of your own. |
| `proofread()` / `reviewComments()` | Validated proofreading edits / review comments for the whole document. |
| `applySuggestion(suggestion, target?)` | Replaces the target's selection with the text. Throws when the document changed. |
| `insertParagraph(text, target)` | Inserts a block after the target's block. |
| `applyProofreadSuggestion(s)` / `applyProofreadSuggestions(list)` | Applies proofreading edits in one transaction. |
| `cancelPending()` / `destroy()` | Cancels the running request / releases the manager. |

## Limitations

- Proofreading edits and review comments refer to offsets in one version of the
  document. A proofreading edit goes stale when its block changes, and review comments are
  dropped on the next change. Keep lasting discussions in
  [`CommentsManager`](/docs/review/comments).
- In a collaborative document, a collaborator's edit cancels your running request.
- The PII check covers the patterns above only. It is not a full classifier of personal
  data.
- `PageEditor` shows no AI controls.

## Related

- [AI provider](/docs/ai/provider): connect your backend or GoTipe Cloud.
- [AI UI](/docs/ai/ui): the command bar, Improve, ghost text and proofreading.
- [Events](/docs/concepts/events): `executeAiCommand`, `aiStatusChange` and the other events.
