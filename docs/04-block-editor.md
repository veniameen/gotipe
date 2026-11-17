# GoTipe — Block Editor (Notion-like UX)

> **Historical specification, not a guide to the current API.** The examples, schedules,
> performance comparisons, commercial terms and promises below do not confirm
> an implementation or service availability. Current: [contracts](development/editor-contracts.md),
> [code map](development/code-map.md), [checks](development/testing.md),
> [release plan](22-release-readiness.md). Licenses are defined by `LICENSE` and each package's
> manifest, not by this document.

> **License:** `@gotipe/block-editor` is a commercial package. The headless core (`@gotipe/core`, `@gotipe/react`, etc.) is MIT.
> GoTipe Cloud subscribers get the Block Editor license for free.

## Overview

`@gotipe/block-editor` is a commercial package with a ready-made Notion-like UI: slash commands, drag-and-drop, floating toolbar, nested blocks, themes. One line, `<BlockEditor />`, gives a full editor.

The headless API (`@gotipe/core` + framework adapters) lets you build **any** UI for free (MIT). Block Editor is for those who want a ready-made Notion-like UX without writing a UI.

### What is MIT and what is commercial

| Free (MIT) | Commercial (`@gotipe/block-editor`) |
|-----------------|--------------------------------------|
| Document model, transforms, commands | `<BlockEditor />` — ready-made component |
| `useEditor()`, `<EditorContent />` | `<SlashMenu />` — slash commands UI |
| All block types (data + commands) | `<BubbleMenu />` — floating toolbar UI |
| All marks (bold, italic, etc.) | `<BlockToolbar />` — drag handle + block menu |
| CRDT collaboration engine | `<DragHandle />` — drag-and-drop UI |
| AI provider interface + commands | `<AIPanel />` — AI ghost text + command palette UI |
| Export (HTML, MD, PDF, DOCX) | Themes (minimal, modern, notion, docs) |
| Framework adapters (React, Vue, Svelte, Solid) | Input rules UI feedback |
| Extension API | Image block UI (resize handles, caption) |
| CSS variables API | Table block UI (column resize, toolbar) |

### Licensing

```tsx
import { BlockEditor } from '@gotipe/block-editor'

<BlockEditor
  licenseKey="ge_xxx"              // JWT key, offline verification
  content={content}
  onChange={setContent}
  theme="notion"
/>
```

- **Key = signed JWT** (ES256). Verified offline, no API calls
- Contains: plan, expiry, allowed domains
- Without a key: the editor works, but with the watermark "GoTipe Block Editor — Unlicensed"
- Dev/localhost: always works without the watermark

### Pricing

| License | Price | Includes |
|----------|------|----------|
| **Block Editor Indie** | $149/app/year | 1 production domain |
| **Block Editor Business** | $499/app/year | up to 10 domains, priority support |
| **GoTipe Cloud** (any plan) | from $29/month | Block Editor license **included** |
| **Enterprise** | Custom | Unlimited domains, source access |

