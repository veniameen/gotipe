# Tiptap Editor — Full Feature Analysis

> **Research date:** February 12, 2026  
> **Source:** https://tiptap.dev/  
> **Method:** clicking through every element, typing text, screenshots of every state

---

## 0) An important correction: Tiptap has no single "look"

Tiptap is a **headless editor**: the core provides the document schema, commands and plugins/extensions,
while "how it looks" (toolbars, menus, popovers, block menus) is UI that you build yourself or take from
**Tiptap UI Components / Templates**.

So the analysis has to cover **2 layers**:

1. **Editor capabilities** (what the engine and extensions can do)
2. **Reference UI/UX** (how it is packaged in the official templates)

The tiptap.dev home page presents **4 editor variants**, each demonstrating a different level of
customization:

| Variant | Purpose | UI level |
|:--------|:--------|:---------|
| **Agent editor** | AI-native editing, Cursor-like | Maximum (AI + comments + diffs) |
| **Notion-like editor** | Block editor with drag & drop | High (slash menu, drag handle, bubble menu) |
| **Simple editor** | Production-ready template | Medium (polished toolbar) |
| **Headless editor** | Demo of the "bare" API | Minimal (text buttons) |

---

## 1) Agent Editor — the AI-native editor

### Screenshot
![Agent editor — AI Toolkit](./agent_editor_recording.webp)

### 1.1 Interface layout

The Agent Editor consists of **4 main zones**:

| Zone | Description |
|:-----|:------------|
| **Top toolbar** | A comprehensive set of formatting tools |
| **AI Toolkit (dropdown)** | A menu with prefilled AI actions |
| **Editing area** | Rich-text canvas with the content |
| **AI Command Bar (bottom)** | A floating input for custom AI instructions |

### 1.2 AI Toolkit — each function in detail

#### "AI Toolkit examples" — the dropdown in the top left corner

Clicking it opens a list of AI actions:

---

##### ① Add AI Comment
- **What it does:** the AI analyzes the document and leaves **contextual comments**, just like a reviewer.
- **Visual:** an underline/highlight appears in the text (for example, "[Your University or Research Center]"),
  and a **comment bubble** appears in the right margin.
- **On clicking the bubble:** a **popover** opens with the comment text:
  - Example: *"Please specify the official name of your institution here"*
  - Buttons: **Reply**, **Resolve** (close the thread)
  - Navigation: arrows to switch between several comments (prev/next)
- **UX pattern:** full threads, like Google Docs / Word Online.
- **Use cases:** code review, peer review, collaborative editing.

---

##### ② Add New Paragraph
- **What it does:** the AI generates a **new paragraph** that is contextually relevant to the existing text.
- **Visual:** the new text appears as a **"green suggestion" (diff view)**:
  - Added text is highlighted in green
  - Removed text is gray with a strikethrough
- **Buttons:** **Accept** / **Reject**
- **UX pattern:** "Track Changes" / "Suggestions", as in Google Docs / Word. The user **decides** whether to
  accept or reject.

---

##### ③ Proofread
- **What it does:** the AI scans the **whole document** for errors (typos, grammar, style).
- **Visual:**
  - **Green highlights** are the proposed fixes (additions)
  - **Gray strikethroughs** are what is proposed for removal (deletions)
  - Example: "giaging" → "aging", "nueral" → "neural", "Metabolm" → "Metabolism"
- **Suggestion Toolbar (bottom):**
  - Counter: **"1/12"** shows the current position and the total number of edits found
  - Arrows ◀ ▶ navigate between suggestions
  - **Accept all** accepts all fixes
  - **Reject all** rejects them all

---

#### AI Command Bar (bottom panel)

- **Floating input:** "Tell AI what else needs to be changed..."
- **On click:** the input area expands for free-form text.
- **Example command:** "Summarize this page in one sentence."
- **Result:** the AI modifies the document intelligently:
  - It can replace a heading ("ABSTRACT" → "EXECUTIVE SUMMARY")
  - It can insert a summarized paragraph
  - The result is again shown as a **suggestion to approve**
- **Status indicator:** while the AI works, a *"Using AI toolkit"* animation appears in the footer

### 1.3 The standard Agent Editor toolbar

| Button | Function | Details |
|:-------|:---------|:--------|
| **B** | Bold | Cmd+B / Ctrl+B |
| **I** | Italic | Cmd+I / Ctrl+I |
| **S** | Strikethrough | — |
| **U** | Underline | — |
| **Highlight** | Marker highlight | Yellow background |
| **Headings** | Dropdown: H1, H2, H3, H4 | Heading levels |
| **Lists** | Bullet / Ordered / Checkbox | 3 list types |
| **Alignment** | Left / Center / Right / Justify | 4 alignment options |
| **Zoom** | Document zoom | For example 100% |
| **Custom Components** | Insert complex UI elements | Components directly in the text |

### 1.4 The core philosophy of the Agent Editor

> **"Human-in-the-loop"** — the AI acts as a **smart assistant** that proposes edits, leaves notes and
> follows instructions. The final decision **always rests with the human** through the Accept/Reject
> workflow.

### 1.5 Design and UI structure (Agent specific)

