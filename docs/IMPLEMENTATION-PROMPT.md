# GoTipe Block Editor — Implementation Prompt

> **Goal:** Bring GoTipe's Block Editor from prototype to production-quality Notion-like editor, matching Tiptap's 4-editor polish level while maintaining GoTipe's own design identity (own accent color, proportions — NOT a 1:1 Tiptap copy).

---

## 1. Context & Current State

**GoTipe** is a Rust/WASM rich-text editor framework with Notion-like UX. The core engine (Rust crates: document model, transforms, CRDT, export) is mostly complete. The TypeScript layer (`packages/core/`, `packages/react/`) provides editor API and React adapter. The commercial `packages/block-editor/` provides the Notion-like UI.

**What works today:**
- Basic text editing with paragraph, heading, lists
- Slash menu (flat list, no categories, basic search)
- Bubble menu (B/I/U/S/Code/Link only)
- Block toolbar (drag handle stub + add button)
- Ghost text AI (Level 1 — inline autocomplete)
- CRDT collaboration (core engine)
- Export: HTML, Markdown

**What's broken or missing (vs. Tiptap reference):**
- Drag handle is a visual stub — no actual drag & drop
- Image resize handles don't work
- Code block has no syntax highlighting
- Slash menu has no categories, no proper fuzzy search
- Bubble menu lacks AI Improve, Block Type dropdown, Text Color picker
- Block toolbar lacks context menu (Duplicate/Delete/Reset/Copy)
- No AI Command Bar (Level 3 agent toolkit)
- No AI Proofread with suggestion toolbar
- No comment sidebar with threading UX
- Design system not applied (borders too heavy, shadows flat, border-radius too small)

**Reference:** Full Tiptap analysis in `tiptap_editor_full_analysis.md` at project root.

---

## 2. Architecture Rules (MUST follow)

Before implementing anything, these rules from `CLAUDE.md` are non-negotiable:

- **Block-first model:** Document → Block[] (NOT ProseMirror node tree)
- **WASM owns state:** All state changes via `dispatch(Transaction)` through WASM — NEVER mutate state from JS
- **Extension = everything:** Every block type, mark, behavior = extension. Use `defineExtension()`.
- **CSS tokens:** Variables `--gt-*` (NOT `--gotipe-*`). Classes `.gotipe-*`. Semantic tokens, no hardcoded colors.
- **No dangerouslySetInnerHTML without DOMPurify**
- **Lazy WASM:** Core ~255KB eager. PDF/DOCX lazy `import()`.
- **HTML5 Drag API** (NOT @dnd-kit — remove the dependency)

---

## 3. Priority P0 — Critical Fixes

These are stub implementations that need to become real. Fix these FIRST.

### 3.1 Drag Handle → Real HTML5 Drag & Drop

**Current:** `packages/block-editor/src/components/drag-handle.tsx` — visual stub, imports from `@dnd-kit`
**Target:** Working HTML5 Drag API with:
- `draggable` attribute on handle button
- `DataTransfer` with `text/gotipe-block-id`
- Drop indicator line (2px `--gt-accent`) between blocks
- Indent zone detection for nesting (>75% width = nest)
- Elevated shadow + `scale(1.02)` on dragged block
- Animation: 200ms ease transition to new position
- Touch: long-press (300ms) activation

**Files to modify:**
- `packages/block-editor/src/components/drag-handle.tsx` — rewrite with HTML5 API
- `packages/block-editor/src/components/block-editor.tsx` — add `onDragOver`/`onDrop` handlers
- `packages/core/src/editor.ts` — add `moveBlock(blockId, targetIndex)` command if missing
- `package.json` (root or block-editor) — remove `@dnd-kit` dependency

### 3.2 Image Resize → Working 8-Point Handles

**Current:** `packages/block-editor/src/views/image-view.tsx` — no resize handles
**Target:**
- Upload zone: click + drag & drop, progress bar (4px height, `--gt-accent`)
- 8-point resize handles (4 corners + 4 midpoints): 8×8px circles, `--gt-accent` fill
- Aspect ratio lock by default (Shift for free resize)
- Editable `<figcaption>` with placeholder "Add a caption..."
- Configurable limits: max 3 files × 5MB default

