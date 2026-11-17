# GoTipe Block Editor — Step-by-Step Implementation Plan

> **Historical specification, not a guide to the current API.** The examples, timelines,
> performance comparisons, commercial terms, and promises below do not confirm an
> implementation or service availability. Current: [contracts](development/editor-contracts.md),
> [code map](development/code-map.md), [checks](development/testing.md),
> [release plan](22-release-readiness.md). Licenses are defined by `LICENSE` and the manifest
> of each package, not by this document.

> Detailed documentation: every feature is broken into atomic steps. We work sequentially — each step is verified before moving on to the next.

---

## Codebase state (audit)

**What really works (not stubs):**
- WASM is compiled (1.8MB binary), `WasmEditor` really applies transactions
- `editor.ts` — a full contentEditable with `beforeinput` handling (insertText, splitBlock, deleteText, mergeBlocks)
- `chain.ts` — 30+ commands (toggleBold, setBlockType, insertBlockAfter, moveBlock, etc.)
- 26 extensions with real keybindings, inputRules, slash commands
- `editor-content.tsx` — renders blocks with `data-block-id`, mounts the editor via `editor.mount()`
- All block-editor UI components (SlashMenu, BubbleMenu, DragHandle, etc.) are really connected to the editor
- `WasmBridge` with a fallback mode (if WASM fails to load — it shows the initial content but does not apply transactions)

**What this means for us:**
- The core works. Problems in the playground are wiring problems, not missing logic.
- Every `editor.chain().toggleBold().run()` is a real call that creates a Transaction → sends it to WASM → gets a new state → fires `viewStateChange` → React re-renders.

---

## Phase 0: A basic working editor ✅

Goal: we open the playground, see text, and can edit it.

> **Status:** Done. A double character insertion bug was found and fixed — `unmount()` did not remove event listeners, and React strict mode attached the handlers twice. Fixed with `AbortController` + an rAF DOM correction as a safety net.

### Step 0.1: Check that WASM loads ✅

**File:** `packages/core/src/wasm-bridge.ts`

**What to check:**
1. Open `http://localhost:5173/#simple` in Chrome DevTools → Console
2. If we see `"GoTipe WASM init failed, using JS fallback:"` — WASM did not load
3. In the Network tab check: is `gotipe_wasm_bg.wasm` loaded?

**Possible problems and solutions:**
- The WASM file is not found → check that `packages/wasm/pkg/gotipe_wasm_bg.wasm` exists
- Vite does not serve `.wasm` → add to the playground's `vite.config.ts`:
  ```ts
  optimizeDeps: { exclude: ['@gotipe/wasm'] }
  ```
- Wrong MIME type → Vite must serve `application/wasm`

**Criterion:** No WASM errors in the console. `editor.wasm.isFallback === false`.

### Step 0.2: Check mount() and contentEditable ✅

**File:** `packages/react/src/editor-content.tsx` (lines 224-228)

**What happens:**
1. `EditorContent` receives `editor` through a prop
2. In `useEffect` it calls `editor.mount(containerRef.current)`
3. `mount()` sets `contenteditable="true"` on the element
4. `mount()` attaches handlers: `beforeinput`, `keydown`, `input`, `selectionchange`, `paste`, `copy`, `cut`

**What to check in DevTools:**
1. Elements → find `<div data-gotipe-content contenteditable="true">` — `contenteditable` must be there
2. If not — the editor is not mounted
3. Click in the area → a text cursor must appear

**Possible problem:** `<Editor>` from `@gotipe/react` renders `<EditorContent>`, which calls `mount()`. If the playground uses `<BlockEditor>` from block-editor, it renders `<Editor>` → `<EditorContent>` → `mount()` inside. The chain is long — check that editor is not null at every level.

**Criterion:** `contenteditable="true"` on the DOM element. A text cursor on click.

### Step 0.3: Check text input ✅

**File:** `packages/core/src/editor.ts` (lines 645-699)

**What happens when a key is pressed:**
1. The browser generates `beforeinput` with `inputType: "insertText"`, `data: "a"`
2. `editor.mount()` intercepts it: `e.preventDefault()`
3. Determines the current cursor position from `currentSelection`
4. Creates a step: `{ type: "insertText", blockId, offset, text: "a", marks: [] }`
5. Calls `this.dispatch({ steps })` → `WasmBridge.apply(transactionJson)`
6. WASM returns the new document JSON
7. The editor parses the JSON → updates `currentState` → calls `emit("viewStateChange")`
8. React re-renders the blocks through `useSyncExternalStore`
9. `scheduleSelectionRestore()` puts the cursor at `offset + 1` through `requestAnimationFrame`