- **Layout:** three-column grid (left sidebar / center canvas / right sidebar for comments)
- **Canvas (editor area):**
  - No visible borders (border: none)
  - Background: transparent
  - Typography: `DM Sans`
  - Padding: asymmetric, with room for comments on the right
- **Floating Command Bar:**
  - Positioning: `fixed` at the bottom center
  - Rounding: `50px` (a full pill shape)
  - Shadow: a deep `box-shadow` (elevated)
  - Width: adaptive, ~600px
  - Animation: floats with `backdrop-filter: blur`
- **AI Sidebar:**
  - Fixed width on the left
  - Background: light gray / transparent
  - Divider: a thin border-right

---

## 2) Notion-like Editor — the block editor

### Screenshot
![Notion-like editor](./notion_editor.png)

### 2.1 Interface layout

- **Document canvas:** a single content column, clean white/dark background.
- **Top bar:**
  - **Undo/Redo** (arrows)
  - **Theme toggle** (☀️ / 🌓 — Light / Dark mode)
  - **Collaborator avatars** (real-time presence)
- **Gutter (left area):** hovering over a block shows **two buttons**:
  - **`+` (plus)** opens the dropdown for inserting a new block (slash menu)
  - **`⠿` (drag handle)** opens the block context menu / lets you drag the block
- **Floating placeholders:** an empty block shows "Write, type '/' for commands..."

### 2.2 The block insert dropdown (`+` button and `/` slash commands)

The same menu can be opened **in two ways**:

| Trigger | Where | Description |
|:--------|:------|:------------|
| **`+` button** | Left gutter (appears when hovering a block) | Click → the dropdown opens |
| **`/` character** | Type `/` on an empty line | The same menu appears |

The menu has **4 categories** with dividers:

#### 🤖 AI
| Command | Description |
|:--------|:------------|
| `Continue Writing` | The AI continues writing based on the existing text |
| `Ask AI` | A prompt interface for custom generation |

#### 🎨 Style (Block types)
| Command | Description |
|:--------|:------------|
| `Text` | Plain paragraph |
| `Heading 1` | First-level heading |
| `Heading 2` | Second-level heading |
| `Heading 3` | Third-level heading |
| `Bullet List` | Bulleted list |
| `Numbered List` | Numbered list |
| `To-do list` | Checklist with checkboxes (task list) |
| `Blockquote` | Block quote |
| `Code Block` | Code block with syntax highlighting |

#### 📎 Insert
| Command | Description |
|:--------|:------------|
| `Mention` | Insert a user mention (`@name`) |
| `Emoji` | Insert an emoji through a picker |
| `Table` | Insert a configurable table |
| `Separator` | Horizontal divider line (`<hr>`) |
| `Table of contents` | Auto-generated table of contents from headings |

#### 📤 Upload
| Command | Description |
|:--------|:------------|
| `Image` | Image upload (upload / drag & drop) |

### 2.3 Floating Selection Toolbar (Bubble Menu)

Appears **when text is selected**. It contains:

| Button | Function |
|:-------|:---------|
| **AI 'Improve'** | The AI improves the selected text |
| **Block Type** | Dropdown of the current block type (Heading 1, Text, etc.), lets you switch it |
| **Bold** | Bold |
| **Italic** | Italic |
| **Underline** | Underline |
| **Strikethrough** | Strikethrough |
| **Code** | Inline code |
| **Link** | Add/edit a hyperlink |
| **Text Color** | Text color picker (an "A" icon with a colored bar) |
| **More Options** | Vertical ellipsis (⋮) for additional actions |

### 2.4 Drag Handle & Block Context Menu

**Hovering a block** shows a **six-dot handle** (`⠿`) on its left.

**Clicking the handle** opens the **block context menu:**

| Item | Description |
|:-----|:------------|
| **Duplicate** | Clone the whole block |
| **Delete** | Delete the block |
| **Reset Formatting** | Reset all text styles inside the block |
| **Copy to Clipboard** | Copy the block content |
| **Drag & Drop** | The handle also lets you **drag** blocks up and down |

### 2.5 Inline triggers (shortcuts right in the text)

Besides the `+`/`/` menu, there are **inline shortcuts** that work while typing:

| Trigger | Function | UX |
|:--------|:---------|:---|
| **`@`** | Mentions | A dropdown with teammate names appears (Cyndi Lauper, Joan Jett…) |
| **`:`** | Emoji picker | Emoji search (`:smile` → 😀) |

> **Note:** Mention and Emoji are also available through the `+`/`/` dropdown (the **Insert** category),
> but the inline `@` and `:` triggers are the quick shortcut.

### 2.6 Themes and collaboration

- **Dark Mode:** full support, all menus and handles adapt
- **Collaboration:** vertical markers on the right plus avatars in the top bar = real-time editing
- **Interactive Placeholders:** images and videos show an "upload" / "embed" prompt until the content is
  loaded

### 2.7 Design and UI structure (Notion-like specific)

- **Container:**
  - Maximum text width: ~708px (the standard for readability)
  - Alignment: centered on the screen (`margin: 0 auto`)