**Files to modify:**
- `packages/block-editor/src/views/image-view.tsx` — add resize handles + upload zone
- `packages/core/src/extensions/image.ts` — ensure `width`, `height`, `caption` attrs exist

### 3.3 Code Block → Syntax Highlighting

**Current:** `packages/block-editor/src/views/code-block-view.tsx` — plain text, no highlighting
**Target:**
- Syntax highlighting via **Shiki** (WASM, browser-compatible)
- Language selector dropdown (top-left): popular languages first (JS, TS, Python, Rust, Go, HTML, CSS)
- Copy button (top-right): click → checkmark icon for 2s
- Optional line numbers (`--gt-text-tertiary`, 32px width, right-aligned)
- Tab inserts 2 spaces, Shift+Tab dedents

**Files to modify:**
- `packages/block-editor/src/views/code-block-view.tsx` — add Shiki integration
- `packages/core/src/extensions/code-block.ts` — ensure `language` attr, Tab/Shift+Tab handling
- `package.json` (block-editor) — add `shiki` dependency

### 3.4 Table → Cell Navigation

**Current:** `packages/block-editor/src/views/table-view.tsx` — basic render, no navigation
**Target:**
- `Tab` → next cell, `Shift+Tab` → previous cell
- Tab in last cell → create new row
- Row add button (`+`) on right edge on hover
- Column add button (`+`) on top edge on hover
- Column resize via border drag (cursor: `col-resize`, min 100px)
- Header row: `font-weight: 600`, `--gt-bg-hover` background
- Selected cell: `--gt-bg-selected` + `2px solid --gt-accent` border

**Files to modify:**
- `packages/block-editor/src/views/table-view.tsx` — add cell nav + controls
- `packages/core/src/extensions/table.ts` — Tab/Shift+Tab keybindings

---

## 4. Priority P1 — New Components

### 4.1 Slash Menu — Categories + Icons

**Current:** `packages/block-editor/src/components/slash-menu.tsx` — flat list
**Target:** 4 categories with visual separators:

| Category | Items |
|----------|-------|
| **AI** | Continue Writing, Ask AI (only if AI extension active) |
| **Style** | Text, H1-H3, Bullet/Numbered/Todo List, Blockquote, Code Block, Callout, Toggle |
| **Insert** | Mention, Emoji, Table, Separator, Table of Contents, Math, Embed, Columns |
| **Upload** | Image, File |

Visual specs:
- Width: 320px, border-radius: 20px (`--gt-radius-card`)
- Shadow: `--gt-shadow-elevated` (4-layer soft)
- Border: `1px solid rgba(0,0,0,0.05)` — minimal, depth via shadow
- Category labels: 11px uppercase, `--gt-text-tertiary`, letter-spacing 0.05em
- Item: 40px height, icon 20px + title 14px/500 + description 12px/tertiary
- Fuzzy search with scoring: exact prefix > alias match > fuzzy substring
- Match highlighting with `<mark>`
- Keyboard nav: Arrow Up/Down, Enter select, Escape close
- Animation: `opacity + scale(0.98→1) + translateY(4px→0)`, 150ms ease-out
- Viewport edge detection for positioning

**Files to modify:**
- `packages/block-editor/src/components/slash-menu.tsx` — full rewrite with categories
- `packages/core/src/types/extension.ts` — update `SlashCommand.group` type to `'ai' | 'style' | 'insert' | 'upload'`

### 4.2 Bubble Menu — AI Improve + Block Type + Text Color

**Current:** `packages/react/src/bubble-menu.tsx` — B/I/U/S/Code/Link only
**Target layout (left to right):**

```
| ✨ Improve | Paragraph ▾ | B I U S </> 🔗 | A▾ color | ⋮ More |
```

Sections separated by 1px vertical separators (`rgba(0,0,0,0.05)`, 20px height).

