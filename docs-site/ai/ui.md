---
title: AI UI
description: The AI controls of BlockEditor — command bar, Improve, ghost text, proofreading toolbar and status — and the AiCommandPalette and AiToolbar components of @gotipe/ai-ui.
packages: ["@gotipe/block-editor", "@gotipe/ai-ui"]
license: Commercial
---

`BlockEditor` has AI controls built in: a command bar, an Improve button over selected
text, ghost text at the caret, a proofreading toolbar and a status line. They emit and
listen to the events of [`@gotipe/ai`](/docs/ai/overview), so they work once the AI
extensions and a [provider](/docs/ai/provider) are installed. `@gotipe/ai-ui` adds a command
palette and an action toolbar for your own layouts. `@gotipe/block-editor` and
`@gotipe/ai-ui` are commercial; `@gotipe/ai` is MIT.

```demo
ai
```

## Install

```sh
npm install @gotipe/ai @gotipe/block-editor
npm install @gotipe/ai-ui
```

The second command is needed only for `AiCommandPalette`, `AiToolbar` and the controlled
`AiGhostText`. `@gotipe/ai-ui` takes `@gotipe/react` as a peer: the palette and the toolbar say
their words in the language of `GoTipeI18nProvider` (`ai.*` keys of `@gotipe/i18n`, English
without a provider).

## BlockEditor props

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `showAiCommandBar` | `boolean` | `true` | Shows the command bar, the Improve button, ghost text and the status line where an AI extension answers them; `false` hides them all. |
| `onAiCommand` | `(prompt: string) => void \| Promise<void>` | — | Handles a command bar prompt yourself instead of the built-in `freeText` command. |
| `suggestions` | `ToolbarSuggestion[]` | — | Proofreading suggestions for the toolbar. |
| `onSuggestionAccept`, `onSuggestionReject` | `(suggestion) => void` | — | Required, with `suggestions`, for the toolbar to appear. |
| `onSuggestionAcceptAll`, `onSuggestionRejectAll` | `() => void` | — | Accept All and Reject All. |

### Which controls show