- **Visual style:**
  - **Full minimalism:** no visible editor borders (no border)
  - **Padding:** large (`padding-top: 48px `), creating "air"
- **Drag Handle (`⠿`):**
  - Appears in a `fixed` or `absolute` position to the left of the block (-24px offset)
  - Click target size: `24px` × the line height
  - Icon color: `rgba(0,0,0, 0.4)`, darker on hover
- **Slash menu:**
  - `border-radius: 20px`
  - `width: 320px`
  - `box-shadow`: soft elevation (`0 10px 40px rgba(...)`)
  - Menu items: `padding: 4px 8px`, `border-radius: 6px` on hover

---

## 3) Simple Editor — the production-ready template

### Screenshot
![Simple editor](./simple_editor.png)

### 3.1 Interface layout

- **Canvas:** a spacious white area with preloaded content ("Getting started")
- **Toolbar:** clean, centered, with styled icons and hover states
- **Theme toggle:** ☀️/🌓 (Light/Dark) on the right of the toolbar

### 3.2 Toolbar — every button

Left to right:

| # | Icon | Function | Details |
|:--|:-----|:---------|:--------|
| 1 | ↶ | **Undo** | Undo an action |
| 2 | ↷ | **Redo** | Redo an action |
| 3 | H▾ | **Heading dropdown** | 4 levels: H1, H2, H3, H4 |
| 4 | ☰▾ | **List dropdown** | Bullet list, Ordered list |
| 5 | ❝ | **Blockquote** | Wrap text in a quote |
| 6 | **B** | **Bold** | Bold type |
| 7 | *I* | **Italic** | Italic |
| 8 | ~~S~~ | **Strike** | Strikethrough |
| 9 | `</>` | **Code** | Inline code |
| 10 | U | **Underline** | Underline |
| 11 | 🖍 | **Highlight** | Marker highlight |
| 12 | 🔗 | **Link** | Insert/edit a link (a URL prompt appears) |
| 13 | x² | **Superscript** | Superscript |
| 14 | x₂ | **Subscript** | Subscript |
| 15 | ≡← | **Align left** | Align to the left edge |
| 16 | ≡ | **Align center** | Center |
| 17 | ≡→ | **Align right** | Align to the right edge |
| 18 | ≡↔ | **Align justify** | Justify |
| 19 | 🖼 **+ Add** | **Image upload** | Opens an upload zone (drag & drop / click), limit 3 files × 5MB |
| 20 | ☀️ | **Theme toggle** | Switch Light / Dark mode |

### 3.3 Heading Dropdown
![Heading dropdown](./simple_heading_dropdown.png)

Clicking H▾ opens the levels:
- **Heading 1** — the largest
- **Heading 2**
- **Heading 3**
- **Heading 4** — the smallest

### 3.4 List Dropdown
![List dropdown](./simple_list_dropdown.png)

- **Bullet list** — bulleted
- **Ordered list** — numbered

### 3.5 Image Upload
![Image upload zone](./simple_image_upload.png)

Clicking "+ Add" in the toolbar:
- An **upload zone** appears inside the editor
- "Click to upload or drag and drop"
- **Limit:** 3 files, each up to 5 MB

### 3.6 Default content

The preloaded content demonstrates:
- **H1 heading:** "Getting started"
- **Paragraphs** with **bold** and *italic* text
- **A link:** "Tiptap UI Components docs"
- **Code block:** `npx @tiptap/cli init`
- **H2 heading:** "Features"
- **Blockquote** with Markdown shortcuts and keyboard combinations (`**`, `⌘+B`)

### 3.7 Key features

- ✅ **Markdown shortcut** support (type `**` for bold, `*` for italic, and so on)
- ✅ **Typographic replacements** (`->` → `→`)
- ✅ **MIT license** with open source UI components
- ✅ Ready to embed via `npx @tiptap/cli init`

### 3.8 Design and UI structure (Simple specific)

Unlike the Notion-like editor, this one is styled as a **single card**:

- **Container (Wrapper):**
  - **Border:** `1px solid rgba(0,0,0, 0.1)` (a thin frame)
  - **Border-radius:** `16px` (rounding of the whole editor)
  - **Box-shadow:** a light shadow or none (flat style)
- **Toolbar:**
  - Pinned to the top (`border-bottom: 1px solid ...`)
  - Sticky positioning (in some implementations)
- **Buttons:**
  - Rounding: `8px` or `12px` (a soft square)
  - Active state: background `rgba(0,0,0, 0.05)` or the brand color
- **Content area:**
  - Inner padding: `padding: 24px`
  - Width limit: often the full container width

---

## 4) Headless Editor — the "bare" API without styles

### Screenshot
![Headless editor](./headless_editor.png)

### 4.1 Interface layout

- **Toolbar:** a dense row of **text buttons** without icons (words only)
- **Canvas:** a basic white background with text, lists and a code block (dark background)
- **Active state:** highlighted in **purple** (for example, H2 when hovering a level 2 heading)

### 4.2 All buttons — the full list

**First row:**