```
┌─────────────────────────────────────────────────────────────┐
│  Block Editor UI                                             │
│                                                             │
│  ┌──── Block Toolbar (drag handle + menu) ────────────────┐ │
│  │  ⠿  H1  Welcome to GoTipe                              │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──── Paragraph block ───────────────────────────────────┐ │
│  │  A **Rust-powered** editor framework with _real-time_  │ │
│  │  collaboration and AI built in.                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──── Floating Toolbar (on text selection) ──────────────┐ │
│  │  B  I  U  S  </> Link  Highlight  ···                  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──── Slash Command Menu (type "/") ─────────────────────┐ │
│  │  / head                                                │ │
│  │  ┌────────────────────────────┐                        │ │
│  │  │  📝 Heading 1              │                        │ │
│  │  │  📝 Heading 2              │ ← keyboard navigation  │ │
│  │  │  📝 Heading 3              │                        │ │
│  │  └────────────────────────────┘                        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──── Nested blocks ────────────────────────────────────┐  │
│  │  • First item                                          │  │
│  │    • Nested item (drag to reorder)                     │  │
│  │      • Deeply nested                                   │  │
│  │  • Second item                                         │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Block Types

### Full catalog

| Block Type | Description | Content | Children | Attrs |
|-----------|----------|---------|----------|-------|
| `paragraph` | Plain text | RichText | None | — |
| `heading` | Heading H1-H6 | RichText | None | `level: 1-6` |
| `bulletList` | Bulleted list | Empty | `listItem[]` | — |
| `orderedList` | Numbered list | Empty | `listItem[]` | `start: number` |
| `listItem` | List item | RichText | Nested lists | `checked: bool\|null` |
| `codeBlock` | Code block | RawText | None | `language: string` |
| `image` | Image | Empty (leaf) | None | `src, alt, width` |
| `blockquote` | Quote | RichText | `paragraph[]` | — |
| `callout` | Callout (info/warning) | RichText | `paragraph[]` | `emoji: string` |
| `divider` | Horizontal rule | Empty (leaf) | None | — |
| `table` | Table | Empty | `tableRow[]` | — |
| `tableRow` | Table row | Empty | `tableCell[]\|tableHeader[]` | — |
| `tableCell` | Table cell | RichText | None | `colspan, rowspan` |
| `tableHeader` | Table header | RichText | None | `colspan, rowspan` |
| `toggle` | Collapsible block | RichText (summary) | Any blocks | `open: bool` |
| `columns` | Columns | Empty | `column[]` | — |
| `column` | A single column | Empty | Any blocks | `width: number` |
| `embed` | Embed (YouTube, Figma...) | Empty (leaf) | None | `url, type` |
| `math` | Formula (KaTeX/MathJax) | RawText | None | — |
| `file` | Attached file | Empty (leaf) | None | `url, name, size, mime_type` |

### JSON Schema for each block type

#### Paragraph

```json
{
  "id": "b1",
  "type": "paragraph",
  "attrs": {},
  "content": [
    { "text": "Hello ", "marks": [] },
    { "text": "world", "marks": [{ "type": "bold" }] }
  ],
  "children": []
}
```

#### Heading

```json
{
  "id": "b2",
  "type": "heading",
  "attrs": { "level": 2 },
  "content": [
    { "text": "Section Title", "marks": [] }
  ],
  "children": []
}
```

#### Bullet List with nested items

```json
{
  "id": "b3",
  "type": "bulletList",
  "attrs": {},
  "content": [],
  "children": [
    {
      "id": "b4",
      "type": "listItem",
      "attrs": {},
      "content": [{ "text": "First item", "marks": [] }],
      "children": []
    },
    {
      "id": "b5",
      "type": "listItem",
      "attrs": {},
      "content": [{ "text": "Second item with nested", "marks": [] }],
      "children": [
        {
          "id": "b6",
          "type": "bulletList",
          "attrs": {},
          "content": [],
          "children": [
            {
              "id": "b7",
              "type": "listItem",
              "attrs": {},
              "content": [{ "text": "Nested item", "marks": [] }],
              "children": []
            }
          ]
        }
      ]
    }
  ]
}
```

#### Todo List (checkbox)

```json
{
  "id": "b8",
  "type": "bulletList",
  "attrs": {},
  "content": [],
  "children": [
    {
      "id": "b9",
      "type": "listItem",
      "attrs": { "checked": false },
      "content": [{ "text": "Buy groceries", "marks": [] }],
      "children": []
    },
    {
      "id": "b10",
      "type": "listItem",
      "attrs": { "checked": true },
      "content": [{ "text": "Write documentation", "marks": [{ "type": "strikethrough" }] }],
      "children": []
    }
  ]
}
```

#### Code Block

```json
{
  "id": "b11",
  "type": "codeBlock",
  "attrs": { "language": "typescript" },
  "content": "const editor = createEditor({\n  extensions: [Paragraph, Heading],\n});",
  "children": []
}
```

#### Image

```json
{
  "id": "b12",
  "type": "image",
  "attrs": {
    "src": "https://example.com/photo.jpg",
    "alt": "A beautiful sunset",
    "width": 600
  },
  "content": null,
  "children": []
}
```

#### Table

```json
{
  "id": "b13",
  "type": "table",
  "attrs": {},
  "content": [],
  "children": [
    {
      "id": "r1",
      "type": "tableRow",
      "attrs": {},
      "content": [],
      "children": [
        {
          "id": "h1",
          "type": "tableHeader",
          "attrs": {},
          "content": [{ "text": "Name", "marks": [{ "type": "bold" }] }],
          "children": []
        },
        {
          "id": "h2",
          "type": "tableHeader",
          "attrs": {},
          "content": [{ "text": "Role", "marks": [{ "type": "bold" }] }],
          "children": []
        }
      ]
    },
    {
      "id": "r2",
      "type": "tableRow",
      "attrs": {},
      "content": [],
      "children": [
        {
          "id": "c1",
          "type": "tableCell",
          "attrs": {},
          "content": [{ "text": "Alice", "marks": [] }],
          "children": []
        },
        {
          "id": "c2",
          "type": "tableCell",
          "attrs": {},
          "content": [{ "text": "Engineer", "marks": [] }],
          "children": []
        }
      ]
    }
  ]
}
```

#### Callout

```json
{
  "id": "b14",
  "type": "callout",
  "attrs": { "emoji": "⚠️" },
  "content": [
    { "text": "This is a warning callout.", "marks": [] }
  ],
  "children": []
}
```

#### Toggle

```json
{
  "id": "b15",
  "type": "toggle",
  "attrs": { "open": false },
  "content": [
    { "text": "Click to expand", "marks": [] }
  ],
  "children": [
    {
      "id": "b16",
      "type": "paragraph",
      "attrs": {},
      "content": [{ "text": "Hidden content here.", "marks": [] }],
      "children": []
    }
  ]
}
```

#### Columns

```json
{
  "id": "b17",
  "type": "columns",
  "attrs": {},
  "content": [],
  "children": [
    {
      "id": "col1",
      "type": "column",
      "attrs": { "width": 50 },
      "content": [],
      "children": [
        {
          "id": "b18",
          "type": "paragraph",
          "attrs": {},
          "content": [{ "text": "Left column", "marks": [] }],
          "children": []
        }
      ]
    },
    {
      "id": "col2",
      "type": "column",
      "attrs": { "width": 50 },
      "content": [],
      "children": [
        {
          "id": "b19",
          "type": "paragraph",
          "attrs": {},
          "content": [{ "text": "Right column", "marks": [] }],
          "children": []
        }
      ]
    }
  ]
}
```

---

## Slash Commands

### How it works

1. The user presses `/` in an empty block or after text
2. A dropdown opens (320px wide, border-radius 20px, 4-layer soft shadow) with fuzzy search
3. Keyboard navigation (↑↓, Enter, Escape)
4. Choosing a command creates a new block or transforms the current one
5. Positioning: next to the cursor, with viewport edge detection (if it does not fit below, it is shown above)

### Categories and commands

The slash menu is split into 4 categories with visual separators:

```
┌──────────────────────────────────────┐
│ 🔍 Search blocks...                  │
├──────────────────────────────────────┤
│ AI                                   │
│  ✨ Continue Writing   AI generates  │
│  💬 Ask AI             Free prompt   │
├──────────────────────────────────────┤
│ STYLE                                │
│  ¶  Text              Plain text     │
│  H1 Heading 1         Large heading  │
│  H2 Heading 2         Medium heading │
│  H3 Heading 3         Small heading  │
│  •  Bullet List       Unordered      │
│  1. Numbered List     Ordered        │
│  ☐  To-do List        Checklist      │
│  "" Blockquote        Quote text     │
│  <> Code Block        Syntax hl.     │
│  📊 Callout           Highlighted    │
│  ▸  Toggle            Collapsible    │
├──────────────────────────────────────┤
│ INSERT                               │
│  @  Mention           Tag a person   │
│  😀 Emoji             Insert emoji   │
│  ⊞  Table             Insert table   │
│  —  Separator         Horizontal     │
│  📑 Table of Contents Auto TOC       │
│  📐 Math              LaTeX equation │
│  🔗 Embed             YouTube, Figma │
│  ⊞  Columns           Multi-column   │
├──────────────────────────────────────┤
│ UPLOAD                               │
│  🖼 Image             Upload image   │
│  📎 File              Upload file    │
└──────────────────────────────────────┘
```

**AI category** is shown only if the AI extension is connected (`AIInline.configure()`).

| Category | Command | Aliases | Action |
|-----------|---------|---------|----------|
| **AI** | Continue Writing | `/continue`, `/ai-continue` | AI generates the next paragraph in the document context |
| **AI** | Ask AI | `/ask`, `/ai`, `/prompt` | Opens the AI prompt input → AI generates content |
| **Style** | Text | `/text`, `/paragraph` | New paragraph |
| **Style** | Heading 1 | `/h1`, `/heading1` | Heading level 1 |
| **Style** | Heading 2 | `/h2`, `/heading2` | Heading level 2 |
| **Style** | Heading 3 | `/h3`, `/heading3` | Heading level 3 |
| **Style** | Bullet List | `/bullet`, `/ul` | Bulleted list |
| **Style** | Numbered List | `/number`, `/ol` | Numbered list |
| **Style** | Todo List | `/todo`, `/checkbox` | List with checkboxes |
| **Style** | Blockquote | `/quote`, `/blockquote` | Quote |
| **Style** | Code Block | `/code` | Code block with syntax highlighting |
| **Style** | Callout | `/callout`, `/info` | Callout block |
| **Style** | Toggle | `/toggle` | Collapsible block |
| **Insert** | Mention | `/mention`, `/@` | User mention |
| **Insert** | Emoji | `/emoji` | Emoji picker |
| **Insert** | Table | `/table` | 3×3 table |
| **Insert** | Separator | `/divider`, `/hr` | Horizontal rule |
| **Insert** | Table of Contents | `/toc`, `/contents` | Auto-generated table of contents |
| **Insert** | Math | `/math`, `/equation` | Math formula (KaTeX) |
| **Insert** | Embed | `/embed` | URL embed (YouTube, Figma, etc.) |
| **Insert** | Columns | `/columns`, `/cols` | Two-column layout |
| **Upload** | Image | `/image`, `/img` | Image upload |
| **Upload** | File | `/file` | File attachment |

### Fuzzy Search

Slash menu search works through fuzzy scoring with priorities:

1. **Exact prefix match** — highest priority (typing `hea` puts `Heading 1` first)
2. **Alias match** — match against an alias (`h1` → `Heading 1`)
3. **Fuzzy substring** — fuzzy search in name + description
4. Matches are highlighted with `<mark>` in the dropdown
5. On an empty result — "No results" with `--gt-text-tertiary`, centered

### Visual specifications

| Property | Value |
|----------|---------|
| Width | `320px` |
| Max-height | `400px` (scrollable) |
| Border-radius | `20px` |
| Shadow | 4-layer soft elevation (see 18-design-system.md) |
| Border | `1px solid rgba(0,0,0,0.05)` |
| Background | `--gt-bg` |
| Category label | `--gt-text-tertiary`, 11px, uppercase, letter-spacing 0.05em |
| Item height | `40px` |
| Item hover | `--gt-bg-hover`, border-radius 6px |
| Item selected (keyboard) | `--gt-bg-selected` |
| Item icon | 20px, margin-right 10px |
| Item title | `--gt-text`, 14px, font-weight 500 |
| Item description | `--gt-text-tertiary`, 12px |
| Appear animation | `opacity + scale(0.98→1) + translateY(4px→0)`, 150ms ease-out |
| Positioning | Next to the cursor; viewport edge detection — if the menu goes off the bottom of the screen, it is shown above |

### TypeScript API

```typescript
// packages/core/src/slash-commands.ts