1. **AI Improve** (✨) — calls `editor.emit('executeAiCommand', { commandId: 'rewrite' })`. Only shown if AI extension loaded.
2. **Block Type dropdown** — current type label, click → dropdown (Paragraph, H1, H2, H3, Bullet List, Numbered List, Todo, Quote, Code)
3. **Formatting** — Bold, Italic, Underline, Strikethrough, Code, Link. 32×32px buttons, radius 12px, transparent → hover rgba(0,0,0,0.08). Active mark: `--gt-accent` icon color.
4. **Text Color** — `A` with colored underline. Click → palette: 5 highlight colors (Blue, Green, Yellow, Red, Purple) with bg+text pairs, + text color, + reset.
5. **More (⋮)** — Superscript, Subscript, Clear Formatting, Copy as Markdown.

Visual: border-radius 12px, shadow `--gt-shadow-elevated`, border `1px solid rgba(0,0,0,0.05)`.

**Files to modify:**
- `packages/react/src/bubble-menu.tsx` — OR create new `packages/block-editor/src/components/bubble-menu.tsx`
- New file: `packages/block-editor/src/components/block-type-dropdown.tsx`
- New file: `packages/block-editor/src/components/text-color-picker.tsx`

### 4.3 Block Toolbar — Context Menu

**Current:** `packages/block-editor/src/components/block-toolbar.tsx` — drag handle + add button
**Target:** Add button (`+`) + Drag handle (`⠿`), where:
- `+` click → opens Slash Menu at block position
- `⠿` drag → HTML5 drag
- `⠿` click → opens Block Context Menu

**Context Menu items:**
| Item | Action |
|------|--------|
| Delete | `editor.chain().deleteBlock(blockId).run()` |
| Duplicate | `editor.chain().duplicateBlock(blockId).run()` |
| Reset Formatting | Strip all marks, reset to paragraph type |
| Copy to Clipboard | Copy as plain text + rich text to system clipboard |

Visual: border-radius 12px, shadow `--gt-shadow-elevated`, item height 32px, radius 8px, hover `--gt-bg-hover`.

**Files to modify:**
- `packages/block-editor/src/components/block-toolbar.tsx` — add context menu trigger
- New file: `packages/block-editor/src/components/block-context-menu.tsx`

### 4.4 AI Command Bar (Level 3)

Floating pill-shape input at bottom of editor.

Visual:
- Position: fixed bottom, centered
- Width: ~600px (min 320px responsive)
- Border-radius: 999px (pill)
- Background: `--gt-bg` + `backdrop-filter: blur(12px)`
- Border: `1px solid rgba(0,0,0,0.05)`
- Shadow: `--gt-shadow-elevated`
- Placeholder: "Tell AI what to change..."
- Icon: ✨ sparkles left
- Expand on focus for multi-line
- Shortcut: `Mod-k`
- Z-index: `--gt-z-ai: 70`

Commands routed from bar:
- Free text → AI generation
- "Proofread" → AI Proofread flow
- "Add paragraph about X" → AI Add Paragraph
- "Review" → AI Comments

**Files to create:**
- `packages/block-editor/src/components/ai-command-bar.tsx`
- `packages/ai/src/agent.ts` — Level 3 agent extension (`AIAgent`)

### 4.5 Suggestion Toolbar (AI Proofread)

Toolbar for navigating AI-generated suggestions:

```
| 1/5 | ◄ ► | [Accept All] [Reject All] |
```

Shows when AI Proofread generates suggestions. Each suggestion in the document:
- Additions: green highlight (`--gt-highlight-green-bg`)
- Deletions: gray strikethrough
- Per-suggestion Accept (✓) / Reject (✗) buttons

**Files to create:**
- `packages/block-editor/src/components/suggestion-toolbar.tsx`

### 4.6 Comment Sidebar

Right-side panel with comment threads (Google Docs-like):

- Comment bubbles aligned vertically with their anchor text
- Each bubble: author name, timestamp, quoted text, comment body, replies
- Reply input at bottom of each thread
- Resolve button per thread
- Navigation: `◄ 2/7 ►` with scroll-to-comment
- Filter tabs: "Open (N)" / "Resolved (N)"
- Sidebar width: 280px, collapsible

