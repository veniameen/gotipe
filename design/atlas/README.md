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
The theme of all frames is chosen at once by the switch at the top of the page, as in Specimen v6
SpecOrbit; narrow frames stand side by side, wide ones one by one.

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

A problem already recorded as a finding in `docs/24` is entered in `lib/known.mjs`: the check prints it
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

20–21. The site — after the owner's reference (zydeo-web, 2026-11-16) in GoTipe's voice: the library's
blue accent, no purple. Text, lines and accent are `--gt-*`; the site's voice is `--site-*` in
`src/tokens-site.css`: Inter (headings 600 with tight tracking, text) and JetBrains Mono (labels,
badges, code) first, the library's system families as the fallback, the font files served by the site
itself; borders with light, glass, thin lines; light and dark values. At the sides of the first screen
on the site there is a nebula (a WebGL shader, the colors of gas and stars are `--site-shade-*`): soft
blue gas frames the text, rare stars on top; the cursor lights and swirls the gas, the stars shift a
little after it; under the text and the header it is quieter, below the first screen it fades; the
frame draws the first screen without it. The quiet header links over the light are `--site-head-ink`,
one step stronger than the page's quiet text: not below 4.5:1 on the scene's glow. All distances are
steps of the `--site-space-*` scale (a 4 px rhythm, like the library's), corners are
`--site-radius-*`; the tokens of parts name a step of the scale, not a number. In the dark theme the
site, as a host, hands its surface to the editors (`--gt-page-bg`, `--gt-overlay` inside `.site`); the
library's pages are not touched. Layout lives in `src/site/`: `landing.css` (shell, headers, footer),
`landing-hero.css` (first screen, facts), `landing-window.css` (windows with a document),
`landing-sections.css` (stack, bento, parts, views), `landing-closing.css` (dark panel, launch,
licenses, finale), `docs.css`. The site repeats these rules in `apps/landing/styles`; motion lives only
in the site's code (`motion.css`), the frame draws the rest state it arrives at:
- home: the first screen's backdrop stands off the window edge equally at the top and at the sides;
  the header is a strip across the whole frame, transparent over the first screen; when scrolling
  starts, its glass smoothly narrows to exactly the page column: the glass edges at the column edges,
  no further, the mark, links and buttons move inside it (`--site-head-pad-x`), all on one middle
  line; the theme is one button, one press, the new theme opens as a circle from the button (on a
  phone, a switch in the menu); in the center the “v0.1” label with a live dot, three lines “Your
  editor. Your engine. Your rules.” — lit headings (`--site-title-ink`, the accent line is
  `--site-title-accent`; “rules.” is highlighted as in the editor, a caret after it), two buttons and
  the install field: the main one is, on a dark page, a gray pill with a soft white light inside, on a
  light one an ink pill with a cold blue (`--site-lamp-*`): the light at the end of the pill follows
  the cursor smoothly and stays where the cursor left, the pill's edge burns by the light — a thin line
  and a glow blurred at 2, 7 and 15 px (`--site-rim-*`; on the light page a thin blue line with almost
  no blur); the second is dark glass in an outline (on a light page a white pill in a neutral outline
  with a soft shadow; `--site-pill-*`), its near edge catches the lamp's light (`--site-catch-*`);
  labels are small caps; under the nebula at the sides lies the editor's interface
  (`--site-ghost-*`), invisible until the cursor lifts it in a soft circle of light; a live Markdown ↔
  document window with a beam along the edge: both sides can be edited — an edit in the document is
  written to Markdown at once, typed Markdown is accepted by the document on a pause, and the block
  under the cursor has a “+” and a handle in the document's left margin (`--site-render-gutter`) (on a
  phone, a “Document / Markdown” switch); the line “Not a wrapper. A foundation.” and the technology
  strip (on a phone, wrapping, no strip); verifiable facts; “The GoTipe stack” — a panel in the page's
  theme: by day light glass and white nodes, by night a night one (`--site-stack-*`): interfaces on the
  left, infrastructure on the right, the engine in the middle, glowing, light runs along its edge;
  comets run along the beams (`--site-comet-*`), nodes flash, the engine responds, the node under the
  cursor lights its beam; and three parts of the stack with the same marks as the bento tiles; in the
  “Everything you need” heading a co-author is at work (`--site-co-*`: a caret with a name, a
  highlighted phrase, the editor's panel); along the left margin, light lines (`--site-lines-*`);
  bento — three tiles in the page's theme with drawn marks (an engine chip, M↓, two people) and live
  pictures (a three-step transaction, Markdown with no rewritten lines, two people in one paragraph),
  behind them light passes into the gaps, in the tiles a glow in a grain of dots (`--site-bento-*`,
  `--site-tile-*`); a 3×3 grid — open cells with drawn gradient marks (`--site-glyph-*`), a large name
  and a MIT or Commercial badge; “One markup. Four looks.” — a view switch with a slider above a
  window of one height; the dark panel “From install to your first edit.” — steps and examples in
  React, Markdown, Vue tabs (inside, the library's dark theme through `data-theme="dark"`); three
  ways to launch with drawn marks (browser, chip, cloud) and large numbers; two license cards of one
  height; the closing strip — the first screen's light in the page's theme with a document built on
  the engine (`--site-build-*`: glass plates in depth — the engine with a ray from the logo (white by
  day, by night a silhouette in the engine's light; `--site-build-manta`), the Markdown source,
  blocks, a page with a co-author's caret; light rises through them) and two buttons; the footer;
- documentation: the header stands on the page columns (the search field starts where the page
  starts); on the left sections with mono headings, the navigation fades at its edges, the current
  page is a blue plate; in the middle the page in the docs view is a GoTipe document: the path and
  tools in one line, packages and license under the description, links in the text underlined, a
  footer line under the page; on the right the outline with a mono heading; search in a dialog; on a
  laptop the outline goes away, on a tablet and a phone the sections go behind a menu button.

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