**What can break:**
- `currentSelection` is empty (no `blockId`) — the cursor is not set, the position is unknown
- WASM in fallback → `apply()` returns an unchanged state → the character is not added
- `resolvePosition()` does not find the `data-block-id` element → selection tracking does not work
- React re-renders and disturbs the DOM → `restoreDomSelection()` does not find the text node

**Debugging:**
```js
// In the console, after creating the editor:
editor.on('viewStateChange', () => console.log('State changed:', editor.getViewState().blocks.length));
```

**Criterion:** Type "hello" → see "hello" in the editor. The cursor moves correctly.

### Step 0.4: Check Enter (splitBlock) ✅

**File:** `packages/core/src/editor.ts` (lines 701-728)

**What happens:**
1. `beforeinput` with `inputType: "insertParagraph"`
2. `e.preventDefault()`
3. Step: `{ type: "splitBlock", blockId, offset }`
4. WASM splits the block into two
5. The cursor moves to the start of the new block

**Criterion:** Enter in the middle of text → the text is split into two paragraphs.

### Step 0.5: Check Backspace (deleteText / mergeBlocks) ✅

**File:** `packages/core/src/editor.ts` (lines 731-788)

**Three cases:**
1. **Text is selected** → `deleteText` with `from`/`to`
2. **Cursor inside a block** → `deleteText` with `from: offset-1, to: offset`
3. **Cursor at the start of a block** → `mergeBlocks` with the previous block

**Criterion:** Backspace deletes a character. Backspace at the start of a block merges with the previous one.

### Step 0.6: Check Delete (deleteContentForward) ✅

**File:** `packages/core/src/editor.ts` (lines 791-832)

**Criterion:** Delete deletes a character forward.

---

## Phase 1: Design System — Tokens ✅

Goal: a uniform visual style for all components.

> **Status:** Done. All CSS tokens were added to the `:root` and `[data-theme="dark"]` blocks in `theme.css`. Inter is connected through Google Fonts. The playground imports `theme.css` → all variables are available CSS-first (without waiting for JS). The theme toggle works correctly.

### Step 1.1: Update the CSS variables in theme.css ✅

**File:** `packages/theme/src/theme.css`

**Add/update:**

```css
:root {
  /* Colors */
  --gt-accent: #2563eb;
  --gt-accent-text: #ffffff;
  --gt-bg: #ffffff;
  --gt-bg-hover: rgba(0, 0, 0, 0.04);
  --gt-bg-active: rgba(37, 99, 235, 0.08);
  --gt-bg-selected: rgba(37, 99, 235, 0.06);
  --gt-text-base: #1a1a1a;
  --gt-text-secondary: #666666;
  --gt-text-tertiary: #999999;
  --gt-border: rgba(0, 0, 0, 0.08);
  --gt-border-light: rgba(0, 0, 0, 0.05);
  --gt-border-focus: #2563eb;

  /* Shadows — a soft 4-layer one */
  --gt-shadow-elevated:
    0px 16px 48px 0px rgba(17, 24, 39, 0.04),
    0px 12px 24px 0px rgba(17, 24, 39, 0.04),
    0px 6px 8px 0px rgba(17, 24, 39, 0.02),
    0px 2px 3px 0px rgba(17, 24, 39, 0.02);

  /* Radii */
  --gt-radius-sm: 6px;
  --gt-radius-md: 8px;
  --gt-radius-lg: 12px;
  --gt-radius-card: 20px;

  /* Fonts */
  --gt-font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --gt-font-mono: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;

  /* Text sizes */
  --gt-text-xs: 12px;
  --gt-text-sm: 14px;
  --gt-text-base-size: 16px;
  --gt-text-lg: 18px;
  --gt-text-xl: 20px;

  /* Highlighting — 5 colors */
  --gt-highlight-blue-bg: #dbeafe;
  --gt-highlight-blue-text: #1e40af;
  --gt-highlight-green-bg: #dcfce7;
  --gt-highlight-green-text: #166534;
  --gt-highlight-yellow-bg: #fef9c3;
  --gt-highlight-yellow-text: #854d0e;
  --gt-highlight-red-bg: #fecaca;
  --gt-highlight-red-text: #991b1b;
  --gt-highlight-purple-bg: #f3e8ff;
  --gt-highlight-purple-text: #6b21a8;

  /* Z-index */
  --gt-z-toolbar: 30;
  --gt-z-menu: 40;
  --gt-z-bubble: 50;
  --gt-z-modal: 60;
  --gt-z-ai: 70;
}
```