**Current:** `packages/block-editor/src/components/comment-sidebar.tsx` — exists but basic
**Files to modify:**
- `packages/block-editor/src/components/comment-sidebar.tsx` — expand with threading, navigation, reply

### 4.7 Theme Toggle

Dark/light mode toggle component:

**Files to modify:**
- `packages/theme/src/api.ts` — ensure `setTheme('light' | 'dark' | 'system')` works
- `packages/block-editor/src/components/block-editor.tsx` — wire theme toggle

---

## 5. Priority P1 — Refactor Existing Components

### 5.1 Apply Design System to ALL Components

Every component must use the updated design tokens from `docs/18-design-system.md`:

**Border philosophy:** Minimal borders — `1px solid rgba(0,0,0,0.05)` opacity, depth conveyed through shadows.

**Shadow:** Replace `--gt-shadow-md` / `--gt-shadow-lg` with `--gt-shadow-elevated` (4-layer soft) for all floating elements:
```css
--gt-shadow-elevated:
  0px 16px 48px 0px rgba(17,24,39,0.04),
  0px 12px 24px 0px rgba(17,24,39,0.04),
  0px 6px 8px 0px rgba(17,24,39,0.02),
  0px 2px 3px 0px rgba(17,24,39,0.02);
```

**Border-radius:**
- Toolbar buttons: 12px (`--gt-radius-lg`)
- Cards, dropdowns, menus: 20px (`--gt-radius-card`)
- Bubble menu: 12px
- Code block: 8px (`--gt-radius-md`)

**Buttons:** 32×32px, transparent background, hover `rgba(0,0,0,0.08)`. NO visible borders on buttons.

**Separators:** 1px height/width, `rgba(0,0,0,0.05)`, margin 4px.

**Editor canvas:** Transparent background, no border, `max-width: 708px`, centered.

**Files to modify (all existing component files):**
- `packages/theme/src/theme.css` — update token values
- `packages/block-editor/src/components/*.tsx` — apply correct radius/shadow/border
- `packages/block-editor/src/views/*.tsx` — apply correct design tokens

### 5.2 Font Stack Update

Change default font to Inter:
```css
--gt-font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

Content text: 16px / 24px line-height / weight 400
UI text (menus, labels): 14px / 20px / weight 500
Labels (category headers): 12px / 16px / weight 600
H1: 30px / 36px / weight 700

**Files to modify:**
- `packages/theme/src/theme.css`

### 5.3 Highlight Palette

Add 5-color highlight palette (for Text Color picker in Bubble Menu):

| Color | Background | Text |
|-------|-----------|------|
| Blue | `#dbeafe` | `#1e40af` |
| Green | `#dcfce7` | `#166534` |
| Yellow | `#fef9c3` | `#854d0e` |
| Red | `#fecaca` | `#991b1b` |
| Purple | `#f3e8ff` | `#6b21a8` |

Dark mode variants with inverted luminance (see `docs/18-design-system.md`).

**Files to modify:**
- `packages/theme/src/theme.css` — add `--gt-highlight-*` tokens

---

## 6. Priority P2 — AI Integration

### 6.1 Level 2 — Context AI Extension

Create `AIContext` extension that adds:
- "Improve" button in Bubble Menu (rewrites selected text as suggestion)
- "Continue Writing" in Slash Menu (AI generates next paragraph)
- "Ask AI" in Slash Menu (free prompt input → AI content)

**Files to create:**
- `packages/ai/src/context.ts` — `AIContext` extension definition
- Modify `packages/block-editor/src/components/slash-menu.tsx` — add AI category (conditional)
- Modify bubble menu — add AI Improve button (conditional)

### 6.2 Level 3 — Agent AI Toolkit Extension

Create `AIAgent` extension that adds:
- AI Command Bar (floating input, `Mod-k`)
- AI Comments (document review → comment threads)
- AI Proofread (document scan → suggestions with toolbar)
- AI Add Paragraph (contextual paragraph as diff)
- AI Status Indicator (footer bar during processing)

