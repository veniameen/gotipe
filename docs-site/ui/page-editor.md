---
title: Page editor
description: PageEditor edits a Markdown file in the block editor and gives Markdown back, keeping untouched blocks byte for byte, with an optional review layer.
packages: ["@gotipe/block-editor", "@gotipe/markdown", "@gotipe/suggestions"]
license: Commercial
---

`PageEditor` is [BlockEditor](/docs/ui/block-editor) with a Markdown session: you pass the
file's text and get Markdown back after each edit. An unchanged file comes back byte for
byte, and an edit rewrites only the blocks it touched. On top it can show anchored
suggestions, comments and cursors from a model or a reviewer.

`PageEditor` always runs on the JS engine: no WebAssembly, no `eval`, so it works under
`script-src 'self'`. Files, saving, names and permissions stay in your application.

## Install

```sh
npm install @gotipe/block-editor @gotipe/core @gotipe/react @gotipe/theme @gotipe/i18n @gotipe/markdown @gotipe/suggestions @gotipe/versions react react-dom
```

## Example

```tsx title="MarkdownPage.tsx"
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
import { PageEditor, type PageEditorHandle } from "@gotipe/block-editor";
import { useEffect, useRef, useState } from "react";

export function MarkdownPage({ file, save }: { file: string; save: (text: string) => void }) {
  const page = useRef<PageEditorHandle>(null);
  const [draft, setDraft] = useState(file);

  // Save one second after the last edit.
  useEffect(() => {
    if (draft === file) return;
    const timer = setTimeout(() => save(draft), 1000);
    return () => clearTimeout(timer);
  }, [draft, file, save]);

  return (
    <>
      <button type="button" onClick={() => page.current?.selectTitle()}>Rename</button>
      <PageEditor ref={page} markdown={file} onChange={setDraft} titlePlaceholder="notes.md" />
    </>
  );
}
```

```demo
page-editor
```

## The Markdown session

- **Loading.** `markdown` is parsed when the editor is created. Later, a value that differs
  from the last draft `PageEditor` emitted replaces the document as an external change:
  block ids are reused, focus, caret and scroll stay, and the replacement is one undo step.
- **Saving.** `onChange` receives the whole file after edits, at most once per animation
  frame and only when the text changed. Debounce writes yourself.
- **Title.** A leading `# heading` is the page title. If the file has none, an empty title
  line shows `titlePlaceholder` and stays out of the file until someone types a title.
- **Kept as is.** Front matter is not shown and is written back unchanged. HTML, footnotes,
  link definitions, quotes that hold more than one paragraph, list items that hold more than
  a paragraph and nested lists, lists that mix tasks and plain items, and numbered task
  lists appear as read-only "Markdown" blocks with a lock.
- **Mapped blocks.** `- [ ]` is a task, `> [!NOTE]` (and `TIP`, `IMPORTANT`, `WARNING`,
  `CAUTION`) a callout, a paragraph with only `![alt](src "caption")` an image, and a
  paragraph with only a relative link named after its file, such as
  `[report.pdf](assets/report.pdf)`, a file block.
- **Table column types** are not stored: Number is right alignment (`---:`), Code wraps
  cells in backticks, Yes / no writes `✓` and `—` in every UI language. A column of the words
  an earlier version wrote there (`yes`, `да`) still reads as Yes / no.