**Check:** Import `@gotipe/theme/base.css` in the playground → all components use the tokens.

### Step 1.2: Dark theme ✅

**File:** `packages/theme/src/theme.css`

**Add:**
```css
[data-theme="dark"] {
  --gt-bg: #1a1a1a;
  --gt-bg-hover: rgba(255, 255, 255, 0.06);
  --gt-bg-active: rgba(96, 165, 250, 0.15);
  --gt-bg-selected: rgba(96, 165, 250, 0.1);
  --gt-text-base: #e5e5e5;
  --gt-text-secondary: #a3a3a3;
  --gt-text-tertiary: #737373;
  --gt-border: rgba(255, 255, 255, 0.1);
  --gt-border-light: rgba(255, 255, 255, 0.06);
  --gt-accent: #60a5fa;
  /* ... all the other dark theme tokens */
}
```

**Check:** ThemeToggle switches → all colors change.

### Step 1.3: Connect the Inter font ✅

**File:** `apps/playground/index.html`

**Add:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**Check:** The text in the editor is shown in the Inter font.

---

## Phase 2: Marks (text formatting) ✅

> **Status:** Done. All 9 marks work through the JS fallback transform engine. 3 critical bugs were found and fixed: (1) `resolveExtensions` did not flatten nested arrays from presets, (2) `WasmBridge.apply()` in fallback mode did not apply transactions — a full JS transform engine (~250 lines) was implemented, (3) `forceFallback()` received the JS document format instead of the WASM format. 26 unit tests and 10 E2E tests through Playwright were written.

Each mark is a separate step. The order is from simple to complex.

### Step 2.1: Bold ✅

**How it works:**
1. The user selects text
2. Presses Cmd+B (or the B button in the toolbar)
3. The Bold extension (in `packages/core/src/extensions/marks.ts`) registers a keybinding: `Mod-b`
4. The handler calls `editor.chain().toggleBold().run()`
5. `chain.ts` → `toggleMark("bold")` → creates a step `{ type: "addMark", blockId, from, to, mark: { type: "bold", attrs: {} } }`
6. WASM adds the mark to the spans in the given range
7. ViewState is updated → TextRenderer renders a `<strong>` tag

**Files involved:**
- `packages/core/src/extensions/marks.ts` → the `defineBold` extension
- `packages/core/src/chain.ts` → `toggleMark()` (lines 70-94)
- `packages/react/src/text-renderer.tsx` → renders the mark as `<strong>`
- `packages/core/src/editor.ts` → `beforeinput` + `dispatch()`

**What to check:**
1. Select text → Cmd+B → the text became bold (`<strong>` in the DOM)
2. Cmd+B again → bold removed
3. The B button in the toolbar is highlighted when the cursor is in bold text
4. Input rule: `**text**` → bold (if enabled)

**Problems and how to solve them:**
- The text does not become bold → check that `currentSelection` tracks from/to correctly
- WASM does not apply the mark → check the transaction format: `toWasmTransaction()` converts the `addMark` step correctly
- `<strong>` is not rendered → check `TextRenderer` — does it handle the mark type "bold"

### Step 2.2: Italic ✅

Same as Bold. Keybinding: `Mod-i`. Mark type: `"italic"`. Tag: `<em>`.
Input rule: `*text*` → italic.

### Step 2.3: Underline ✅

Keybinding: `Mod-u`. Mark type: `"underline"`. Tag: `<u>`.
No input rule.

### Step 2.4: Strikethrough ✅

Keybinding: `Mod-Shift-x`. Mark type: `"strikethrough"`. Tag: `<s>`.
Input rule: `~~text~~` → strikethrough.

### Step 2.5: Inline Code ✅

Keybinding: `Mod-e`. Mark type: `"code"`. Tag: `<code>`.
Input rule: `` `text` `` → code.

### Step 2.6: Link ✅

**Extra complexity:** Link has an `href` attribute.

**How it works:**
1. Select text → press the Link button (or Cmd+K)
2. `prompt("Enter URL:")` — ask the user for a URL
3. `editor.chain().setLink(href).run()` → `addMark("link", { href })`
4. TextRenderer renders `<a href="...">`