export type SlashCommandGroup = 'ai' | 'style' | 'insert' | 'upload';

export interface SlashCommand {
  /** Command name */
  name: string;
  /** Aliases for search */
  aliases: string[];
  /** Description */
  description: string;
  /** Icon (SVG icon name from @gotipe/theme) */
  icon: string;
  /** Category — determines the position in the menu and the visual separator */
  group: SlashCommandGroup;
  /** Execute function */
  execute: (editor: GoTipeEditor) => void;
  /** Custom visibility condition */
  shouldShow?: (editor: GoTipeEditor) => boolean;
}

// Registering a custom slash command:
editor.registerSlashCommand({
  name: 'Alert',
  aliases: ['alert', 'warning', 'danger'],
  description: 'Red alert box',
  icon: 'alert-triangle',
  group: 'insert',
  execute: (editor) => {
    editor.chain()
      .insertBlockAfter('callout', { emoji: '🚨' })
      .focus()
      .run();
  },
});
```

### Input Rules (Markdown shortcuts)

Besides slash commands, GoTipe supports Markdown-like input rules:

| Input | Result |
|-------|----------|
| `# ` + space | Heading 1 |
| `## ` + space | Heading 2 |
| `### ` + space | Heading 3 |
| `- ` or `* ` | Bullet list |
| `1. ` | Ordered list |
| `[] ` or `[ ] ` | Todo list |
| `> ` | Blockquote |
| `` ``` `` + enter | Code block |
| `---` + enter | Divider |
| `**text**` | Bold |
| `*text*` | Italic |
| `` `text` `` | Inline code |
| `~~text~~` | Strikethrough |
| `[text](url)` | Link |

---

## Drag and Drop

### Block Reordering

```
Drag Flow (HTML5 Drag API):

