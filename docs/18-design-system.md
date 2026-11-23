# GoTipe — design system

The source of the look is the [GoTipe Atlas](../design/atlas/README.md) (`design/atlas/atlas.html`),
accepted by the owner on 11 November 2026. This document records the Atlas decisions in words.
The values live in the Atlas tokens (`design/atlas/src/tokens*.css`) and, after the port, in
`packages/theme/src/design-tokens.json`. If this document and the Atlas disagree, the Atlas is right.

## How the look changes

1. A frame in the Atlas: a new one or an edit to an existing one. `node design/atlas/build.mjs`,
   then `node design/atlas/check.mjs`.
2. The owner's decision on the frame. Remarks are fixed in the drawing, not in code.
3. Code for the accepted frame: tokens → theme → components. The commit names the frame
   ("Atlas frame 7"). A snapshot does not prove input, drag and drop, undo, and selection —
   a scenario checks those.

A change to the look without a frame is not accepted.

## Principles

The measure is Specimen v6: scale, rhythm, radii, density. The look itself is our own.

- **Quiet and dense, like a native macOS app** (ChatGPT.app, Codex):
  system font, no decoration.
- **Hierarchy comes from size and weight, not from gray.** Main text is ink. Secondary
  and quiet text stay quiet; they are not darkened.
- **Depth comes from the surface tone.** A popover gets a 0.5 px ring and a shadow, not
  a border. There is no identical 1 px border on everything and no card inside a card.
- **Color only with meaning:** people, callout kind, code highlighting, errors.
  There is no purple or terracotta. The link and the task checkmark are ink; the accent is
  selection, focus, and the model.
- **As few explanations as possible.** The reason for "not allowed" goes in a tooltip. An error is a toast or
  a highlight on the element, not a line under the field. A setting appears only where
  it cannot be avoided.
- **Icons are our own set:** a 16 grid (24 for the page icon), 1.5 stroke,
  rounded ends, `currentColor`. Emoji and letters are not used in place of icons.
- **Examples use real content.** An empty document hints at where to start.
- **There is no view for a specific application.** The host passes data through contracts and
  colors through `--gt-*`.

## Font and scale

Families are set by tokens with a system fallback; fonts are not bundled into the packages:
- UI — `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui…`;
- monospace — `ui-monospace, "SF Mono", Menlo, Consolas…`.

| Role | notion | docs | minimal |
|---|---|---|---|
| Page title | 32/40, 700 | 28/36 | 22/28 |
| H1 · H2 · H3 | 24/32 · 20/28 · 16/24, 600 | 22/28 · 18/24 · 15/22 | 18/26 · 16/22 · 14/22 |
| Text | 15/24 | 14/22 | 14/22 |
| Quote · table · code | 16/26 · 14/20 · 13/20 | 15/24 · 13/20 · 12/20 | 14/22 · 13/20 · 12/20 |
| Caption, meta | 13/20 | 13/20 | 13/20 |

The interface (menus, panels, cards) is 13/18, group labels 12/16. Negative tracking
only on headings and document text. Numbers in tables use tabular figures.

## Color

The main roles. The full set is in the tokens.

| Role | Light | Dark |
|---|---|---|
| Page · sunken surface | `#ffffff` · `#f7f7f5` | `#191918` · `#20201f` |
| Text · secondary · quiet | `#232322` · `#66665f` · `#8e8e87` | `#ececea` · `#a6a6a0` · `#7a7a74` |
| Line · strong line | ink 9% · 15% | white 8% · 13% |
| Ink (primary button, task checkmark) | `#1d1d1c` | `#ececea` |
| Accent · selection | `#2c62d4` · 16% | `#6b9cff` · 26% |
| Danger · warning · success | `#c4382f` · `#9a6500` · `#2b7547` | `#f06b60` · `#e2ad45` · `#6cc48a` |
| Popover · inverse (tooltip, toast) | `#ffffff` · `#1d1d1c` | `#262625` · `#3a3a38` |

- **Callouts.** Note is a 4% fill. Info, warning, and error are a 6–10% tint
  of their own color with an icon in that color.
- **Code highlighting:** keywords blue, strings green, numbers teal, types
  amber, comments quiet, no italics.
- **People and edit authors** are blue, green, teal. Selection and insertion are their
  color at 13–24%.
