# @gotipe/ai

The AI layer of the GoTipe editor: it connects the editor to a language model through a
provider you write. It builds the request context from the document, runs one request at a
time, checks every result against the document it was made for and applies it as one
undoable change. It ships no vendor SDK and no tool calling.

[Docs](https://gotipe.com/docs/ai/overview/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/ai @gotipe/core
```

## Usage

```ts
import { type AiProvider, defineAi, defineAiAgent, defineAiContext } from "@gotipe/ai";
import { createEditor } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";

declare const backendProvider: AiProvider; // your adapter, see the provider guide

const editor = await createEditor({
  extensions: [
    DefaultPreset,
    defineAi.configure({ provider: backendProvider, enableAutoComplete: true }),
    defineAiContext,
    defineAiAgent,
  ],
});
editor.mount(document.querySelector<HTMLElement>("#editor")!);

// Run a command; the UI components emit the same event.
editor.emit("executeAiCommand", { commandId: "proofread" });
editor.emit("executeAiCommand", { commandId: "askAi", prompt: "the risks of this plan" });
```

An `AiProvider` has a `name`, `generateCompletion`, `generateSuggestions` and
`executeCommand`; `streamRewrite`, `generateParagraph`, `proofread` and `reviewComments` are
optional. Keep model API keys on your server: the provider calls your backend, which adds
the key. See [AI provider](https://gotipe.com/docs/ai/provider/) for a complete example.

- `defineAi` creates the manager, opt-in ghost text and the `cancelAi` command. Options:
  `provider`, `enableAutoComplete`, `debounceMs`, `maxContextBlocks`, `enablePiiDetection`.
- `defineAiContext` adds `rewrite`, `continueWriting`, `askAi` and their slash items.
- `defineAiAgent` adds `freeText`, `proofread`, `addParagraph` and `review`.
- `AiPreset` bundles the three extensions without a provider.
- `getAiManager(editor)` returns the `AiManager` for running requests yourself.
- `getProofreadSuggestions`, `acceptProofreadSuggestion`, `rejectProofreadSuggestion`,
  `acceptAllProofreadSuggestions`, `rejectAllProofreadSuggestions` and
  `getAiReviewComments` work with proofreading and review results.
- `detectPii(text)` finds email addresses, phone numbers and card numbers.

The ready-made controls (command bar, Improve, ghost text) live in the commercial
`@gotipe/block-editor`; `@gotipe/ai-ui` adds a command palette and a toolbar. See
[AI UI](https://gotipe.com/docs/ai/ui/).

## License

MIT — see [LICENSE](https://github.com/veniameen/gotipe/blob/main/packages/ai/LICENSE).