**What to check:**
1. Select text → insert a link → the text becomes a clickable link
2. Click the link again → the option to remove the link mark
3. `toolbar.activeMarks` contains "link" when the cursor is inside a link

### Step 2.7: Highlight ✅

Mark type: `"highlight"`. Attrs: `{ color: "#dbeafe" }`.
Tag: `<mark style="background: ...">`.

5 colors from the design system. Keybinding: `Mod-Shift-h`.

### Step 2.8: Superscript / Subscript ✅

Mark types: `"superscript"`, `"subscript"`. Tags: `<sup>`, `<sub>`.
These two marks are mutually exclusive — activating one removes the other.

---

## Phase 3: Block Types

### Step 3.1: Paragraph (basic)

**Already works.** This is the default block. Rendered as `<p>`.

**Check:** A new block is created on Enter. An empty paragraph shows the placeholder "Type '/' for commands...".

### Step 3.2: Heading (H1-H6)

**How it works:**
1. Extension: `packages/core/src/extensions/heading.ts`
2. Keybindings: `Mod-Alt-1` → H1, `Mod-Alt-2` → H2, `Mod-Alt-3` → H3
3. Input rules: `# ` → H1, `## ` → H2, `### ` → H3
4. Slash commands: "Heading 1", "Heading 2", "Heading 3" in the slash menu
5. Toolbar dropdown: choosing the block type

**What to check:**
1. Type `## ` at the start of a line → the block becomes H2
2. Cmd+Alt+2 → the current block becomes H2
3. Choose H2 in the toolbar dropdown → the block changes
4. Slash menu: `/heading 2` → an H2 block is inserted

**Files:**
- `packages/core/src/extensions/heading.ts` — extension definition
- `packages/react/src/editor-content.tsx` — renders `<h1>`...`<h6>` (lines 48-55)
- `packages/core/src/chain.ts` → `setBlockType("heading", { level: 2 })`

### Step 3.3: Bullet List

**How it works:**
1. Extension: `packages/core/src/extensions/bullet-list.ts`
2. Input rule: `- ` or `* ` at the start of a line → creates a bulletList + listItem
3. Keybinding: `Mod-Shift-8`
4. Toggle: `editor.chain().toggleBulletList().run()`

**Block structure:**
```
bulletList (children: [listItem, listItem, ...])
  listItem (content: TextSpan[])
  listItem (content: TextSpan[])
```

**What to check:**
1. `- ` at the start → a list marker appears
2. Enter at the end of an item → a new listItem
3. Enter in an empty listItem → exit the list (back to a paragraph)
4. Tab → indent (nested list)
5. Shift+Tab → outdent

### Step 3.4: Ordered List

Same as Bullet List. Input rule: `1. ` or `1) `. Keybinding: `Mod-Shift-7`.

### Step 3.5: Todo List

**Extra complexity:** a checkbox with a `checked` state.

**Structure:**
```
todoList (children: [todoItem, todoItem, ...])
  todoItem (attrs: { checked: false }, content: TextSpan[])
  todoItem (attrs: { checked: true }, content: TextSpan[])
```

**What to check:**
1. `[] ` or `[ ] ` → creates a todo list
2. The checkbox is clickable → changes the `checked` attr through `setBlockAttrs()`
3. Struck-through text on completed items (optional)

### Step 3.6: Code Block

**How it works:**
1. Extension: `packages/core/src/extensions/code-block.ts`
2. Input rule: ` ``` ` → codeBlock
3. Content: `string` (not TextSpan[])
4. Attrs: `{ language: "javascript" }`

**View component:** `packages/block-editor/src/views/code-block-view.tsx`
- Shiki syntax highlighting (lazy loaded)
- Language selector dropdown
- Copy button (copies the code to the clipboard)
- Line numbers

**What to check:**
1. ` ```js ` → a code block with JavaScript highlighting
2. Tab inside a code block → inserts 2 spaces (instead of moving focus)
3. Shift+Tab → removes 2 spaces (dedent)
4. Language dropdown → changes the highlighting
5. Copy button → the code is in the clipboard

### Step 3.7: Blockquote

Input rule: `> ` → blockquote. Rendered as a `<blockquote>` with an accent left border.

### Step 3.8: Divider (Horizontal Rule)

Input rule: `---` → divider. Rendered as `<hr>`.

### Step 3.9: Callout

Slash command: `/callout`. Attrs: `{ emoji: "💡" }`. Rendered as a box with an emoji and text.