1. Hover over block → show drag handle (⠿) + add button (+)
2. mousedown on drag handle → start drag (HTML5 DataTransfer)
3. Dragged block gets elevated shadow + slight scale(1.02)
4. Move mouse → drop indicator line (2px --gt-accent) shows between blocks
5. Indent zone detection for nested blocks
6. Release → MoveBlock step applied, block animates to new position (200ms ease)

┌───────────────────────────────┐
│ +  ⠿  Paragraph 1            │
├───────────────────────────────┤
│ +  ⠿  Paragraph 2  ← drag   │  ──► elevated shadow + scale(1.02)
├───────────────────────────────┤
│ ▬▬▬▬▬▬▬ drop indicator ▬▬▬▬▬│  ← 2px solid --gt-accent
├───────────────────────────────┤
│ +  ⠿  Paragraph 3            │
├───────────────────────────────┤
│ +  ⠿  Paragraph 4            │
└───────────────────────────────┘
```

### Implementation (React)

HTML5 Drag API (NOT @dnd-kit) — the native API with minimal bundle size and better compatibility with touch devices.

```typescript
// packages/block-editor/src/components/DragHandle.tsx

interface DragHandleProps {
  blockId: string;
  editor: GoTipeEditor;
}

export function DragHandle({ blockId, editor }: DragHandleProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/gotipe-block-id', blockId);
    e.dataTransfer.effectAllowed = 'move';

    // Visual state: elevated shadow + scale
    const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
    if (blockEl) {
      blockEl.classList.add('gotipe-block--dragging');
    }
  };

  const handleDragEnd = () => {
    // Remove the visual state
    document.querySelector('.gotipe-block--dragging')
      ?.classList.remove('gotipe-block--dragging');
    // Remove drop indicators
    document.querySelectorAll('.gotipe-drop-indicator--active')
      .forEach(el => el.classList.remove('gotipe-drop-indicator--active'));
  };

  return (
    <button
      className="gotipe-drag-handle"
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      aria-label="Drag to reorder"
      data-gotipe-drag-handle
    >
      ⠿
    </button>
  );
}
```

### Drop Indicator and zones

```css
/* Visual drop indicator line */
.gotipe-drop-indicator--active {
  height: 2px;
  background: var(--gt-accent);
  border-radius: 1px;
  transition: opacity 100ms ease;
}

