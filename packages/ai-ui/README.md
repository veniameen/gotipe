# @gotipe/ai-ui

React components for the GoTipe AI layer: a command palette, an action toolbar and a
controlled ghost text for your own editor layouts. They work with the extensions and the
provider of [`@gotipe/ai`](https://www.npmjs.com/package/@gotipe/ai). `BlockEditor` from
`@gotipe/block-editor` already has its own AI controls built in.

[Docs](https://gotipe.com/docs/ai/ui/) · [Website](https://gotipe.com) · [Repository](https://github.com/veniameen/gotipe)

## Install

```sh
npm install @gotipe/ai-ui @gotipe/ai @gotipe/core @gotipe/react react react-dom
```

## Usage

```tsx
import type { AiCommand, AiProvider } from "@gotipe/ai";
import { AiCommandPalette } from "@gotipe/ai-ui";
import { type GoTipeEditor, createId } from "@gotipe/core";

declare const backendProvider: AiProvider; // your adapter for @gotipe/ai

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

- `AiCommandPalette` (`editor`, `commands`, `onClose`) lists your commands, filters them as
  you type and replaces the selection with the suggestion you pick. It shows an error
  instead when the document changed meanwhile.
- `AiToolbar` (`editor`, `onCommand`) shows Rewrite, Summarize, Expand, Fix grammar and
  Translate buttons and calls `onCommand` with `rewrite`, `summarize`, `expand`,
  `fixGrammar` or `translate`; running the command is up to you.
- `AiGhostText` (`editor`, `text`, `onAccept`, `onDismiss`) renders a completion you
  control; Tab accepts it. `GhostText` is its deprecated earlier name.

The components take their words from `GoTipeI18nProvider` of `@gotipe/react` (the `ai.*`
keys), English without one. `@gotipe/theme` has no styles for them: style
`.gotipe-ai-command-palette` and `.gotipe-ai-toolbar` yourself.

## License

`@gotipe/ai-ui` is licensed under the
[GoTipe Commercial License](https://github.com/veniameen/gotipe/blob/main/packages/ai-ui/LICENSE-COMMERCIAL):
use is free for personal projects, non-profits and education, OSI-licensed open-source
projects, organizations with less than USD 1,000,000 gross revenue in the last 12 months,
and evaluation or development before production; other production use needs a commercial
license. See [Licensing](https://gotipe.com/docs/resources/licensing/).