| Button | Function | Description |
|:-------|:---------|:------------|
| **Bold** | toggleBold | Bold |
| **Italic** | toggleItalic | Italic |
| **Strike** | toggleStrike | Strikethrough |
| **Code** | toggleCode | Inline code |
| **Clear marks** | unsetAllMarks | Removes **all** inline styles (bold, italic, code…) from the selection |
| **Clear nodes** | clearNodes | Resets the block to a standard paragraph (heading → paragraph, list → paragraph) |
| **Paragraph** | setParagraph | Sets the block as plain text |
| **H1** | toggleHeading level:1 | Heading 1 |
| **H2** | toggleHeading level:2 | Heading 2 |
| **H3** | toggleHeading level:3 | Heading 3 |
| **H4** | toggleHeading level:4 | Heading 4 |
| **H5** | toggleHeading level:5 | Heading 5 |
| **H6** | toggleHeading level:6 | Heading 6 |
| **Bullet list** | toggleBulletList | Bulleted list |
| **Ordered list** | toggleOrderedList | Numbered list |
| **Code block** | toggleCodeBlock | Code block (multi-line, dark background) |

**Second row:**

| Button | Function | Description |
|:-------|:---------|:------------|
| **Blockquote** | toggleBlockquote | Block quote |
| **Horizontal rule** | setHorizontalRule | Horizontal line `<hr>` |
| **Hard break** | setHardBreak | Forced line break `<br>` |
| **Undo** | undo | Undo (may be disabled) |
| **Redo** | redo | Redo (may be disabled) |

### 4.3 Testing the functions

#### Clear marks — removing inline styles
![Clear marks test](./headless_cleared_marks.png)
- Select text with bold/italic → press "Clear marks" → all styles are reset, leaving plain text.
- A Horizontal rule was also added during the test — a divider line appears.

#### Clear nodes — resetting the block type
![Clear nodes + Code block](./headless_codeblock.png)
- H1 heading → "Clear nodes" → becomes a regular paragraph
- Then "Code block" → the paragraph is transformed into a code block

#### H1 — changing the heading level
![H1 applied](./headless_h1_applied.png)
- H2 ("Hi there,") → click "H1" → the text gets larger, the semantics change

### 4.4 Default content

```
Hi there,  (H2)

this is a basic example of Tiptap. Sure, there are all kind of basic
text styles you'd probably expect from a text editor.

- That's a bullet list with one ...
- ... or two list items.

Isn't that great? And all of that is editable. But wait, there's more.
Let's try a code block:

body {
  display: none;
}

I know, I know, this is impressive. It's only the tip of the iceberg though.

> Wow, that's amazing. Good work, boy! 👏
> — Mom
```

### 4.5 Key differences of Headless from the others

| Characteristic | Headless | Simple | Notion-like | Agent |
|:---------------|:---------|:-------|:------------|:------|
| UI style | Text buttons | Icons | Context menus | AI panels |
| Headings | **H1–H6** (individually) | H1–H4 (dropdown) | H1–H3 (slash + bubble) | H1–H4 (dropdown) |
| Media | ❌ No | ✅ Upload zone | ✅ Slash command | ❌ No (AI focus) |
| Themes | ❌ Light only | ✅ Light/Dark | ✅ Light/Dark | ✅ Light/Dark |
| AI | ❌ No | ✅ Continue/Ask AI | ✅ Improve in bubble | ✅ Full AI Toolkit |
| Utilities | Clear marks, Clear nodes, Hard break | — | — | — |
| **Purpose** | Demo for developers | Ready-made product | Notion clone | AI agent |

---

## 5) Design system and CSS tokens (Design Tokens)

> All values were obtained programmatically via `getComputedStyle()` and by parsing CSS variables on
> `tiptap.dev` and `template.tiptap.dev`.

### 5.1 CSS Custom Properties (`--tiptap-*` and `--tt-*`)

#### Brand color

```css
--tt-brand-color-500: rgba(98, 41, 255, 1)   /* #6229FF — violet, the main accent */
```

Used for: the active state of buttons, focus borders of inputs, image handles, the upload zone.

#### Border-radius (the rounding system)

```css
--tt-radius-sm:  0.375rem   /*  6px */
--tt-radius-md:  0.5rem     /*  8px */
--tt-radius-lg:  0.75rem    /* 12px */
--tt-radius-xl:  1rem       /* 16px */
```

| Element | border-radius | Token |
|:--------|:-------------|:------|
| **Toolbar buttons** | `12px` | `--tt-radius-lg` |
| **Cards/dropdowns** (slash menu, popovers) | `20px` | Custom (larger than `--tt-radius-xl`) |
| **Headless buttons** | `8px` | `--tt-radius-md` |
| **Checkboxes, small elements** | `6px` | `--tt-radius-sm` |

#### Shadows (box-shadow)

```css
--tt-shadow-elevated-md:
  0px 16px 48px 0px rgba(17, 24, 39, 0.04),
  0px 12px 24px 0px rgba(17, 24, 39, 0.04),
  0px  6px  8px 0px rgba(17, 24, 39, 0.02),
  0px  2px  3px 0px rgba(17, 24, 39, 0.02);
```

- **4-layer soft shadow** creates a "floating" effect without sharp outlines
- Used for: the slash menu, the bubble menu, all popovers and dropdowns
- The gray tint `rgba(17,24,39)` is almost black but very transparent (2–4%)