- **Document text colors:** gray, red, amber, green, blue. Backgrounds are
  yellow, green, blue, red, gray.

## Geometry and rhythm

- **Radii by role; the same one is never nested inside itself:**
  - 4 — inline elements: code, mention, mark, checkbox;
  - 6 — controls: buttons, menu rows, handles, fields;
  - 8 — blocks: code, callout, image;
  - 10 — popovers: menu, toolbar over the selection, toast;
  - 12 — cards: comment, suggestion.
- **A 1 px line** only where it divides: table rows, the bottom of a pinned
  toolbar, the edge of a side panel.
- **The rhythm step is 4 px.** 8 between paragraphs, 4 between list items. Blocks (code,
  table, image, callout, quote, toggle) get 16 on all sides.
- **A heading keeps distance above and from the text below:** above H1/H2/H3 — 40/32/20,
  below them — 10/8/4; in docs, 36/28/18 above. A divider is 28 on both sides,
  nesting is 24.
- **The notion page:** a 680 column, a 64 margin (the block handle lives in it), 72 on top, 112 at the bottom.

## Views

A view is a set of tokens over one markup (`data-gt-view` on the editor root).
A narrow container changes tokens, not markup: at widths up to 640 the margin is 20, the title
26; up to 359 — the margin is 16. The block handle stays in narrow notion — drag and drop by
finger works through it — and a 56 margin is kept on the left for it. Code and tables
scroll inside themselves, the page does not.

- **notion** — a page that is read and assembled from blocks: icon, title,
  host caption, a 680 column, a handle on the block under the pointer.
- **docs** — a reference page: denser text, a table of contents alongside (goes away on a narrow
  screen), line numbers in code. The block handle is as in notion, in the 64 margin between the table of contents and the
  text; the # anchor goes after the last word of the heading under the pointer, and the heading
  always keeps room for it (owner decision on D-30).
- **modern** — a form or CMS editor: a pinned toolbar above the document,
  the title is the first line, no page header or handles. On a narrow screen the toolbar
  scrolls sideways, and the edge with hidden tools fades out, like a wide table.
- **minimal** — an editor as a field inside someone else's interface: interface font size, no page header
  or handles, formatting through the toolbar over the selection.

## Components

- **Toolbar over the selection:**
  - contents: model, block type, styles, link, color, the rest;
  - an active style sits on a fill, the key is in the tooltip;
  - link and color take the toolbar's place: a field or palette in one row,
    so the text under them stays visible;
  - an invalid address only highlights the field.
- **The "/" menu:**
  - groups with a quiet label, the Markdown shortcut on the right, no descriptions;
  - search highlights the match, an empty result is a single line.
- **Block handle and menu:**
  - the handle does not shift the text;
  - the menu is split into groups, "Turn into" opens to the right with keys.
- **Drag and drop:** a trace (32%) stays in the block's place, the insertion point is shown by
  an accent line, a ghost follows the pointer.
- **Table:**
  - lines between rows, no border and no vertical lines;
  - a chevron in the column header, column type: text, code, number, yes / no;
  - a row and a column are added below the table.
- **Image:** a toolbar in the corner, width handles on the edges, the caption is text. An empty
  block offers upload and a link.
- **Cursors:** a line and a flag with the name in the person's color. The model's cursor is labeled
  with what it is doing.
- **Comments:**
  - words are underlined in amber, an open comment gets a fill;
  - the panel has an "Open / Resolved" filter, a thread with a quote, a reply right in the card.
- **Edit suggestions:**
  - an insertion is underlined in the author's color, a deletion is struck through;
  - above the page is a line: who is editing, how many are waiting, "Accept all";
  - the card stands next to the text; a stale suggestion has only "Reject".
- **Versions:** a list beside the page; the page shows changes since the selected
  version.
- **Model:**
  - the hint text is quiet, stands after the cursor, and is accepted with Tab;
  - the command line is at the bottom of the editor and knows what is selected;
  - while the model writes, the line shows it and lets you stop.

## States

- **Loading** — a page silhouette with no shimmer.
- **Error** — a toast at the top center with an action, or a highlight on the element itself.
- **Read only** — a sign by the title, the reason in a tooltip.
- **Markdown that the editor saves as is** — a quiet block, the reason in a
  tooltip.
- **Unavailable** — a muted item, the reason in a tooltip.
- **Keyboard focus** — the theme ring, 2 px with a 1 px gap, never the browser's.
  Text selection uses the accent color.