### Step 3.10: Image

**View:** `packages/block-editor/src/views/image-view.tsx`

**Full cycle:**
1. Slash command `/image` → inserts an image block without src
2. An upload zone is shown (click or drag-and-drop)
3. The user picks a file → `URL.createObjectURL()` for the preview
4. Simulated upload progress (in prod — a real upload handler)
5. Block attrs are updated: `{ src, width, height }`
6. Resize handles: 8 points, aspect ratio lock, min 50px
7. Caption: an editable figcaption

**What to check, step by step:**
1. `/image` → the upload zone is visible
2. Click → file picker → the image is displayed
3. Drag a file onto the upload zone → the image is displayed
4. Hover over the image → 8 resize handles are visible
5. Drag a corner handle → the size changes while keeping proportions
6. Shift+drag → free resizing
7. Click the caption → the text can be edited

### Step 3.11: Table

**View:** `packages/block-editor/src/views/table-view.tsx`

**Structure:**
```
table (children: [tableRow, tableRow, ...])
  tableRow (children: [tableCell, tableCell, ...])
    tableCell (content: TextSpan[], attrs: { header: true/false })
```

**What to check:**
1. Slash command `/table` → a 3×3 table with a header
2. Tab → next cell
3. Shift+Tab → previous cell
4. Tab in the last cell → a new row
5. Hover over the right edge → a "+" button (add a column)
6. Hover over the bottom edge → a "+" button (add a row)
7. Drag the border between columns → resize (min 100px)
8. Header row: bold text, gray background

### Step 3.12: Toggle (Details/Summary)

Rendered as `<details><summary>`. Click the summary → toggle open/closed.

### Step 3.13: Columns

A layout block with several columns. Slash command `/columns`.

---

## Phase 4: UI Components

### Step 4.1: Slash Menu

**File:** `packages/block-editor/src/components/slash-menu.tsx`

**How it is activated:**
1. The user types `/` at the start of an empty block
2. The `SlashCommands` extension in `behaviors.ts` catches the input rule `^/$`
3. Calls `editor.emit("openSlashMenu", { position })`
4. The `SlashMenu` component listens for this event → shows the menu

**Functionality:**
- 4 categories: AI, Style, Insert, Upload
- Fuzzy search with scoring (prefix > substring > fuzzy)
- Match highlighting through `<mark>`
- Keyboard nav: Arrow Up/Down, Enter, Escape
- Viewport edge detection for positioning
- Choosing an item → `item.execute(editor)` → inserts the block

**What to check:**
1. Type `/` → the menu appears
2. Type `/head` → filtered to "Heading 1/2/3"
3. Arrow Down → the selection moves
4. Enter → the block is inserted, the menu closes
5. Escape → the menu closes
6. Click outside the menu → it closes
7. The menu is positioned next to the cursor and does not go outside the viewport

### Step 4.2: Bubble Menu ✅

> **Status:** Done. All sections work: Block Type dropdown (Paragraph/H1-H3/Lists/Quote/Code), Formatting buttons (B/I/U/S/Code/Link), Text Color picker (5 highlight + 5 text colors + reset), More menu (Superscript/Subscript/Clear Formatting/Copy as Markdown). The menu appears above the selection and hides when the selection is cleared. Positioning with edge detection (flip below if too close to the top, clamp horizontally). Mobile: a fixed bottom bar.

**File:** `packages/block-editor/src/components/bubble-menu.tsx`

**How it is activated:**
1. The user selects text (a selection range, not collapsed)
2. The `BubbleMenu` component from `@gotipe/react` tracks the selection
3. If the selection is not empty — it shows the toolbar

**Sections (left to right):**
1. **AI Improve** (✨) — if the AI extension is active
2. **Block Type dropdown** — Paragraph, H1-H3, Lists, Quote, Code
3. **Formatting** — B, I, U, S, Code, Link (32×32px buttons)
4. **Text Color** (A▾) — 5 highlight colors + text color
5. **More** (⋮) — Superscript, Subscript, Clear Formatting, Copy as Markdown

**What to check:**
1. Select text → the bubble menu appears above the selection
2. B → the text is bold (highlighted if it is already bold)
3. Block Type dropdown → choose H2 → the block changes type
4. Color picker → choose a color → the text is highlighted
5. More → Clear Formatting → all marks are removed
6. The menu disappears when the selection is cleared

### Step 4.3: Block Toolbar (Drag Handle + Add + Context Menu)