/* Dragging block — elevated state */
.gotipe-block--dragging {
  box-shadow: var(--gt-shadow-elevated);
  transform: scale(1.02);
  opacity: 0.9;
  transition: all 200ms var(--gt-ease-spring);
}
```

### Nested Block Drag

Blocks can be dragged not only between blocks but also into blocks (nesting):

| Drop Zone | Definition | Action |
|-----------|-------------|----------|
| Between blocks (top/bottom 25%) | Horizontal indicator line | Insert at this level |
| Middle of a block (central 50%) | The whole block is highlighted | Make a child (nest inside) |
| Indent zone (right edge, >75% of width) | Indicator shifted to the right | Make the next sibling in the parent |

### Touch Support

On mobile devices, drag is activated through a **long-press** (300ms) on the drag handle. Feedback: vibration (Haptic API), larger shadow.

---

## Toolbar

### Floating Toolbar (Bubble Menu)

Appears on text selection. Layout from left to right:

```
┌────────────────────────────────────────────────────────────────────┐
│ ✨ Improve │ Paragraph ▾ │ B  I  U  S  </>  🔗 │ A▾ color │ ⋮  │
└────────────────────────────────────────────────────────────────────┘
  AI action   Block Type    Formatting marks       Text     More
              dropdown                             Color    menu
```

**Bubble Menu sections (separated by vertical dividers):**

1. **AI Improve** — a button with the ✨ icon. On click, AI rewrites the selected text as a suggestion (a diff is shown). Shown only when the AI extension is connected.
2. **Block Type dropdown** — the current block type (Paragraph, Heading 1-3, Bullet List, etc.). Click opens a dropdown to change the type.
3. **Formatting marks** — Bold, Italic, Underline, Strikethrough, Inline Code, Link. Buttons are 32×32px, highlighted when the mark is active.
4. **Text Color picker** — an `A` button with a colored underline. Click opens a palette: 5 highlight colors (Blue, Green, Yellow, Red, Purple) + text color + reset.
5. **More (⋮)** — extra options: Superscript, Subscript, Clear Formatting, Copy as Markdown.

**Visual specifications:**

| Property | Value |
|----------|---------|
| Background | `--gt-bg` |
| Border | `1px solid rgba(0,0,0,0.05)` |
| Shadow | 4-layer soft elevation (see 18-design-system.md) |
| Border-radius | `12px` |
| Padding | `4px` |
| Button size | 32×32px, border-radius 12px |
| Button hover | `rgba(0,0,0,0.08)` background |
| Button active (mark on) | `--gt-accent` icon color |
| Divider | 1px vertical line, `rgba(0,0,0,0.05)`, height 20px, margin 0 4px |
| Positioning | Above the selection, centered. If it does not fit above, below. Viewport edge detection. |
| Offset from selection | 8px |
| Animation | `opacity + translateY(4px→0)`, 150ms ease-out |
| Z-index | `--gt-z-bubble: 40` |

```typescript
// packages/block-editor/src/components/BubbleMenu.tsx

export function BubbleMenu({ editor }: { editor: GoTipeEditor }) {
  return (
    <div className="gotipe-bubble-menu" data-gotipe-bubble-menu>
      {/* AI Improve — shown only if the AI extension is connected */}
      {editor.hasExtension('ai') && (
        <>
          <button
            className="gotipe-bubble-btn"
            onClick={() => editor.emit('executeAiCommand', { commandId: 'rewrite' })}
            title="AI Improve"
          >
            <SparklesIcon />
          </button>
          <Separator />
        </>
      )}

      {/* Block Type dropdown */}
      <BlockTypeDropdown editor={editor} />
      <Separator />

      {/* Formatting marks */}
      <ToggleButton mark="bold" editor={editor} icon={<BoldIcon />} />
      <ToggleButton mark="italic" editor={editor} icon={<ItalicIcon />} />
      <ToggleButton mark="underline" editor={editor} icon={<UnderlineIcon />} />
      <ToggleButton mark="strikethrough" editor={editor} icon={<StrikeIcon />} />
      <ToggleButton mark="code" editor={editor} icon={<CodeIcon />} />
      <LinkButton editor={editor} />
      <Separator />

      {/* Text Color picker */}
      <TextColorPicker editor={editor} />

      {/* More menu */}
      <MoreMenu editor={editor} />
    </div>
  );
}
```

### Block Toolbar (Gutter)

Appears on hover over a block. Positioned to the left of the block (-24px). Contains two buttons:

```
  +  ⠿  │ Block content here...
  │  │
  │  └─ Drag handle: drag & drop + click opens context menu
  └──── Add button: opens slash menu at this block position