- **Empty blocks** hint at what they will become. A new page: an icon on hover,
  the cursor in the title, quick blocks below.

## Keys

Menus show only assigned keys:
- styles — ⌘B, ⌘I, ⌘U, ⇧⌘X, ⌘E, ⌘K (link), ⇧⌘H, ⌘. and ⌘,;
- blocks — ⌥⌘1–6, ⇧⌘7/8/9 (lists) and ⇧⌘B (quote);
- history — ⌘Z and ⇧⌘Z;
- the model command line — ⌘J.

The keys shown are taken from the core bindings; the `formatting/keys.test.ts` test makes sure the
menu does not promise a key that does not exist.

Markdown shortcuts in the "/" menu: `#`, `##`, `###`, `-`, `1.`, `[]`, `>`, ` ``` `, `---`.

## What in the code still differs from the Atlas

Stages 3 and 4 moved all Atlas frames into the editors:
- tokens and four views (`view`), document and blocks (frames 1–5);
- the `PageHead` page header via `header`, an empty page with quick blocks (11);
- the toolbar over the selection with tooltips and keys, link, palette, the "/" menu, block
  menu, drag and drop (6–8), image (10);
- table: a column is added by the strip on the right, a row by the strip under the table; both outside
  the scroll and visible under the pointer or with the cursor in the table; the edge of a wide table with
  hidden columns fades out (9);
- cursors, comments, suggestions, the model line on ⌘J (12–16);
- the loading silhouette, error toast, "read only", image error (17);
- tasks, toggles, file, embed and formula (18);
- PageEditor — the same BlockEditor with a Markdown session and model suggestions (19): the default view is
  notion (owner decision of 12 November), any other through `view`; there is no page theme,
  `page.css` loads the shared theme; the title is the file's first "#";
- the table column menu and row menu (9) — in both editors: the row handle on the left of the row
  under the pointer adds a row above or below and deletes it;
- suggestion cards in a column in the margin of a wide page (14); on a narrow page the card opens
  next to the text;
- the table of contents, block handle, and heading anchors of the docs view (2);
- code highlighting with the `--gt-syn-*` colors (`highlight` and `gotipeCodeTheme`);
- UI strings from `@gotipe/i18n`: English by default, Russian — as in the Atlas.

The check is the "Views" route in the playground (view, state, language). The modern and versions panels there
are drawn after the Atlas, but remain playground examples, not library components.

### Component review

The review went through all blocks and popovers: four views, both themes, widths 1280 and 375,
density 1x and 2x. It looked for rings that split into two lines, extra scroll,
system focus rings and tooltips, English strings, and overflow past the edge. Fixed:
- the ring of the checkbox and the hollow bullet is drawn as a border: on a 1x screen a 1.5 px shadow
  split into a dark and a light line;
- system focus rings. A table cell, the title of a toggle, and an image caption are
  text fields and have no ring. Buttons, handles, the file link, and the "read
  only" lock got the theme ring;
- system `title` tooltips were replaced with theme tooltips: code copy, colors, link
  buttons, the "read only" reason;
- the table scrolled by 3 px because of the last column's width handle;
- the image toolbar stretched across the full width above the picture instead of sitting in the corner;
- an image that failed to load showed the browser icon. Now it has its own
  state, and the file has a highlighted card;
- a load error is a toast, not a line under the block;
- the image and file spoke English. The file size is written by the language's rules.
  An empty image and file offer "Upload" and "By link";
- the embed and the formula had no view: an empty paragraph was inserted from the "/" menu;
- the hints of an empty task, list item, quote, and toggle are always visible,
  as in frame 11; for a paragraph — only under the cursor.

Still differs:

- **The handle stays on a narrow screen** — an owner decision: drag and drop by finger works
  through it, so notion keeps a margin for it on the left.

A host's own callout ("Agent instructions") was removed from the library: the codec reads such a
quote as a quote, and the host draws its own view through `blockViews`.

## Related documents

- [GoTipe Atlas](../design/atlas/README.md): build, check, frames.
- [Theme and multiple editors](development/theme.md): the theme API.
- [Internationalization](../docs-site/ui/i18n.md).
- [Host](../docs-site/concepts/host.md): the host takes the shared view and passes its colors
  through `--gt-*`.