**Files to create:**
- `packages/ai/src/agent.ts` — `AIAgent` extension definition
- `packages/block-editor/src/components/ai-command-bar.tsx`
- `packages/block-editor/src/components/suggestion-toolbar.tsx`
- `packages/block-editor/src/components/ai-status-indicator.tsx`

### 6.3 Provider Streaming

Ensure all AI operations use streaming (character-by-character rendering):
- Ghost text: token-by-token via `SuggestionState.appendChunk()`
- AI Improve: streaming rewrite displayed as evolving suggestion
- Continue Writing: streaming into new paragraph
- AI Proofread: batch generation, display all suggestions at once

---

## 7. File Map — All Changes

### Files to CREATE (new):

| Path | Purpose |
|------|---------|
| `packages/block-editor/src/components/block-context-menu.tsx` | Context menu for block toolbar (Delete, Duplicate, Reset, Copy) |
| `packages/block-editor/src/components/block-type-dropdown.tsx` | Block type selector for bubble menu |
| `packages/block-editor/src/components/text-color-picker.tsx` | Text/highlight color picker for bubble menu |
| `packages/block-editor/src/components/ai-command-bar.tsx` | Level 3 AI floating command input |
| `packages/block-editor/src/components/suggestion-toolbar.tsx` | Suggestion counter + navigation + accept/reject all |
| `packages/block-editor/src/components/ai-status-indicator.tsx` | "Using AI toolkit..." footer status |
| `packages/ai/src/context.ts` | Level 2 AI Context extension |
| `packages/ai/src/agent.ts` | Level 3 AI Agent extension |

### Files to MODIFY (existing):

| Path | Changes |
|------|---------|
| `packages/block-editor/src/components/slash-menu.tsx` | Add 4 categories (AI/Style/Insert/Upload), fuzzy search, icons, visual separators, 320px width, 20px radius |
| `packages/block-editor/src/components/drag-handle.tsx` | Replace @dnd-kit with HTML5 Drag API, add drop indicators, shadow on drag |
| `packages/block-editor/src/components/block-toolbar.tsx` | Add `+` button, context menu trigger on drag handle click |
| `packages/block-editor/src/components/block-editor.tsx` | Add drag event handlers (onDragOver/onDrop), wire AI command bar, theme toggle |
| `packages/block-editor/src/components/comment-sidebar.tsx` | Expand with threading, reply input, resolve, navigation, scroll-to-comment |
| `packages/block-editor/src/views/image-view.tsx` | Add upload zone, 8-point resize handles, aspect ratio lock, progress bar, caption |
| `packages/block-editor/src/views/table-view.tsx` | Add Tab/Shift+Tab cell nav, row/column add buttons, column resize, header styling |
| `packages/block-editor/src/views/code-block-view.tsx` | Add Shiki syntax highlighting, language selector, copy button, line numbers |
| `packages/react/src/bubble-menu.tsx` | Add AI Improve, Block Type dropdown, Text Color picker, More menu. Apply 12px radius, elevated shadow. |
| `packages/theme/src/theme.css` | Add `--gt-shadow-elevated`, `--gt-radius-*`, `--gt-highlight-*`, update font to Inter, update all shadow/radius values |
| `packages/core/src/extensions/image.ts` | Ensure `width`, `height`, `caption` attrs |
| `packages/core/src/extensions/code-block.ts` | Add `language` attr, Tab/Shift+Tab keybindings |
| `packages/core/src/extensions/table.ts` | Add Tab/Shift+Tab cell navigation keybindings |
| `packages/core/src/types/extension.ts` | Update `SlashCommand.group` type |
| `packages/ai/src/extension.ts` | Wire Level 2 + Level 3 extensions |

### Files to DELETE / Dependencies to REMOVE:

| Item | Reason |
|------|--------|
| `@dnd-kit/sortable`, `@dnd-kit/core`, `@dnd-kit/utilities` | Replaced by HTML5 Drag API — remove from `package.json` |

---

## 8. Acceptance Criteria