```

**Add Button (`+`):**
- Click → opens the Slash Menu at the block position
- Shows the slash menu with the cursor at the start of a new block below

**Drag Handle (`⠿`):**
- Drag → HTML5 Drag API drag & drop (see the Drag and Drop section)
- Click → opens the Block Context Menu

**Block Context Menu:**

```
┌──────────────────────────┐
│  ✂️  Delete              │
│  📋 Duplicate           │
│  🧹 Reset Formatting    │
│  📎 Copy to Clipboard   │
└──────────────────────────┘
```

| Item | Shortcut | Action |
|-------|----------|----------|
| Delete | `Cmd+Shift+Backspace` | Delete the current block |
| Duplicate | `Cmd+D` | Duplicate the block below |
| Reset Formatting | — | Remove all marks, return to the paragraph type |
| Copy to Clipboard | — | Copy the block content as plain text + rich text |

**Visual specifications:**

| Property | Value |
|----------|---------|
| Position | To the left of the block, `-24px` from the content edge |
| Appear | `opacity 0→1`, 100ms, on block hover |
| Hide | `opacity 1→0`, 100ms, when the mouse leaves |
| Buttons | 20×20px, `--gt-text-tertiary`, hover: `--gt-text-secondary` |
| Context menu | border-radius 12px, shadow 4-layer, padding 4px |
| Context menu item | 32px height, border-radius 8px, hover `--gt-bg-hover` |
| Touch | Long-press (300ms) on a block → show handles |

```typescript
// packages/block-editor/src/components/BlockToolbar.tsx

export function BlockToolbar({ editor, block }: BlockToolbarProps) {
  const [showContextMenu, setShowContextMenu] = useState(false);

  return (
    <div className="gotipe-block-toolbar" data-gotipe-block-toolbar>
      <button
        className="gotipe-block-add-btn"
        onClick={() => editor.emit('openSlashMenu', { blockId: block.id })}
        aria-label="Add block"
      >
        +
      </button>
      <button
        className="gotipe-drag-handle"
        draggable
        onClick={() => setShowContextMenu(!showContextMenu)}
        aria-label="Drag to reorder, click for options"
        data-gotipe-drag-handle
      >
        ⠿
      </button>
      {showContextMenu && (
        <BlockContextMenu
          editor={editor}
          blockId={block.id}
          onClose={() => setShowContextMenu(false)}
        />
      )}
    </div>
  );
}
```

---

## Inline Marks

| Mark | Keyboard Shortcut | HTML | Markdown |
|------|-------------------|------|----------|
| **Bold** | `Cmd+B` | `<strong>` | `**text**` |
| *Italic* | `Cmd+I` | `<em>` | `*text*` |
| <u>Underline</u> | `Cmd+U` | `<u>` | — |
| ~~Strikethrough~~ | `Cmd+Shift+S` | `<s>` | `~~text~~` |
| `Code` | `Cmd+E` | `<code>` | `` `text` `` |
| [Link](url) | `Cmd+K` | `<a href>` | `[text](url)` |
| <mark>Highlight</mark> | `Cmd+Shift+H` | `<mark>` | `==text==` |
| Superscript | `Cmd+.` | `<sup>` | `^text^` |
| Subscript | `Cmd+,` | `<sub>` | `~text~` |

---

## Nested Blocks

### Nesting Rules

```
Document
├── paragraph              ← no children
├── heading                ← no children
├── bulletList
│   └── listItem           ← children: [bulletList, orderedList]
│       └── bulletList     ← nested list
│           └── listItem
├── blockquote
│   └── paragraph          ← children: [paragraph]
├── callout
│   └── paragraph          ← children: [paragraph]
├── toggle
│   └── paragraph          ← children: any block
│   └── bulletList
├── columns
│   └── column             ← children: any block
│       └── paragraph
│       └── image
├── table
│   └── tableRow
│       └── tableCell      ← no children (rich text only)
└── codeBlock              ← no children (raw text)
```

### Indentation (Tab/Shift+Tab)

| Context | Tab | Shift+Tab |
|----------|-----|-----------|
| List item | Nest as child of previous sibling | Un-nest to parent level |
| Paragraph (in toggle/callout) | Become nested paragraph | Un-nest |
| Code block | Insert tab character | Remove tab character |
| Table cell | Move to next cell | Move to previous cell |

---

## Keyboard Shortcuts

### Global

| Shortcut | Action |
|----------|--------|
| `Cmd+Z` | Undo |
| `Cmd+Shift+Z` | Redo |
| `Cmd+A` | Select all (block → all blocks) |
| `Cmd+C` | Copy |
| `Cmd+X` | Cut |
| `Cmd+V` | Paste |
| `Cmd+Shift+V` | Paste as plain text |
| `Cmd+/` | Toggle slash commands |
| `Escape` | Clear selection / close menus |

### Text Formatting

| Shortcut | Action |
|----------|--------|
| `Cmd+B` | Toggle bold |
| `Cmd+I` | Toggle italic |
| `Cmd+U` | Toggle underline |
| `Cmd+Shift+S` | Toggle strikethrough |
| `Cmd+E` | Toggle inline code |
| `Cmd+K` | Insert/edit link |
| `Cmd+Shift+H` | Toggle highlight |

### Block Operations

| Shortcut | Action |
|----------|--------|
| `Enter` | Split block / new list item |
| `Shift+Enter` | New line within block |
| `Backspace` (at start) | Merge with previous block / un-indent list |
| `Delete` (at end) | Merge with next block |
| `Tab` | Indent |
| `Shift+Tab` | Outdent |
| `Cmd+Shift+↑` | Move block up |
| `Cmd+Shift+↓` | Move block down |
| `Cmd+D` | Duplicate block |
| `Cmd+Shift+Backspace` | Delete block |

### Navigation

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Move cursor between blocks |
| `Cmd+↑` | Go to start of document |
| `Cmd+↓` | Go to end of document |
| `Alt+↑` | Move to start of block |
| `Alt+↓` | Move to end of block |

---

## Comparison with Tiptap/BlockNote

| Feature | GoTipe | Tiptap v3 | BlockNote |
|---------|--------|-----------|-----------|
| **Block paradigm** | Block-first (Notion model) | Node tree (ProseMirror) | Block-first (over Tiptap) |
| **Slash commands** | Built-in, customizable | DIY or extensions | Built-in |
| **Drag and drop** | Built-in, nested support | DragHandle extension (was Pro) | Built-in |
| **Floating toolbar** | Built-in, customizable | BubbleMenu component | Built-in |
| **Block toolbar** | Built-in, customizable | DIY | Built-in |
| **Table** | Full: merge, split, resize | TableKit (v3) | Basic |
| **Columns** | Built-in | DIY | Not built-in |
| **Toggle** | Built-in | Details extension | Not built-in |
| **Math** | Built-in (KaTeX) | Mathematics extension | Not built-in |
| **Embeds** | Built-in (YouTube, Figma, etc.) | YouTube + DIY | Not built-in |
| **Todo list** | Built-in | TaskList extension | Built-in |
| **Callout** | Built-in | DIY | Not built-in |
| **Input rules** | Full Markdown shortcuts | Via extensions | Partial |
| **Keyboard shortcuts** | Comprehensive defaults | Via extensions | Basic |
| **Virtual rendering** | >1000 blocks | Not built-in | Not built-in |
| **License** | MIT (headless) + Commercial (UI) | MIT (core) + Commercial (Editor) | MPL 2.0 |

---

## Styling

### CSS Variables (theming)

> **All CSS variables use the `--gt-*` prefix** (NOT `--gotipe-*`). The full token specification is in [18-design-system.md](18-design-system.md).

```css
/* Core variables — see docs/18-design-system.md for the full list */
:root {
  --gt-font-body: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  --gt-font-mono: "SF Mono", "Fira Code", "JetBrains Mono", monospace;
  --gt-text-base: 16px;
  --gt-line-height-body: 1.625;
  --gt-text: #1f1f1f;
  --gt-text-secondary: #6b6b6b;
  --gt-bg: #ffffff;
  --gt-bg-hover: #f7f7f5;
  --gt-border: #e5e5e5;
  --gt-accent: #2563eb;
  --gt-bg-selected: #e8f0fe;
  --gt-bg-code: #f7f6f3;
  --gt-editor-max-width: 708px;

  /* Highlight palette (5 colors for text/background) */
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

  /* Shadows — 4-layer soft elevation */
  --gt-shadow-elevated:
    0px 16px 48px 0px rgba(17,24,39,0.04),
    0px 12px 24px 0px rgba(17,24,39,0.04),
    0px 6px 8px 0px rgba(17,24,39,0.02),
    0px 2px 3px 0px rgba(17,24,39,0.02);

  /* Border-radius scale */
  --gt-radius-sm: 6px;
  --gt-radius-md: 8px;
  --gt-radius-lg: 12px;
  --gt-radius-xl: 16px;
  --gt-radius-card: 20px;
}