#### Toolbar

```css
--tt-toolbar-bg-color: rgba(255, 255, 255, 1)   /* White background */
--tt-toolbar-height: 2.75rem                      /* 44px */
```

#### AI components

```css
--tiptap-ai-loading-background-color:    rgba(37, 39, 45, 0.1)
--tiptap-ai-prompt-border-color:         rgba(37, 39, 45, 0.1)
--tiptap-ai-prompt-focused-border-color: rgba(98, 41, 255, 1)   /* Brand violet */
--tiptap-ai-prompt-input-bg-color:       rgba(255, 255, 255, 1)
--tiptap-ai-prompt-input-border-color:   rgba(37, 39, 45, 0.1)
--tiptap-ai-prompt-input-focused-border-color: rgba(98, 41, 255, 1)
--tiptap-ai-prompt-input-content-placeholder:  rgba(40, 44, 51, 0.42)
```

#### Avatars and collaboration

```css
--tiptap-avatar-border-color:      rgba(255, 255, 255, 1)
--tiptap-avatar-fallback-bg-color: rgba(234, 234, 235, 1)
--tiptap-avatar-fallback-text-color: rgba(36, 39, 46, 0.78)
```

#### Cards (slash menu, popovers)

```css
--tiptap-card-bg-color:     rgba(255, 255, 255, 1)
--tiptap-card-border-color: rgba(15, 22, 36, 0.05)   /* An almost invisible border */
```

#### Image upload

```css
--tiptap-image-handle-bg:    rgba(84, 0, 229, 1)   /* Dark violet */
--tiptap-image-upload-active: rgba(98, 41, 255, 1)
--tiptap-image-upload-border: rgba(47, 50, 55, 0.2)
```

### 5.2 Typography

| Context | Font | Size | Line-height | Weight |
|:--------|:-----|:-----|:------------|:-------|
| **Editor content** (Simple, Notion-like) | `"DM Sans", sans-serif` | `16px` | `24px` (1.5) | `400` (normal) |
| **Headless editor** | `Inter, ui-sans-serif, system-ui, …` | `16px` | `24px` | `400` |
| **UI buttons** | `Inter, ui-sans-serif, system-ui, …` | `14px` | `20px` | `500` (medium) |
| **H1 heading** | `"DM Sans"` | `30px` | `36px` | `700` (bold) |
| **Menu label text** | `Inter` | `14px` | `20px` | `400` |
| **Category labels** (AI, Style, Insert) | `Inter` | `12px` | `16px` | `600` (semibold) |

> **DM Sans** is a Google Font, a geometric sans-serif. Used for **content** (what the user writes).  
> **Inter** is a Google Font, a neo-grotesque sans-serif. Used for the **UI** (buttons, menus, labels).

### 5.3 Color palette

#### Main interface colors

| Purpose | Light Mode | Dark Mode (approx.) |
|:--------|:-----------|:--------------------|
| **Page background** | `#FFFFFF` (`rgb(255,255,255)`) | `#1A1A1E` |
| **Primary text** | `#222325` (`rgb(34,35,37)`) | `#E8E8E8` |
| **Muted text** | `rgba(40,44,51, 0.42)` | `rgba(200,200,210, 0.5)` |
| **Accent (brand)** | `#6229FF` (`rgba(98,41,255,1)`) | `#6229FF` |
| **Card background** | `#FFFFFF` | `#2A2A2E` |
| **Card border** | `rgba(15,22,36, 0.05)` | `rgba(255,255,255, 0.08)` |
| **Button hover** | `rgba(61,37,20, 0.08)` | `rgba(255,255,255, 0.1)` |
| **Icons** | `rgba(40,44,51, 0.42)` | `rgba(200,200,210, 0.6)` |

#### Highlight Colors palette

| Color | Background | Text Color |
|:------|:-----------|:-----------|
| 🔵 **Blue** | `#E0F2FE` | `hsl(202, 54%, 43%)` |
| 🟢 **Green** | `#DCFCE7` | `hsl(148, 32%, 39%)` |
| 🟡 **Yellow** | `#FEF9C3` | `hsl(38, 62%, 49%)` |
| 🔴 **Red** | `#FFE4E6` | `hsl(2, 62%, 55%)` |
| 🟣 **Purple** | `#F3E8FF` | `hsl(274, 32%, 54%)` |

### 5.4 Computed Styles — by component

#### Editor (`.tiptap` / `.ProseMirror`)

| Property | Notion-like | Simple | Headless |
|:---------|:------------|:-------|:---------|
| `font-family` | `"DM Sans", sans-serif` | `"DM Sans", sans-serif` | `Inter, ui-sans-serif, system-ui` |
| `font-size` | `16px` | `16px` | `16px` |
| `line-height` | `24px` | `24px` | `24px` |
| `color` | `rgb(34, 35, 37)` | `rgb(34, 35, 37)` | `rgb(0, 0, 0)` |
| `background-color` | `transparent` | `transparent` | `transparent` |
| `padding` | `48px` | `16px 0px 0px` | `0px 0px 32px` |
| `border-radius` | `0px` | `0px` | `0px` |