### P0 — Critical Fixes
- [x] Blocks can be dragged and dropped between positions using native drag handle
- [x] Drop indicator (2px accent line) appears between blocks during drag
- [x] Image block shows upload zone, 8-point resize handles work (aspect ratio locked)
- [x] Code block renders syntax-highlighted code via Shiki
- [x] Code block language selector dropdown works
- [x] Code block copy button copies code with checkmark feedback
- [x] Table Tab/Shift+Tab navigates between cells
- [x] Table row/column add buttons visible on hover

### P1 — New Components
- [x] Slash menu shows 4 categories with visual separators
- [x] Slash menu fuzzy search filters and highlights matches
- [x] Slash menu has 320px width, 20px border-radius, 4-layer shadow
- [x] Bubble menu shows: AI Improve | Block Type ▾ | B I U S </> 🔗 | A▾ | ⋮
- [x] Block type dropdown changes block type (paragraph ↔ heading, etc.)
- [x] Text color picker shows 5 highlight colors + text color + reset
- [x] Block context menu (Delete, Duplicate, Reset, Copy) opens on drag handle click
- [x] AI Command Bar appears at bottom on Mod-k, accepts free-text prompts
- [x] Suggestion toolbar shows counter (1/N), navigation (◄►), Accept All, Reject All
- [x] Comment sidebar shows threads with author, timestamp, quoted text, replies
- [x] Comment navigation (prev/next with counter) works

### P1 — Design System
- [x] All floating elements use `--gt-shadow-elevated` (4-layer soft)
- [x] Borders are `rgba(0,0,0,0.05)` — NOT solid gray
- [x] Toolbar buttons are 32×32px, radius 12px, transparent → hover rgba(0,0,0,0.08)
- [x] Cards/menus have radius 20px
- [x] Editor canvas is transparent bg, max-width 720px, centered
- [x] Font stack starts with "Inter"
- [x] Dark mode works for all components (toggle via `data-theme="dark"`)

### P2 — AI
- [x] AI Improve in bubble menu rewrites selected text as suggestion
- [x] "Continue Writing" in slash menu generates next paragraph via streaming
- [x] "Ask AI" in slash menu opens prompt input → generates content
- [x] AI Proofread scans document and creates suggestions with toolbar
- [x] AI Comments creates comment threads on issues found
- [x] AI Add Paragraph generates contextual paragraph as diff
- [x] AI status indicator shows during AI processing

---

## 9. Implementation Order

```
Phase 1: Design System Foundation
  1. Update packages/theme/src/theme.css with all new tokens
  2. Apply to existing components (radius, shadows, borders)

Phase 2: P0 Critical Fixes (in parallel)
  3a. Drag & Drop — rewrite drag-handle.tsx with HTML5 API
  3b. Image — add resize handles to image-view.tsx
  3c. Code Block — integrate Shiki in code-block-view.tsx
  3d. Table — add cell navigation to table-view.tsx

Phase 3: P1 UI Components
  4. Slash Menu — rewrite with categories
  5. Bubble Menu — add AI Improve + Block Type + Color
  6. Block Toolbar — add context menu
  7. Comment Sidebar — expand with threading

Phase 4: P1 New Components
  8. AI Command Bar
  9. Suggestion Toolbar
  10. Theme Toggle

Phase 5: P2 AI Integration
  11. Level 2 — AIContext extension
  12. Level 3 — AIAgent extension
  13. Wire all AI UI components

Phase 6: Polish & Test
  14. E2E tests for all new components (see docs/19-testing.md)
  15. Dark mode verification
  16. Mobile/touch verification
  17. Accessibility audit (keyboard nav, ARIA labels)
```

---

## 10. Design Reference

**Do NOT copy Tiptap 1:1.** Adapt the interaction patterns with GoTipe's own identity:

- **Own accent color** — NOT Tiptap's `#6229FF`. Use GoTipe's brand color (configurable via `--gt-accent`).
- **Own proportions** — Same structural patterns but GoTipe's spacing/sizing scale.
- **Tiptap patterns to adopt:**
  - 4-layer soft shadows instead of flat `box-shadow`
  - Minimal borders (opacity 0.05) — depth via shadows, not borders
  - Large border-radius (12px buttons, 20px cards/menus)
  - Transparent button backgrounds with hover rgba overlay
  - Content-first: menus/toolbars appear on demand, not always visible
  - Pill-shape AI command bar at bottom