Details of the codec are in [Markdown](/docs/conversion/markdown).

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `markdown` | `string` | — | The file's text. A new value that differs from the last draft replaces the document. |
| `undoableReplace` | `boolean` | `true` | Whether replacing the document (a new `markdown`, `setMarkdown`) can be undone. `false` clears the undo history instead, for example while you show an earlier version of the file. |
| `onChange` | `(markdown: string) => void` | — | The draft after edits, at most once a frame. `ref.flush()` sends a pending draft at once. |
| `readOnly` | `boolean` | `false` | No input; links open on a plain click; task boxes are disabled. |
| `host` | `EditorHost` | — | Assets, links and errors; see below. |
| `locale` | `string` | `"en"` | UI language; `"ru"` is built in. |
| `i18n` | `I18n` | — | A ready dictionary from `createI18n`; wins over `locale`. |
| `titlePlaceholder` | `string` | `"Untitled"` | Shown in an empty title, for example the file name. |
| `titleLevel` | `1 \| 2 \| 3 \| 4 \| 5 \| 6` | `1` | The HTML level of the title: `h1` by default. It looks the same at any level; pass `2` when your page has its own `h1`. Other headings of the file keep their levels. |
| `icon` | `ReactNode` | — | The page's glyph above the title in the text column, as in [`PageHead`](/docs/ui/block-editor) (`.gotipe-page-head-icon`). It is not written to the file. |
| `iconPlacement` | `"above" \| "inline"` | `"above"` | Where `icon` stands: above the title, or in the title's row before its text (`.gotipe-page-title-icon`, sizes `--gt-page-icon-inline` and `--gt-page-icon-inline-gap`). Either way it is not part of the title's text or the file. Inline, it stays accessible (a button with a menu keeps its role and focus) and its clicks and keys do not reach the editor; the title's accessible name is its text alone (its prompt when empty), without the icon's, and the empty title's prompt starts after the icon. |
| `header` | `ReactNode` | — | Your own content above the title in the text column, after `icon`, inside `.gotipe-page-head`. |
| `view` | `"notion" \| "docs" \| "modern" \| "minimal"` | `"notion"` | One of the shared [views](/docs/ui/theming). |
| `narrow` | `boolean` | `true` | The view's sizes for a container up to 640 px wide. `false` keeps the wide sizes, or your own on `.gotipe-page .gotipe-block-editor`, at any width (`data-gt-narrow="off"`). |
| `highlight` | `CodeHighlighter` | — | Code highlighter (`@gotipe/block-editor/shiki`). |
| `blockViews` | `BlockViews` | — | Your views; they win over the page's and the shared ones. |
| `blocks` | `PageBlockKind[]` | all | Blocks offered by `/`. |
| `slashMenu` | `PageSlashMenu` | — | Your commands, groups and order of the `/` menu; see [below](#the--menu). |
| `review` | `PageReviewProps` | — | Suggestions, comments and cursors. Without it there is no review layer. |
| `reviewLayout` | `"auto" \| "inline" \| "margin"` | `"auto"` | Where review cards stand: `auto` — in the margin when the page is wide enough, otherwise by the text; `inline` — always by the text; `margin` — always in the margin column. |
| `reviewLaneCursor` | `"caret" \| "pointer"` | `"caret"` | How a lane's cursor looks: a caret with a flag naming the lane, or an arrow pointer at the same place with the name below right of its tip (`.gotipe-lane-cursor[data-variant="pointer"]`, tokens `--gt-lane-pointer-*`), in the lane's colour. |
| `reviewCardPlacement` | `"below" \| "above"` | `"below"` | Where a card by the text opens when there is no room beside it (a narrow page): `below` the row, or above it when the window has no room below; `above` the row, or below it when there is no room above. Either way the card keeps 8 px from the row by its own measured height. |
| `reviewBar` | `{ title?: ReactNode; extra?: ReactNode[] } \| false` | not shown | Pass an object to show the review bar above the page. |
| `autoFocus` | `boolean` | — | Put the caret at the end once the editor exists: after `onReady` and after the effects of the render `onReady` causes, so listeners you add there get `focus` and then `selectionChange`. No frame or timer decides the order. |
| `onReady` | `(editor: GoTipeEditor) => void` | — | Called once per editor, when it exists. A new function on a later render is not called. |
| `onError` | `(error: GoTipeError) => void` | — | Every editor error, like `host.onError`, and the failed creation of the editor ([Host](#host)). |
| `status` | `boolean \| StatusLineOptions` | `false` | Words and characters under the page ([counter line](/docs/extensions/character-count#the-counter-line-of-blockeditor)). The page has `FindReplace` and `CharacterCount`, so `Mod+F` opens the find bar. |
| `className`, `style` | | — | On the root `.gotipe-page`. |

`markdown` and `readOnly` apply at any time; `host` is read on each call. The extensions are
fixed: `pageExtensions()` (exported) lists them. Toggles, columns, embeds and math are not
among them.

## Ref

| Member | Description |
|---|---|
| `editor` | The `GoTipeEditor`, or `null` before it exists. |
| `getMarkdown()` | The current document as Markdown. |
| `flush()` | Send a draft not yet emitted to `onChange` now and return the current Markdown. Call it before saving: `onChange` otherwise comes on the next frame. |
| `setMarkdown(text, options?)` | Replace the document with `text` as an external edit (caret, focus and scroll kept; undo takes it back), even when `text` equals the last `markdown` you passed. `onChange` is not called for it; a draft not yet emitted is dropped, so call `flush()` first to keep it. `{ addToHistory: false }` clears the undo history instead (default: `undoableReplace`). |
| `focus(position?)` | Focus the page, optionally at `"start"` or `"end"`. |
| `insertBlock(kind)` | Insert a block of a `PageBlockKind` at the caret, for your own toolbar. |
| `getTitle()` | Text of the leading `# heading`, or `null` when there is none or it is empty. |
| `selectTitle()` | Focus the title and select its text. |
| `review` | The review actions below, or `null` without `review`. |

`PageBlockKind` is one of `text`, `heading1`, `heading2`, `heading3`, `bulletList`,
`orderedList`, `todoList`, `quote`, `code`, `table`, `divider`, `callout`, `image`, `file`.
The `/` menu groups them as Style, Insert and Upload.

## The / menu

`slashMenu` changes the menu without changing the page's blocks:

```tsx title="SlashMenu.tsx"
<PageEditor
  markdown={file}
  slashMenu={{
    // the page's commands (its blocks and Emoji) come in; return what to show, in order
    commands: (defaults) => [...defaults, {
      name: "Release note", aliases: ["note"], description: "A callout for the changelog",
      icon: "alert-circle", group: "notes",
      execute: (editor) => editor.chain().setBlockType("callout", { type: "note", emoji: "" }).run(),
    }],
    groups: [
      { id: "upload", label: "Media" },
      { id: "style", label: "Style" },
      { id: "notes", label: "Notes" },
      { id: "insert", label: "Insert" },
    ],
    descriptions: true,
  }}
/>
```

- `commands` — a list replaces the page's own; a function gets them and returns the list to show.
  A command is a `SlashCommandDef` of `@gotipe/core`; its `group` places it.
- `groups` — order and labels; a group not listed is hidden. Without it the shared menu's AI, Style,
  Insert and Upload are shown; `pageSlashGroups(i18n)` returns the page's three in its language.
- `descriptions` — show a command's `description` under its name
  (`.gotipe-slash-menu-item-description`). Off by default.
- `renderIcon`, `renderMeta` — a row's icon and right-hand side, for example your own icon for
  your command; return `undefined` to keep the built-in one, `null` from `renderMeta` for none.
  The row classes are listed under [Menus](/docs/ui/menus).

## Host

`host` takes the [EditorHost](/docs/concepts/host) callbacks. Without `saveAsset`, pasted
and uploaded images and files up to 10 MiB are stored in the file as `data:` URLs. Without
`openLink`, a link opens in a new tab with `noopener`. Without `onError` and
`host.onError`, errors show as a toast; with either of them the toast is off.

`resolveAsset` returning `null` (or a promise of it) means the asset is unavailable: the image
or file shows its failed state and nothing is requested. A throw is reported as
`ASSET_RESOLVE_FAILED`; anything but a `GoTipeError` thrown by `saveAsset` becomes
`ASSET_SAVE_FAILED`.

When the editor cannot be created — the Markdown cannot be read or the document fails its
check — the page shows "The document could not be opened" in place of the loading shape, and
the failure goes once to `onError` and `host.onError` as a `GoTipeError`; a reason that is not
one becomes `EDITOR_NOT_INITIALIZED` with the reason as `details.cause`. Without either of
them it is logged to the console. A creation that fails after the page is gone reports
nothing. Show the same `markdown` again in a new `PageEditor` (a new `key`) to try again.

## Review layer

```tsx title="ReviewedPage.tsx"
import { PageEditor, type PageReviewProps } from "@gotipe/block-editor";

const review: PageReviewProps = {
  lanes: [{ id: "assistant", name: "Assistant", kind: "agent", color: "var(--gt-track-1)" }],
  proposals: [
    {
      id: "p1",
      laneId: "assistant",
      reason: "Shorter wording",
      edits: [{ before: "Run ", quote: "the whole build", after: " first.", text: "the build" }],
    },
  ],
};

export function ReviewedPage({ file, save }: { file: string; save: (text: string) => void }) {
  return <PageEditor markdown={file} onChange={save} review={review} reviewBar={{ title: "Assistant" }} />;
}
```

- A **lane** is who suggests: `agent`, `skill`, `tool` or `user`, with a colour.
- A **proposal** is a list of anchored edits: `before + quote + after` in the file, replaced
  by `text`. Anchors are matched against the draft after every edit. Anything other than
  exactly one match makes the proposal stale: it can only be rejected.
- Without `onAccept` a proposal is applied locally and `onChange` gets the new text; without
  `onReject` it is hidden locally. Accept all goes one by one in document order and stops at
  the first stale proposal or `false` result; `onAcceptAll` replaces that.
- **Comments** quote a range, can be questions, and take replies through `onReply`. With
  `onDeleteComment(id)` the open card has a delete button (a trash icon, "Delete comment"); ask
  for confirmation inside it if you need to. `false` keeps the card, a throw is reported as
  `COMMENT_ACTION_FAILED`; after success drop the comment from `comments`.
- **Cursors** stand at the end of a proposal's text or at an anchor, with a label.
- On a page at least 880 px wide (card, gap and minimum page width tokens) cards stand in
  the margin beside their text; on a narrower page a card opens next to the text you click.
  Escape closes it. `reviewLayout` fixes either layout whatever the width.

`ref.current.review` has `accept(id)`, `reject(id)`, `acceptAll()`, `rejectAll()`,
`states()` and `focus(id)`. `ReviewBar` and `LaneAvatars` are exported for a bar of your
own. The data model and callbacks are described in [model edits](/docs/review/model-edits).

## Language and read-only

`locale="ru"` switches the UI to Russian; `i18n` takes any dictionary (see
[i18n](/docs/ui/i18n)). `PageEditor` sets its own provider, so a surrounding
`GoTipeI18nProvider` does not reach it. With `readOnly` the page ignores input, hides the
handle and menus, and opens links on a plain click.

## Limitations

- There is no CRDT collaboration inside `PageEditor`: it always uses the JS engine. Use
  `BlockEditor` with the WASM engine for [collaboration](/docs/collaboration/overview).
- The AI command bar is off, and the extensions cannot be changed; `blocks` only filters
  the `/` menu.
- `titleLevel` changes the title only: a `# heading` further down the file is still an `h1`.

## Related

- [Block editor](/docs/ui/block-editor) · [Menus](/docs/ui/menus) · [Markdown](/docs/conversion/markdown)
- [Model edits](/docs/review/model-edits) · [Host](/docs/concepts/host) · [Security](/docs/resources/security)