#### Toolbar buttons (`.tiptap-button`)

| Property | Notion-like / Simple | Headless |
|:---------|:---------------------|:---------|
| `border-radius` | **`12px`** | **`8px`** |
| `padding` | `4px 8px` | `4px 8px` |
| `height` | `32px` | `auto` |
| `width` | `32px` (square) | `auto` |
| `font-size` | `14px` | `12px` |
| `color` | `rgba(40,44,51, 0.42)` | `rgb(46, 43, 41)` |
| `background` | `transparent` → hover: `rgba(61,37,20, 0.08)` | `rgba(61,37,20, 0.08)` |
| `border` | `none` | `1px solid transparent` |

#### Card / Dropdown (`.tiptap-card`)

| Property | Value |
|:---------|:------|
| `border-radius` | **`20px`** |
| `background-color` | `rgb(255, 255, 255)` |
| `border` | `1px solid rgba(15, 22, 36, 0.05)` |
| `box-shadow` | `--tt-shadow-elevated-md` (4-layer soft shadow) |
| `padding` | `0px` (padding is inside `.tiptap-card-body`) |

#### Category label (`.tiptap-card-group-label`)

| Property | Value |
|:---------|:------|
| `font-size` | `12px` |
| `line-height` | `16px` |
| `font-weight` | `600` (semibold) |
| `color` | `rgba(30, 32, 36, 0.95)` |
| `padding` | `8px 12px` |

#### Separator (`.tiptap-separator`)

| Property | Value |
|:---------|:------|
| `height` | `1px` |
| `background-color` | `rgba(15, 22, 36, 0.05)` |
| `margin` | `4px 0px` |

#### Button icons (`.tiptap-button-icon`)

| Property | Value |
|:---------|:------|
| `width × height` | `16px × 16px` |
| `color` | `currentColor` (inherited from `.tiptap-button`) |

### 5.5 Key design principles

| Principle | Implementation |
|:----------|:---------------|
| **Minimal borders** | Borders are almost invisible (`0.05` opacity), visual separation comes from shadows |
| **Depth through shadows** | A 4-layer `box-shadow` instead of hard frames → a "floating" effect |
| **Roundness** | Aggressive radii: buttons `12px`, cards `20px` |
| **Neutral palette** | A black-and-white base, the only accent is violet `#6229FF` |
| **Transparent hovers** | Buttons have no background, a light `8%` opacity fill on hover |
| **Two fonts** | `DM Sans` for content, `Inter` for UI — a clear separation |
| **Micro-animations** | CSS transitions on `background-color`, `color`, `box-shadow` (150–200ms) |

---

## 6) Collaboration (real-time collaborative editing)

Tiptap Collaboration is marketed as:

- **Live carets/cursors** — you can see who is typing where
- **Offline editing** and syncing of changes
- **"Real-time collaboration anywhere"** — available as Platform and On-premises

### UX implementation

| Element | Description |
|:--------|:------------|
| **Cursors** | Colored carets of other users in the document |
| **Presence** | Avatars in the top bar (who is in the document right now) |
| **Merge** | Automatic merging at the level of transactions/operations (no conflicts) |
| **Offline sync** | Working offline with syncing afterwards |

In the Notion-like template, collaboration is already **built in and visible**: avatars in the header plus
vertical markers on the right.

---

## 7) Comments (threads, inline discussions, suggestions)

Tiptap Comments (Beta):

- **Threaded conversations** — full threads with replies
- **Inline suggestions** — suggestions right in the text
- **Comments REST API** — moderating/managing threads on the backend

### UX pattern (checked in the Agent editor)

| Step | Description |
|:-----|:------------|
| 1 | Select a fragment → **"Add comment"** |
| 2 | A marker/highlight appears in the text |
| 3 | A **comment bubble** appears on the right |
| 4 | On click, a **thread** opens (reply / resolve) |
| 5 | Navigation between comments (prev/next) |
| 6 | Anchoring to text ranges |

---

## 8) Track Changes, Versions, Diff

### 8.1 Track Changes / Redlining

The official roadmap announces **"Redlining (Tracked Changes)"**, the classic mode of inserting/deleting
"as suggestions" (as in Word/Docs).

### 8.2 AI Toolkit → Suggestions as Diffs

**Already works** in the Agent editor (checked):

- AI-powered suggestions as **actionable diffs**
- **Accept / Reject** changes instantly
- Streaming of results into the editor
- Green highlights (additions) + gray strikethroughs (deletions)
- Suggestion toolbar: counter, navigation, Accept all / Reject all

### 8.3 Version History / Snapshots

In the paid features:

- Document **snapshots** (snapshots/versions)
- A version list with metadata (who/when)
- **Compare/diff** between versions

---

## 9) AI Features — 2 levels

### 9.1 Content AI (one-shot commands)

| Function | Description | Where available |
|:---------|:------------|:----------------|
| **Fix grammar** | Grammar correction | Agent, Notion-like |
| **Change tone** | Change the tone of the text | Agent |
| **Translate** | Translation | Agent |
| **Summarize** | Summarization | Agent |
| **Continue Writing** | The AI continues the text | Notion-like |
| **Ask AI** | Free-form prompt | Notion-like |
| **Improve** | Improve the selection | Notion-like (bubble menu) |
| **Copilot-style autocomplete** | Autocomplete with streaming | Agent |