**File:** `packages/block-editor/src/components/block-toolbar.tsx`

**How it works:**
1. On hover over a block — a toolbar with two buttons appears on the left:
   - `+` (Add) → inserts a new paragraph after this block
   - `⠿` (Drag Handle) → drag-and-drop OR click → context menu

**Drag and Drop:**
1. Pressing `⠿` → `draggable=true`, `dataTransfer.setData("text/gotipe-block-id", blockId)`
2. On drag-over other blocks → a drop indicator (a 2px accent line)
3. Drop → `editor.chain().moveBlock(blockId, targetIndex).run()`

**Context Menu (click on ⠿):**
- Delete → `editor.chain().deleteBlock(blockId).run()`
- Duplicate → `editor.chain().duplicateBlock(blockId).run()`
- Reset Formatting → `editor.chain().setBlockType("paragraph").run()`
- Copy to Clipboard → `navigator.clipboard.writeText(...)`

**What to check:**
1. Hover over a block → the toolbar is visible on the left
2. `+` click → a new paragraph below
3. Drag `⠿` → the block is dragged, the indicator shows where to
4. Drop → the block is moved
5. Click `⠿` → context menu
6. Delete → the block is deleted
7. Duplicate → a copy of the block below

### Step 4.4: AI Command Bar

**File:** `packages/block-editor/src/components/ai-command-bar.tsx`

**How it is activated:** `Cmd+K` (or always visible in the Agent Editor)

**Functionality:**
1. An input with the placeholder "Tell AI what to change..."
2. Enter → `editor.emit("executeAiCommand", { commandId: "freeText", prompt })`
3. The AI extension handles the command → generates text
4. Escape → closes

**What to check:**
1. Cmd+K → the bar appears, the input is focused
2. Type a prompt → Enter → the AI processes it
3. Escape → closes
4. Click outside → closes

### Step 4.5: Suggestion Toolbar (AI Proofread)

**File:** `packages/block-editor/src/components/suggestion-toolbar.tsx`

**When visible:** After AI Proofread → suggestions were found

**Functionality:**
- Counter: `1/5`
- Navigation: `◄` `►`
- Accept / Reject the current suggestion
- Accept All / Reject All

### Step 4.6: Comment Sidebar

**File:** `packages/block-editor/src/components/comment-sidebar.tsx`

**Functionality:**
- Filter tabs: Open (N) / Resolved (N)
- Comment threads: author, timestamp, body, quoted text
- A reply input in every thread
- Resolve/Unresolve
- Navigation: ◄ 2/7 ►
- Scroll-to-anchor: click a comment → scroll to the text in the editor

### Step 4.7: Theme Toggle

**File:** `packages/block-editor/src/components/theme-toggle.tsx`

**Functionality:**
- 3 modes: Light, Dark, System
- Integration with `@gotipe/theme`: `getTheme()`, `setTheme()`, `onThemeChange()`
- Sets `data-theme="dark"` on `<html>`

---

## Phase 5: Toolbar in the playground (StaticToolbar)

### Step 5.1: Reactive toolbar state

**File:** `apps/playground/src/shared/toolbar.tsx`

**How it works:**
```tsx
const toolbar = useEditorState<ToolbarState>(editor, (state) => state.toolbar);
```

`useEditorState` subscribes to `viewStateChange` → on every state change it calls the selector → which returns:
```ts
{
  activeMarks: ["bold", "italic"],   // which marks are active at the cursor
  activeBlockType: "heading",        // the type of the current block
  activeBlockAttrs: { level: 2 },    // attrs of the current block
  canUndo: true,                     // whether undo is possible
  canRedo: false,                    // whether redo is possible
}
```

**What to check:**
1. Put the cursor in bold text → the B button is highlighted
2. Put the cursor in a heading → the dropdown shows "Heading 2"
3. Undo something → the Undo button is active
4. Undo everything → the Undo button is disabled

### Step 5.2: Formatting buttons

Each button:
```tsx
<button
  className={`gotipe-toolbar-btn ${isMarkActive('bold') ? 'active' : ''}`}
  onClick={() => editor.chain().toggleBold().run()}
>
```

### Step 5.3: Block type dropdown

```tsx
<select
  value={headingLevel > 0 ? `h${headingLevel}` : 'paragraph'}
  onChange={(e) => {
    const val = e.target.value;
    if (val === 'paragraph') editor.chain().setBlockType('paragraph').run();
    else editor.chain().setBlockType('heading', { level: parseInt(val.replace('h', '')) }).run();
  }}
>
```