/* Dark theme */
[data-theme="dark"] {
  --gt-text: #e8e8e8;
  --gt-text-secondary: #999999;
  --gt-bg: #191919;
  --gt-bg-hover: #222222;
  --gt-border: #333333;
  --gt-bg-code: #2d2d2d;
}
```

### CSS Classes

```css
/* Block structure */
.gotipe-editor { }
.gotipe-block { }
.gotipe-block[data-type="heading"] { }
.gotipe-block[data-type="paragraph"] { }
.gotipe-block[data-level="1"] { }
.gotipe-block-content { }
.gotipe-block-children { }

/* Drag handle */
.gotipe-drag-handle { }
.gotipe-drag-handle:hover { }
.gotipe-drop-indicator { }

/* Menus */
.gotipe-slash-menu { }
.gotipe-slash-menu-item { }
.gotipe-slash-menu-item--active { }
.gotipe-bubble-menu { }
.gotipe-block-toolbar { }

/* Marks */
.gotipe-mark-bold { font-weight: 700; }
.gotipe-mark-italic { font-style: italic; }
.gotipe-mark-underline { text-decoration: underline; }
.gotipe-mark-strikethrough { text-decoration: line-through; }
.gotipe-mark-code { }
.gotipe-mark-link { }
.gotipe-mark-highlight { }