**Tiptap patterns to skip:**
  - Their brand color (#6229FF) and brand fonts (DM Sans)
  - Their exact sizing (adapt to GoTipe spacing scale)
  - Their pricing/cloud integration
  - Their Extensions API (GoTipe has its own)

---

## 11. Tiptap Examples Catalog (26+ примеров)

Полный каталог примеров на [tiptap.dev/docs/examples](https://tiptap.dev/docs/examples). Используется как референс для функциональности GoTipe.

### 4 шаблона редактора

| Шаблон | Лицензия | Ключевые фичи |
|--------|----------|----------------|
| **Agent Editor** | Commercial (AI Toolkit) | AI меню (Proofread, Add AI comment, Adjust text, Justify edit), toolbar с zoom/headings/alignment, AI подсветка правок, Custom components |
| **Notion-like Editor** | Commercial | Slash-меню с категориями (AI/Style), Bubble menu (Improve + Block Type + Color + форматирование), drag handles, dark mode, коллаборация |
| **Simple Editor** | MIT | Toolbar (undo/redo, headings, lists, indent, B/I/S/Code/U, links, alignment, + Add), highlight, dark mode toggle. Без AI, без slash/bubble menu |
| **Headless Editor** | MIT | Минимальный UI — чистые HTML-кнопки (Bold, Italic, Strike, Code, H1-H6, Lists, Blockquote, HR, Undo/Redo). Полностью BYO styles |

### Bubble Menu (Notion-like)

При выделении текста всплывает inline-toolbar:
- **Improve** (AI) — улучшение через AI
- **Block Type** (dropdown: Paragraph, Blockquote, Heading...)
- **B** *I* U ~~S~~ `</>` — форматирование
- **Link** — вставка ссылки
- **A** (цвет) — цвет текста/фона
- **...** — дополнительные опции (Superscript, Subscript и др.)

### Basics (9 примеров)

| Пример | Описание |
|--------|----------|
| Default Text Editor | Базовый текстовый редактор |
| Formatting | Стилизация контента (bold, italic, lists и т.д.) |
| Images | Вставка и работа с изображениями |
| Long Texts | Оптимизация производительности на больших документах |
| Markdown Shortcuts | Конвертация markdown-синтаксиса (**, ##, - и т.д.) |
| Minimal Setup | Легковесная минимальная реализация |
| Tables | Создание и редактирование таблиц |
| Tasks | Task list / чек-листы |
| Text Direction & RTL | Поддержка right-to-left языков |

### Advanced (10 примеров)

| Пример | Описание |
|--------|----------|
| Collaborative Editing | Многопользовательское редактирование в реальном времени |
| Custom Drawing | Рисование кастомных элементов |
| Bubble & Floating Menus | Контекстные меню при выделении и курсоре |
| Mentions | @-упоминания пользователей |
| Syntax Highlighting | Подсветка синтаксиса в code blocks (Shiki/lowlight) |
| React Components | Встраивание интерактивных React-компонентов в контент |
| Vue Components | Встраивание Vue-компонентов |
| Content Structure | Enforced структура документа (schema rules) |
| RAG | Retrieval-Augmented Generation — AI + поиск по базе знаний |
| React Performance | Оптимизация рендера в React |

### Experiments (7 примеров, unsupported)

| Пример | Описание |
|--------|----------|
| Collaborative Fields | Отдельные Yjs-документы для полей формы |
| Figure Node | Кастомный figure/figcaption блок |
| Generic Figure | Обобщённый figure для разных типов медиа |
| iFrame Embedding | Встраивание iframe (YouTube, карты и т.д.) |
| Document Linting | Автоматическая проверка документа на ошибки |
| Slash Commands | Slash-меню (`/`) для быстрой вставки блоков |
| Smart Editor | Кастомные замены и автокоррекция |