### Step 5.4: Insert dropdown

Table, Code Block, Blockquote, Divider, Callout — each through `insertBlockAfter()` or `setBlockType()`.

---

## Phase 6: AI Features

### Step 6.1: AI Provider Interface

**File:** `packages/ai/src/extension.ts`

**Interface:**
```ts
interface AiProvider {
  generateCompletion(context): AsyncIterable<string>;
  streamRewrite?(text, context): AsyncIterable<string>;
  proofread?(context): Promise<ProofreadSuggestion[]>;
  reviewComments?(context): Promise<ReviewComment[]>;
  generateParagraph?(prompt, context): AsyncIterable<string>;
  executeCommand(command, context): Promise<string>;
}
```

All methods are async/streaming. The mock provider in the playground uses `delay()` + `yield` to simulate this.

### Step 6.2: Level 1 — Ghost Text (Autocomplete)

**Extension:** `defineAi`

**How it works:**
1. The user stops typing (debounce ~500ms)
2. The AI extension collects the context (surrounding blocks)
3. Calls `provider.generateCompletion(context)`
4. The provider streams text token by token
5. The received text is shown as a ghost decoration (gray text after the cursor)
6. Tab → accepts the ghost text (inserts it into the document)
7. Escape / continued typing → the ghost text disappears

**What to check:**
1. Stop typing → after 500ms gray suggestion text appears
2. Tab → the text is inserted
3. Escape → the suggestion disappears
4. Keep typing → the suggestion disappears

### Step 6.3: Level 2 — AI Context (Improve + Continue Writing)

**Extension:** `defineAiContext`

**"Improve" (in the Bubble Menu):**
1. Select text → Bubble Menu → ✨ Improve
2. `editor.emit("executeAiCommand", { commandId: "rewrite" })`
3. The AI extension takes the selected text
4. Calls `provider.streamRewrite(text, context)`
5. Shows the result as a suggestion (green highlight = addition, gray strikethrough = deletion)
6. Accept / Reject

**"Continue Writing" (in the Slash Menu):**
1. `/continue` or "/Continue Writing"
2. The AI generates the next paragraph
3. The text is streamed word by word into a new block

### Step 6.4: Level 3 — AI Agent

**Extension:** `defineAiAgent`

**Proofread:**
1. The "Proofread" button in the AI sidebar
2. `editor.emit("executeAiCommand", { commandId: "proofread" })`
3. The AI scans the whole document
4. Returns an array of suggestions: `[{ blockId, from, to, originalText, suggestedText, reason }]`
5. Suggestions are displayed as inline decorations (green = suggestion, gray = original)
6. The Suggestion Toolbar appears: `1/5 ◄ ► [Accept All] [Reject All]`

**AI Comments (Review):**
1. The "Add AI Comment" button in the AI sidebar
2. The AI analyzes the document
3. Returns comments: `[{ blockId, content, type: "suggestion" | "note" }]`
4. The comments appear in the Comment Sidebar

**Add Paragraph:**
1. The "Add new paragraph" button → the prompt "about the topic"
2. The AI generates text → streams it into a new block after the current one

**Rewrite Selection:**
1. The "Adjust text selection" button
2. The AI takes the selected text → rewrites it → shows it as a suggestion

### Step 6.5: AI Status Indicator

**File:** `packages/block-editor/src/components/ai-status-indicator.tsx`

While the AI is working it shows a footer bar: "Proofreading...", "Generating...", "Reviewing..."

---

## Phase 7: Collaboration

### Step 7.1: CRDT Sync

**File:** `packages/collaboration/src/extension.ts`

**How it works:**
1. `defineCollaboration.configure({ wsUrl, documentId, token, user })`
2. On connect: `WasmBridge.enableCollaboration(peerId)`
3. WebSocket binary protocol (NOT JSON):
   - Message types: 0x01 (sync step), 0x02 (awareness), 0x03 (update), etc.
   - zstd compression
4. Every `dispatch()` generates a CRDT update → sends it over the WebSocket
5. Incoming updates: `WasmBridge.receiveUpdate(binary)` → new state

### Step 7.2: Remote Cursors

**File:** `packages/block-editor/src/components/collaboration-cursors.tsx`

Decorations with `type: "remote-cursor"` → rendered as colored marks with the user's name.

### Step 7.3: Awareness