Each control appears only when an extension answers it, so an editor without `defineAi` has no
AI controls at all: no Improve, no ⌘J (the key stays the browser's), no ghost text and no
status line.

| Control | Shown when the editor has |
| --- | --- |
| Improve | `defineAi` and `defineAiContext` |
| Command bar and ⌘J | `defineAi` with `defineAiAgent` or `defineAiContext`, or `defineAi` and your `onAiCommand` |
| Ghost text, status line | `defineAi` |

`AiPreset` has all three. `BlockEditor` asks `editor.hasExtension(name)`, so the answer is
fixed when the editor is created. `PageEditor` shows no AI controls.

## Command bar

⌘J or Ctrl+J toggles the bar while the focus is in the editor or the bar; the physical J
key works on any keyboard layout. The Ask AI slash item opens it too. Enter sends the
prompt; Escape, the close button or a click outside closes the bar and cancels a running
request. The shortcut does nothing in read-only mode.

Without `onAiCommand`, the bar runs `freeText` of `defineAiAgent`: `proofread`, `proofread
document` or `check grammar` start proofreading, `review`, `review document` or `check
document` start a review, and any other prompt adds a paragraph after the current block. With
`defineAiContext` but no agent it runs `askAi`, and every prompt adds a paragraph. The bar shows
"Processing..." and the error message of a failed request, and closes once the result has
arrived. To rewrite the selection by an instruction, handle the prompt yourself:

```tsx title="instruction-bar.tsx"
import { defineAi, defineAiContext, getAiManager } from "@gotipe/ai";
import { BlockEditor } from "@gotipe/block-editor";
import { createId } from "@gotipe/core";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { backendProvider } from "./ai-provider";

export function InstructionEditor() {
  const editor = useEditor({
    extensions: [DefaultPreset, defineAi.configure({ provider: backendProvider }), defineAiContext],
  });

  return (
    <BlockEditor
      editor={editor}
      onAiCommand={async (prompt) => {
        // The manager of defineAi: closing the bar (cancelAi) cancels this request too.
        const ai = editor && getAiManager(editor);
        if (!ai) return;
        const target = ai.captureTarget();
        const content = await ai.executeCommand(prompt);
        ai.applySuggestion({ id: createId(), type: "rewrite", content, confidence: 1 }, target);
      }}
    />
  );
}
```

An error thrown by `onAiCommand` appears in the bar.

## Improve

Selecting text opens the formatting bar with an Improve button first. It runs the
`rewrite` command: the provider's `streamRewrite` rewrites the selection, and the result
replaces it in one undoable change. It needs `defineAiContext`.

## Ghost text

With `enableAutoComplete: true` on `defineAi`, `BlockEditor` shows the suggested
continuation in muted text after the caret, clipped to the line and kept in place on
scroll and resize. Tab accepts it and Escape dismisses it; the
[ghost text rules](/docs/ai/overview#ghost-text) say when it appears.

## Proofreading

`aiProofreadChange` fires when proofreading finishes and after each accept or reject. Pass
the suggestions to `BlockEditor`; their shape fits the `suggestions` prop as it is.

```tsx title="proofread-editor.tsx"
import {
  type AiProofreadSuggestion,
  acceptAllProofreadSuggestions,
  acceptProofreadSuggestion,
  defineAi,
  defineAiAgent,
  defineAiContext,
  getProofreadSuggestions,
  rejectAllProofreadSuggestions,
  rejectProofreadSuggestion,
} from "@gotipe/ai";
import { BlockEditor } from "@gotipe/block-editor";
import { DefaultPreset } from "@gotipe/core/presets";
import { useEditor } from "@gotipe/react";
import { useEffect, useState } from "react";
import { backendProvider } from "./ai-provider";

export function ProofreadEditor() {
  const editor = useEditor({
    extensions: [
      DefaultPreset,
      defineAi.configure({ provider: backendProvider }),
      defineAiContext,
      defineAiAgent,
    ],
  });
  const [items, setItems] = useState<AiProofreadSuggestion[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editor) return;
    return editor.on("aiProofreadChange", () => setItems(getProofreadSuggestions(editor)));
  }, [editor]);

  // Accepting a stale suggestion throws; proofread again in that case.
  const run = (action: () => void) => {
    try {
      action();
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => editor?.emit("executeAiCommand", { commandId: "proofread" })}
      >
        Proofread
      </button>
      {error && <p role="alert">{error}</p>}
      <BlockEditor
        editor={editor}
        suggestions={items}
        onSuggestionAccept={(s) => editor && run(() => acceptProofreadSuggestion(editor, s.id))}
        onSuggestionReject={(s) => editor && run(() => rejectProofreadSuggestion(editor, s.id))}
        onSuggestionAcceptAll={() => editor && run(() => acceptAllProofreadSuggestions(editor))}
        onSuggestionRejectAll={() => editor && run(() => rejectAllProofreadSuggestions(editor))}
      />
    </>
  );
}
```

The toolbar shows the position, Previous and Next, accept and reject for the current
suggestion, and Accept All and Reject All. Accept All is one undo step. After an accept,
the other suggestions of that block move with the text.

## Status

The status line shows a spinner and the request's label, such as "Improving..." or
"Proofreading...", while a request runs. It reads `aiStatusChange`; use the same event for
a status of your own.

## Components

`@gotipe/block-editor` exports each control for an editor surface of your own. Every one
takes `editor` and draws nothing for an editor without the extensions it needs (see
[which controls show](#which-controls-show)).

| Component | Props | Description |
| --- | --- | --- |
| `AiCommandBar` | `editor`, `onSubmit?` | The command bar with its shortcut. `onSubmit` works like `onAiCommand`. |
| `BlockEditorBubbleMenu` | `editor`, `enableAI?` | The formatting bar; `enableAI` adds Improve when the editor has `defineAi` and `defineAiContext`. |
| `GhostText` | `editor` | The ghost text overlay. |
| `AiStatusIndicator` | `editor` | The status line. |
| `SuggestionToolbar` | see [Suggestions](/docs/review/suggestions#suggestiontoolbar) | The proofreading toolbar. |

## @gotipe/ai-ui

### AiCommandPalette

A dialog that lists your commands, filters them as you type and runs one with Enter or a
click. A command returns `AiSuggestion[]`; clicking one replaces the selection that was
current when the palette opened. When the document changed meanwhile, the palette shows an
error instead. Escape and the Close button call `onClose`; unmounting the palette aborts a
running command.

```tsx title="ai-palette.tsx"
import type { AiCommand } from "@gotipe/ai";
import { AiCommandPalette } from "@gotipe/ai-ui";
import { type GoTipeEditor, createId } from "@gotipe/core";
import { backendProvider } from "./ai-provider";

const commands: AiCommand[] = [
  {
    name: "Summarize",
    description: "Replace the selection with a summary",
    async execute(_editor, context) {
      const content = await backendProvider.executeCommand("summarize", context);
      return [{ id: createId(), type: "summarize", content, confidence: 1 }];
    },
  },
];

export function Palette(props: { editor: GoTipeEditor; onClose: () => void }) {
  return <AiCommandPalette editor={props.editor} commands={commands} onClose={props.onClose} />;
}
```

The palette calls `execute` directly with the context and an `AbortSignal`. The manager's
PII check and status events do not apply to it.

### AiToolbar

Buttons for Rewrite, Summarize, Expand, Fix grammar and Translate. A click calls
`onCommand` with `rewrite`, `summarize`, `expand`, `fixGrammar` or `translate`; running the
command is up to you, for example with `AiManager.executeCommand()` and `applySuggestion()`
as in the command bar example. The buttons are disabled while the editor is read-only or
an AI request is running.

### AiGhostText

A controlled ghost text. It takes `editor`, `text`, `onAccept` and `onDismiss`, and renders
`text` as a span. Tab in the editor calls `onAccept`; any other key except a modifier
calls `onDismiss`. Use it with your own completion state; `GhostText` of
`@gotipe/block-editor` reads the editor's events instead. The earlier name `GhostText` of
`@gotipe/ai-ui` still works and is deprecated.

## Limitations

- Without `onAiCommand`, a command bar prompt never rewrites the selection: it adds a
  paragraph, proofreads or reviews.
- Errors of Improve and of slash commands reach `host.onError` and the `error` event, but
  `BlockEditor`'s error toast does not show them: `EXTENSION_ERROR` stays out of the toast by
  design ([errors](/docs/ui/block-editor#errors)); the command bar shows its own.
- `@gotipe/theme` has no styles for `AiCommandPalette` and `AiToolbar`; style
  `.gotipe-ai-command-palette` and `.gotipe-ai-toolbar` yourself. A command's own `name` and
  `description` are shown as you wrote them.

## Related

- [AI](/docs/ai/overview): commands, context, cancellation and ghost text rules.
- [AI provider](/docs/ai/provider): connect a model.
- [BlockEditor](/docs/ui/block-editor) and [Keyboard shortcuts](/docs/ui/keyboard).
