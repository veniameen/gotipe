# GoTipe Atlas

A drawing of the library's views. A view is drawn here first and accepted by the owner, then carried
over to `packages/theme` and `packages/block-editor`.

- `src/tokens.css`, `src/tokens-views.css`, `src/tokens-ui.css` — tokens. These are the only files
  with literal colors and sizes:
  - `--gt-*` belong to the library: light/dark themes, view presets through `data-gt-view`, interface
    sizes;
  - `--at-*` style the Atlas page itself.
- `src/document.css`, `src/blocks.css` — the document and blocks, shared by all views.
- `src/views/*.css` — the layout of the views: notion, docs, modern, minimal.
- `src/ui/*.css` — popups, menus, panels, collaboration, review, states; inline elements (mentions,
  emoji, formulas), find and the counter, text and cell layout, version history.
- `src/content/` — the real text and its drawings.
- `src/figures/NN-*.html` — frames by number; `src/shell.html` — the page; `src/atlas.js` — the
  theme switch at the top of the page: light or dark.
- `atlas.html` — the built file. It opens in a browser with no server and no network.

A frame is written once between `<!-- @frame frame=… view=… w=… -->` and `<!-- @end -->`.
The theme of all frames is chosen at once by the switch at the top of the page, as in Specimen v6;
narrow frames stand side by side, wide ones one by one.

Frame parameters:
- `w` — width: 320, 375, 480, 768, 1024 or 1440;
- `h` — a screen cut at the bottom;
- `min` — the least height of a frame with a menu;
- `label` — the frame's caption.

The index and section headings are built from `data-section` and the frame titles.

## Build and check

```bash
node design/atlas/build.mjs
node design/atlas/check.mjs
```

Without a browser the check fails if:
- `atlas.html` differs from the build from the parts;
- outside the token files there is a literal color, size, weight, line height, font family or a size
  in an `@media` / `@container` condition;
- some `var()` is not defined;
- the markup has `style=`, an external resource or a color set by an attribute.

In Chromium the check walks the page twice, switching the theme with the same switch, and fails if:
- the page has errors or network requests;
- the switch did not change the theme, a frame's background does not match the theme, a figure has no
  frames, or an index entry has no figure;
- something leaves its frame horizontally or vertically (except cut screens and the contents of
  scrollable areas) or is clipped;
- neighboring blocks overlap or a block handle covers text;
- text leaves the background of its plate (`lib/text-plates.mjs`): a line lies inside every ancestor
  that paints a fill, an image, a border on all sides or a shadow under it — tooltips, menus, labels,
  buttons, cells, the frame itself — up to the first element out of flow (`absolute`, `fixed`).
  What an `overflow` clip hides does not count, nor does a scroll, but a scroll cuts text only along
  the axis its rules name: `overflow-x`, `overflow-y` or `overflow` for both. A menu list does not
  cut a label sideways, and a panel track without `is-open` does not cut the tooltip under it. Sideways
  the tolerance is half a pixel, vertically a quarter of the font size: a line is taller than its
  letters. The text of pseudo-elements (`::before`, `::after`) is not measured;
- the text contrast is below the threshold on its real background, counting popup surfaces and
  fills.

A problem already recorded as a finding is entered in `lib/known.mjs`: the check prints it
under the finding's number and does not fail. When the frame is fixed, the check fails until the entry
is removed and the finding is closed.

Snapshots of the frames in both themes are saved to `output/atlas/` (outside Git); the `--no-shots`
flag skips them. Without Playwright's browsers the check can run in an installed Chrome:
`GOTIPE_E2E_CHANNEL=chrome node design/atlas/check.mjs`.

The text-on-a-plate rule and the list of known findings are covered by tests; the browser ones need
the same Chromium or Chrome:

```bash
node --test design/atlas/lib/*.test.mjs
```

## A host's frames

A host of the library can draw its own pages over these parts. It adds its files to `src/` and names
them in `src/host.json`:

```json
{
  "tokens": ["tokens-host.css"],
  "styles": ["host/page.css"],
  "icons": ["host/icons.svg"],
  "figures": ["figures/40-home.html"]
}
```

Its token files follow the library's and, with them, are the only parts with literal colors and
sizes; its styles and sprites follow the library's. The page then holds the host's figures alone,
drawn with every style, and the check holds them to the same rules. This repository has no
`host.json`; GoTipe's own site draws frames 20–21 this way.

## Frames

1–4. One document in four views: notion, docs, modern, minimal. The docs view also has the block
handle and the heading anchor: at rest and under the pointer, on a narrow screen.

5. Widths 375, 320, 768 and 1440.

6–11. Interaction:
- selection, link and color;
- the “/” menu;
- handle, block menu and drag;
- table: the strips that add a row and a column, a wide table, the column and row menus; no room
  under the table (a host's option), at rest and with the pointer on the table;
- image;
- empty blocks and an empty page.

12–16. Collaboration and review:
- cursors;
- comments;
- suggested edits; a text still being written that ends in inline code (the caret and the
  cursor after its last letter, inside the plate); a suggested table before and after 0.1.5
  (square cells on their own fill, the block after it spaced as after a table), and with a head
  fill;
- versions;
- the model's command bar and its hint.

17. States:
- loading;
- errors: toast, image unavailable, document failed to open;
- read only;
- Markdown as is;
- unavailable;
- keyboard focus.

18. Blocks:
- tasks: the checkbox under the pointer, an empty task;
- toggles: closed, empty, focus on the chevron;
- a file and its actions under the pointer;
- embed: a page card and an empty one that asks for a link;
- a formula as TeX.

19. PageEditor: a wiki page on the shared components; notion by default, docs through `view`.

20–21. The site: its home page and its documentation are drawn where the site lives, as a host's
frames over these parts (A host's frames, above).

22–30. New features:
- mentions: in the text and under the pointer, the list after “@” with ↵ at the chosen one, no one
  found;
- emoji: the list after “:”, a choice from the “/” menu — search, sections, recent, the name in the
  tooltip; a custom emoji in a line;
- an inline formula: set in the document font, the TeX field with a preview, TeX with an error;
- find and replace: the bar in the top right corner, matches and the current one, replace, nothing
  found, phone;
- the word and character counter: no limit, near the limit, over the limit;
- alignment under “More”, aligned heading and paragraphs, font and size in the modern bar;
- invisible characters; a right-to-left paragraph with the handle in the right margin;
- table: a header spanning two columns and a cell spanning two rows, cell selection, “Merge cells” and
  “Split cell” in the row and column menus;
- version history: comparison with the current one by blocks, restore with undo, phone.

31. The fixed bar of the modern view: history, block type, font and size, markup, alignment and lists,
“Insert” with a list of blocks, ¶ on the right; what is on sits on a fill, an unavailable tool gives its
reason in the tooltip; what does not fit goes under “More” in the order of the bar.

32. The handle where the frames did not draw it — a proposal, awaiting the owner's decision (D-260–D-263,
D-269):
- a task under the pointer on a narrow notion: the handle in a 56 margin left of the checkbox
  (`.gotipe-page.is-rail` — the library's notion, docs/18);
- a three-digit number: the list gives it one more digit of room (`--gt-number-digit`);
- the table row handle on a narrow screen: in the block handle's margin, and in minimal with the
  room the first column gives it;
- blocks with no text of their own: the handle by the file name, by the table header row, by the top
  edge of the image.