/* Collaboration */
.gotipe-cursor-remote { }
.gotipe-selection-remote { }
.gotipe-cursor-label { }
```

---

## Rich Block UI Components

### Image Block

Upload zone + resize handles + editable caption.

```
┌─────────────────────────────────────────────┐
│                                             │
│          ┌───── Drop image here ─────┐      │
│          │    or click to upload      │      │
│          │    ┌──┐                    │      │
│          │    │📷│                    │      │
│          │    └──┘                    │      │
│          │  ████████░░░░ 60%         │      │  ← progress bar
│          └────────────────────────────┘      │
│                                             │
│  ●────────────────────●────────────────────● │  ← 8-point resize handles
│  │                                         │ │
│  ●                 [Image]                 ● │
│  │                                         │ │
│  ●────────────────────●────────────────────● │
│                                             │
├─────────────────────────────────────────────┤
│ Caption text here (editable)                │
└─────────────────────────────────────────────┘
```

| Property | Value |
|----------|---------|
| Upload zone | Click + drag & drop. `--gt-bg-hover` background, dashed border `--gt-border`, border-radius 8px |
| Progress bar | Horizontal, `--gt-accent` color, height 4px, border-radius 2px |
| Resize handles | 8 points (4 corners + 4 side midpoints). 8×8px, `--gt-accent` background, border-radius 50% |
| Aspect ratio lock | Drag resize keeps the proportions (Shift for free resize) |
| Caption | `--gt-text-secondary`, 14px, text-align center, placeholder "Add a caption..." |
| Selected state | `2px solid --gt-accent` border around the image |
| Max files | Configurable, default: 3 files |
| Max file size | Configurable, default: 5MB |
| Loading | Skeleton placeholder `--gt-bg-hover` with a shimmer animation |
| Error | Broken image icon + `--gt-text-tertiary` "Failed to load image" |

### Table Block

Cell navigation + row/column controls + column resize.

```
        + (add column)
        ▼
┌──────────┬──────────┬──────────┐ ← drag border to resize columns
│ Header 1 │ Header 2 │ Header 3 │   header row: bold + --gt-bg-hover
├──────────┼──────────┼──────────┤
│ Cell 1   │ Cell 2   │ Cell 3   │ →  + (add row)
├──────────┼──────────┼──────────┤
│ Cell 4   │ Cell 5   │ Cell 6   │
└──────────┴──────────┴──────────┘
```

| Property | Value |
|----------|---------|
| Cell navigation | `Tab` → next cell, `Shift+Tab` → previous. In the last cell, Tab creates a new row |
| Row add button | `+` button to the right of the table, appears on row hover |
| Column add button | `+` button above the table, appears on column hover |
| Column resize | Drag handle on vertical borders. Cursor: `col-resize`. Minimum width 100px |
| Header row | First row: font-weight 600, `--gt-bg-hover` background |
| Selected cell | `--gt-bg-selected` background, `2px solid --gt-accent` border |
| Multi-cell selection | Shift+Click to select a range of cells |
| Border | `1px solid var(--gt-border)` |
| Cell padding | `8px 12px` |
| Context menu | Right-click → Insert/delete row/column, Merge cells, Split cell |

### Code Block

Syntax highlighting + language selector + copy button.

```
┌──────────────────────────────────────────┐
│ TypeScript                      📋 Copy  │  ← language dropdown + copy button
├──────────────────────────────────────────┤
│  1  const editor = createEditor({        │  ← optional line numbers
│  2    extensions: DefaultPreset,         │
│  3    content: '<p>Hello</p>',           │  ← syntax highlighting via Shiki
│  4  });                                  │
└──────────────────────────────────────────┘
```

| Property | Value |
|----------|---------|
| Syntax highlighting | Shiki (WASM) for browser, tree-sitter for Node.js. Theme synced with the editor theme (light/dark) |
| Language selector | Dropdown at top left, `--gt-text-tertiary`, 12px. Popular languages first (JS, TS, Python, Rust, Go, HTML, CSS) |
| Copy button | Top right, `--gt-text-tertiary`, hover: `--gt-text`. Click → icon changes to a ✓ checkmark for 2s |
| Line numbers | Optional (configurable). `--gt-text-tertiary`, fixed width 32px, right-aligned |
| Font | `--gt-font-mono`, 14px, line-height 1.6 |
| Background | `--gt-bg-code`, border-radius 8px, padding 16px |
| Horizontal overflow | Scroll, thin scrollbar (4px) |
| Tab behavior | Inserts 2 spaces (or a tab, configurable). `Shift+Tab` — dedent |

---

### Headless Mode (no default styles)

```typescript
import { createEditor } from '@gotipe/core';
import { Editor } from '@gotipe/react';

// Headless: data only, render it yourself
const editor = createEditor({ extensions: [...] });

function CustomEditor() {
  const { blocks, selection } = useEditorState(editor);

  return (
    <div>
      {blocks.map((block) => (
        <MyCustomBlockRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}
```

---

## Related documents

- [03-editor-core.md](03-editor-core.md) — document model, transforms, commands
- [05-extensions.md](05-extensions.md) — extension system, built-in extensions
- [06-framework-adapters.md](06-framework-adapters.md) — React components, hooks
- [07-ai.md](07-ai.md) — AI integration (ghost text shows in blocks)