### 9.2 AI Toolkit (agentic editing, Cursor-like)

Infrastructure for AI that:
- **Understands the schema** of the document
- Makes **targeted edits** (does not replace everything)
- Produces **diff suggestions** (green/gray)
- Lets you **accept/reject** each edit
- Supports **streaming** generation

### 9.3 AI UI packaging

| Component | Description |
|:----------|:------------|
| **AI Menu** | A contextual floating AI menu |
| **AI Ask Button** | A button to invoke the AI on a selection |
| **AI Command Bar** | Free-form text input for AI commands |
| **AI Status** | The "Using AI toolkit" indicator in the footer |

---

## 10) Custom Extensions

Tiptap's key strength is the ability to "finish Notion" for your own product:

- **Custom node types:** Callout, Steps, Card, Embed, Smart-Block, Jira-Issue, Confluence-Excerpt…
- **Custom marks:** a "semantic highlight" with types
- **Custom commands/hotkeys/input rules**
- **Custom NodeViews:** complex React renders of nodes
- **Command-chain approach:** command chains as a normal pattern

---

## 11) i18n & RTL

### RTL / BiDi
- Built-in support: `textDirection: 'ltr' | 'rtl' | 'auto'`
- Commands: `setTextDirection(...)` / `unsetTextDirection()`
- A separate example, "Text direction & RTL support"

### i18n
- Tiptap headless → translating the interface = translating your own UI labels
- UI components accept text props (for example, `text="Insert Block"`)
- i18n is done at the level of **your UI layer**, not "inside the engine"

---

## 12) Comparison table of all 4 editors

| Feature | Agent | Notion-like | Simple | Headless |
|:--------|:-----:|:-----------:|:------:|:--------:|
| **Bold/Italic/Strike** | ✅ | ✅ | ✅ | ✅ |
| **Underline** | ✅ | ✅ | ✅ | ❌ |
| **Highlight** | ✅ | ✅ (color) | ✅ | ❌ |
| **Inline Code** | ❓ | ✅ | ✅ | ✅ |
| **Link** | ❓ | ✅ | ✅ | ❌ |
| **Superscript/Subscript** | ❌ | ❌ | ✅ | ❌ |
| **Headings H1–H4** | ✅ | ✅ | ✅ | ✅ |
| **Headings H5–H6** | ❌ | ❌ | ❌ | ✅ |
| **Bullet List** | ✅ | ✅ | ✅ | ✅ |
| **Ordered List** | ✅ | ✅ | ✅ | ✅ |
| **Task List (To-do)** | ✅ | ✅ (slash/+) | ❌ | ❌ |
| **Blockquote** | ❓ | ✅ | ✅ | ✅ |
| **Code Block** | ❓ | ✅ | ✅ (in the demo) | ✅ |
| **Table** | ❓ | ✅ | ❌ | ❌ |
| **Image** | ❌ | ✅ | ✅ (upload) | ❌ |
| **Video** | ❌ | ✅ | ❌ | ❌ |
| **Horizontal Rule** | ❓ | ✅ | ❌ | ✅ |
| **Callout** | ❌ | ✅ | ❌ | ❌ |
| **Table of Contents** | ❌ | ✅ | ❌ | ❌ |
| **Alignment** | ✅ | ❌ | ✅ | ❌ |
| **Undo/Redo** | ✅ | ✅ | ✅ | ✅ |
| **Slash Commands** | ❌ | ✅ | ❌ | ❌ |
| **Drag & Drop Blocks** | ❌ | ✅ | ❌ | ❌ |
| **Mentions @** | ❌ | ✅ | ❌ | ❌ |
| **Emoji :picker:** | ❌ | ✅ | ❌ | ❌ |
| **Dark Mode** | ✅ | ✅ | ✅ | ❌ |
| **Collaboration** | ❓ | ✅ | ❌ | ❌ |
| **AI Comments** | ✅ | ❌ | ❌ | ❌ |
| **AI Proofread** | ✅ | ❌ | ❌ | ❌ |
| **AI Suggestions (diff)** | ✅ | ❌ | ❌ | ❌ |
| **AI Command Bar** | ✅ | ❌ | ❌ | ❌ |
| **AI Improve** | ❌ | ✅ (bubble) | ❌ | ❌ |
| **AI Continue/Ask** | ❌ | ✅ (slash) | ❌ | ❌ |
| **Clear marks/nodes** | ❌ | ❌ | ❌ | ✅ |
| **Hard break** | ❌ | ❌ | ❌ | ✅ |
| **Image Upload Zone** | ❌ | ❌ | ✅ | ❌ |

> ❓ = The feature is theoretically available through extensions but was not explicitly seen in the demo.

---

## 13) Advanced Capabilities (based on the Tiptap Examples)

Analysis of the `tiptap.dev/examples` page reveals additional capabilities beyond standard editors:

### 13.1 Performance & Long Texts
- Tiptap is optimized for working with **huge documents** (thousands of nodes).
- It uses virtualization and ProseMirror's smart rendering so that scrolling and typing in long reads do
  not lag.

### 13.2 Interactive NodeViews (React/Vue inside the text)
- You can embed **full React/Vue components** right into the editor body.
- Examples:
  - **Drawing:** a drawing tool (canvas) as part of the document.
  - **Interactive Kanban/Tasks:** boards with drag & drop inside the text.
  - **Charts/Graphs:** live charts that can be edited.
- These are not just "static pictures" but **interactive applications** inside the text that keep their
  state in the document JSON.

### 13.3 Content Structure & Validations
- **Forced Layout:** you can set a rigid document structure at the schema level.
  - *Example:* "The document must start with a Heading 1 followed by a Paragraph. Heading 1 cannot be
    deleted".
- **Linting (Experiment):** an extension for checking errors (typos, style, rules) in real time with visual
  highlighting.

### 13.4 Experimental capabilities
- **Collaborative Fields:** one Y.js connection can sync not only the editor text but also the **neighboring
  fields** (for example, the document's "Title", "Status", "Tags"), all in real time.
- **iFrames:** safe embedding of external content with a UI for setting sizes and URLs.
- **Generic Figure:** wrappers for media content with captions.

---

## 14) General Concept and philosophy

Based on the analysis of all the editors and examples, **Tiptap is not just an "editor"**, it is a
**construction kit**:

1.  **Everything is an Extension:**
    - There is no "core with buttons". Even `Paragraph`, `Text` and `Bold` are extensions.
    - You plug in only what you need. Want only Plain Text? Disable everything except `Text`. Want a
      super-powerful Notion? Plug in 50 extensions.

2.  **Headless & Framework Agnostic:**
    - Tiptap **provides no UI**. Buttons, menus, sidebars: you build them yourself in React/Vue/Svelte.
    - This gives **full control over the design** (see the difference between the Agent and Simple editors:
      one engine, a completely different look).

3.  **ProseMirror under the hood:**
    - Tiptap is a convenient wrapper over **ProseMirror** (a very powerful but complex framework).
    - It simplifies the API but keeps the power: transactions, steps, the document schema.

4.  **JSON Output:**
    - The document is stored not as HTML but as a **JSON tree** (a ProseMirror Node Tree). This makes it
      easy to parse, analyze and transform content on the backend.

---

## 15) Checklist: "how to click through everything yourself"

### Agent Editor
1. Open the Agent editor on tiptap.dev
2. Click "AI Toolkit examples" → "Add AI comment" → wait → click the comment bubble → screenshot the popover
   with reply/resolve
3. "Add new paragraph" → wait → screenshot the green diff suggestions → Accept/Reject
4. "Proofread" → wait → screenshot all the edits with the "1/12" count → Accept all / Reject all
5. AI Command Bar → type text → screenshot the result → Accept/Reject
6. Toolbar: Bold, Italic, Strike, Underline, Highlight → apply to text
7. Heading dropdown → H1-H4
8. Lists → Bullet/Ordered/Task
9. Alignment → left/center/right/justify

### Notion-like Editor
1. Open the Notion-like tab
2. `/` → screenshot the slash menu (AI / Style / Insert categories)
3. Hover to the left of a block → click the drag handle → screenshot the context menu
   (Duplicate/Delete/Reset/Copy)
4. Select text → screenshot the floating toolbar (Improve/Bold/Italic/Link/Color)
5. `@` → screenshot the mentions dropdown
6. `:` → screenshot the emoji picker
7. ☀️/🌓 → screenshot dark mode
8. Insert a table/image/video through the slash menu

### Simple Editor
1. Open the Simple tab
2. H▾ → screenshot the heading dropdown (H1-H4)
3. ☰▾ → screenshot the list dropdown (Bullet/Ordered)
4. Each toolbar button → Bold/Italic/Strike/Code/Underline/Highlight/Link/Super/Sub
5. Alignment → left/center/right/justify
6. "+ Add" → screenshot the image upload zone
7. ☀️ → screenshot dark mode

### Headless Editor
1. Open the Headless tab
2. Press each button: Bold, Italic, Strike, Code
3. "Clear marks" → make sure the styles are reset
4. "Clear nodes" → heading → paragraph
5. H1-H6 → check all levels
6. Bullet list / Ordered list
7. Code block → dark background
8. Blockquote → side bar
9. Horizontal rule → divider line
10. Hard break → `<br>` inside a paragraph
11. Undo / Redo

---

## 16) Interaction recordings (Recordings)

All interactions were recorded:

| Recording | Contents |
|:----------|:---------|
| `main_page_recording.webp` | Navigating the tiptap.dev home page |
| `agent_editor_recording.webp` | Clicking through the Agent editor: AI toolkit, toolbar, formatting |
| `notion_editor_recording.webp` | Clicking through the Notion-like editor: slash, drag, bubble, mentions, emoji |
| `simple_headless_recording.webp` | Clicking through the Simple + Headless editors: toolbar, buttons, dropdowns |
| examples_analysis.webp | Analysis of the Examples page: scrolling through experiments and advanced demos |