Each user's cursor position is transmitted through the awareness protocol.

---

## Phase 8: Export

### Step 8.1: HTML Export

```ts
editor.getHTML() → WasmBridge.exportHtml()
```

WASM converts Block[] → an HTML string. Sanitization through ammonia (Rust).

### Step 8.2: Markdown Export

```ts
editor.getMarkdown() → WasmBridge.exportMarkdown()
```

### Step 8.3: JSON Export

```ts
editor.getJSON() → WasmBridge.getState()
```

Returns `{ version: 1, blocks: [...] }` — it can be saved and loaded back.

---

## Phase 9: Polish and Edge Cases

### Step 9.1: Keyboard Shortcuts

The full list from the extensions:
| Shortcut | Action |
|----------|--------|
| `Mod-b` | Toggle Bold |
| `Mod-i` | Toggle Italic |
| `Mod-u` | Toggle Underline |
| `Mod-Shift-x` | Toggle Strikethrough |
| `Mod-e` | Toggle Code |
| `Mod-k` | Insert Link / Open AI Bar |
| `Mod-Shift-h` | Toggle Highlight |
| `Mod-z` | Undo |
| `Mod-Shift-z` / `Mod-y` | Redo |
| `Mod-Alt-1..6` | Heading 1-6 |
| `Mod-Shift-7` | Ordered List |
| `Mod-Shift-8` | Bullet List |
| `Mod-Shift-9` | Todo List |
| `Tab` | Indent (list) / Next cell (table) / Insert spaces (code) |
| `Shift-Tab` | Outdent / Prev cell / Dedent |
| `Enter` | Split block / New list item |
| `Backspace` | Delete char / Merge blocks |

### Step 9.2: Input Rules

| Pattern | Result |
|---------|--------|
| `**text**` | Bold |
| `*text*` | Italic |
| `` `text` `` | Code |
| `~~text~~` | Strikethrough |
| `# ` | Heading 1 |
| `## ` | Heading 2 |
| `### ` | Heading 3 |
| `- ` / `* ` | Bullet List |
| `1. ` / `1) ` | Ordered List |
| `[] ` / `[ ] ` | Todo List |
| `> ` | Blockquote |
| `---` | Divider |
| ` ``` ` | Code Block |
| `/` | Open Slash Menu |

### Step 9.3: Clipboard (Copy/Paste)

**File:** `packages/core/src/editor.ts` → `ClipboardHandler`

- Copy: selected text → `text/plain` + `text/html` + `application/x-gotipe` (internal format)
- Paste: if `application/x-gotipe` → insert blocks. If HTML → sanitize through WASM → parse → insert. If plain text → insert as text.
- Cut: Copy + Delete

### Step 9.4: Accessibility

- `role="textbox"`, `aria-multiline="true"` on the editor
- `aria-label` on all buttons
- Keyboard navigation in all menus (Arrow Up/Down, Enter, Escape)
- Focus management when menus open/close
- `aria-live="polite"` on the AI status indicator
- Semantic HTML: `<h1>`-`<h6>`, `<ul>`, `<ol>`, `<blockquote>`, `<table>`, `<details>`

---

## Implementation order (recommended)

- [x] 1. Phase 0: Steps 0.1-0.6 — Basic editing works
- [x] 2. Phase 1: Steps 1.1-1.3 — Design tokens + dark theme + Inter
- [x] 3. Phase 2: Steps 2.1-2.8 — All marks work
- [x] 4. Phase 3: Steps 3.1-3.4 — Paragraph + Heading + Lists
- [x] 5. Phase 3: Steps 3.5-3.8 — Todo + CodeBlock + Blockquote + Divider
- [x] 6. Phase 3: Steps 3.9-3.13 — Callout + Image + Table + Toggle + Columns
- [x] 7. Phase 4: Step 4.1 — Slash Menu
- [x] 8. Phase 4: Step 4.2 — Bubble Menu
- [x] 9. Phase 4: Step 4.3 — Block Toolbar + Drag & Drop
- [x] 10. Phase 5: Steps 5.1-5.4 — Static Toolbar in the playground
- [x] 11. Phase 6: Steps 6.1-6.5 — AI Features
- [x] 12. Phase 7: Steps 7.1-7.3 — Collaboration
- [x] 13. Phase 8: Steps 8.1-8.3 — Export
- [x] 14. Phase 9: Steps 9.1-9.4 — Polish

Each step can be done as a separate PR. We verify before moving on to the next.
