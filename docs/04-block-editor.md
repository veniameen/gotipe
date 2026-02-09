# GoTipe — Block Editor (Notion-like UX)

## Обзор

GoTipe по умолчанию предоставляет block editor с Notion-like UX: slash commands, drag-and-drop, floating toolbar, nested blocks. Всё работает из коробки через `@gotipe/react` (или другой adapter), но каждый элемент можно кастомизировать или заменить через headless API.

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

### Полный каталог

| Block Type | Описание | Content | Children | Attrs |
|-----------|----------|---------|----------|-------|
| `paragraph` | Обычный текст | RichText | Нет | — |
| `heading` | Заголовок H1-H6 | RichText | Нет | `level: 1-6` |
| `bulletList` | Маркированный список | Empty | `listItem[]` | — |
| `orderedList` | Нумерованный список | Empty | `listItem[]` | `start: number` |
| `listItem` | Элемент списка | RichText | Вложенные списки | `checked: bool\|null` |
| `codeBlock` | Блок кода | RawText | Нет | `language: string` |
| `image` | Изображение | Empty (leaf) | Нет | `src, alt, width` |
| `blockquote` | Цитата | RichText | `paragraph[]` | — |
| `callout` | Выделение (info/warning) | RichText | `paragraph[]` | `emoji: string` |
| `divider` | Горизонтальная линия | Empty (leaf) | Нет | — |
| `table` | Таблица | Empty | `tableRow[]` | — |
| `tableRow` | Строка таблицы | Empty | `tableCell[]\|tableHeader[]` | — |
| `tableCell` | Ячейка таблицы | RichText | Нет | `colspan, rowspan` |
| `tableHeader` | Заголовок таблицы | RichText | Нет | `colspan, rowspan` |
| `toggle` | Раскрывающийся блок | RichText (summary) | Любые блоки | `open: bool` |
| `columns` | Колонки | Empty | `column[]` | — |
| `column` | Одна колонка | Empty | Любые блоки | `width: number` |
| `embed` | Вставка (YouTube, Figma...) | Empty (leaf) | Нет | `url, type` |
| `math` | Формула (KaTeX/MathJax) | RawText | Нет | — |
| `file` | Прикреплённый файл | Empty (leaf) | Нет | `url, name, size, mime_type` |

### JSON Schema для каждого block type

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

#### Bullet List с nested items

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

### Как работает

1. Пользователь нажимает `/` в пустом блоке или после текста
2. Открывается dropdown с fuzzy search
3. Клавиатурная навигация (↑↓, Enter, Escape)
4. Выбор команды создаёт новый блок или трансформирует текущий

### Built-in Slash Commands

| Команда | Shortcut | Действие |
|---------|----------|----------|
| Text | `/text`, `/paragraph` | Новый параграф |
| Heading 1 | `/h1`, `/heading1` | Heading level 1 |
| Heading 2 | `/h2`, `/heading2` | Heading level 2 |
| Heading 3 | `/h3`, `/heading3` | Heading level 3 |
| Bullet List | `/bullet`, `/ul` | Маркированный список |
| Numbered List | `/number`, `/ol` | Нумерованный список |
| Todo List | `/todo`, `/checkbox` | Список с чекбоксами |
| Code | `/code` | Блок кода |
| Quote | `/quote`, `/blockquote` | Цитата |
| Callout | `/callout`, `/info` | Callout блок |
| Image | `/image`, `/img` | Вставка изображения |
| Divider | `/divider`, `/hr` | Горизонтальная линия |
| Table | `/table` | Таблица 3x3 |
| Toggle | `/toggle` | Раскрывающийся блок |
| Columns | `/columns`, `/cols` | Двухколоночный layout |
| Embed | `/embed` | Вставка URL |
| Math | `/math`, `/equation` | Математическая формула |
| File | `/file` | Прикрепление файла |

### TypeScript API

```typescript
// packages/core/src/slash-commands.ts

export interface SlashCommand {
  /** Имя команды */
  name: string;
  /** Алиасы для поиска */
  aliases: string[];
  /** Описание */
  description: string;
  /** Иконка (emoji или React component name) */
  icon: string;
  /** Группа для визуального разделения */
  group: 'basic' | 'media' | 'advanced' | 'inline';
  /** Функция выполнения */
  execute: (editor: GoTipeEditor) => void;
  /** Кастомное условие показа */
  shouldShow?: (editor: GoTipeEditor) => boolean;
}

// Регистрация кастомной slash command:
editor.registerSlashCommand({
  name: 'Alert',
  aliases: ['alert', 'warning', 'danger'],
  description: 'Red alert box',
  icon: '🚨',
  group: 'advanced',
  execute: (editor) => {
    editor.chain()
      .insertBlockAfter('callout', { emoji: '🚨' })
      .focus()
      .run();
  },
});
```

### Input Rules (Markdown shortcuts)

Помимо slash commands, GoTipe поддерживает Markdown-like input rules:

| Input | Результат |
|-------|----------|
| `# ` + space | Heading 1 |
| `## ` + space | Heading 2 |
| `### ` + space | Heading 3 |
| `- ` или `* ` | Bullet list |
| `1. ` | Ordered list |
| `[] ` или `[ ] ` | Todo list |
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
Drag Flow:

1. Hover over block → show drag handle (⠿)
2. mousedown on drag handle → start drag
3. DragOverlay appears (semi-transparent block clone)
4. Move mouse → drop indicator line shows between blocks
5. Release → MoveBlock step applied

┌───────────────────────────────┐
│ ⠿  Paragraph 1               │
├───────────────────────────────┤
│ ⠿  Paragraph 2   ← dragging  │  ──► ┌──────────┐
├───────────────────────────────┤      │ Overlay  │
│ ▬▬▬▬▬▬▬▬▬▬▬▬ drop here ▬▬▬▬▬│      └──────────┘
├───────────────────────────────┤
│ ⠿  Paragraph 3               │
├───────────────────────────────┤
│ ⠿  Paragraph 4               │
└───────────────────────────────┘
```

### Implementation (React)

```typescript
// packages/react/src/components/DragHandle.tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface DragHandleProps {
  blockId: string;
  children: React.ReactNode;
}

export function DragHandle({ blockId, children }: DragHandleProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: blockId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} data-block-id={blockId}>
      <button
        className="gotipe-drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        ⠿
      </button>
      {children}
    </div>
  );
}
```

### Nested Block Drag

Блоки можно перетаскивать не только между блоками, но и внутрь блоков (nesting):

| Drop Zone | Действие |
|-----------|----------|
| Между блоками (top/bottom 25%) | Вставить на этом уровне |
| Середина блока (центральные 50%) | Сделать child (nest inside) |
| Indent zone (правый край) | Сделать следующим sibling в parent |

---

## Toolbar

### Floating Toolbar (Bubble Menu)

Появляется при выделении текста. Содержит inline formatting controls.

```typescript
// packages/react/src/components/BubbleMenu.tsx
import { BubbleMenu } from '@gotipe/react';

function MyEditor() {
  return (
    <Editor>
      <BubbleMenu>
        {({ editor }) => (
          <div className="bubble-menu">
            <button
              onClick={() => editor.chain().toggleBold().run()}
              className={editor.isActive('bold') ? 'active' : ''}
            >
              B
            </button>
            <button
              onClick={() => editor.chain().toggleItalic().run()}
              className={editor.isActive('italic') ? 'active' : ''}
            >
              I
            </button>
            <button
              onClick={() => editor.chain().toggleUnderline().run()}
              className={editor.isActive('underline') ? 'active' : ''}
            >
              U
            </button>
            <button
              onClick={() => editor.chain().toggleStrikethrough().run()}
              className={editor.isActive('strikethrough') ? 'active' : ''}
            >
              S
            </button>
            <button
              onClick={() => editor.chain().toggleCode().run()}
              className={editor.isActive('code') ? 'active' : ''}
            >
              {'</>'}
            </button>
            <LinkButton editor={editor} />
            <HighlightPicker editor={editor} />
          </div>
        )}
      </BubbleMenu>
    </Editor>
  );
}
```

### Block Toolbar

Появляется при hover на блоке. Содержит: drag handle, block type selector, block actions.

```typescript
// packages/react/src/components/BlockToolbar.tsx
import { BlockToolbar } from '@gotipe/react';

// Default block toolbar includes:
// - Drag handle (⠿)
// - Block type dropdown (change paragraph → heading, etc.)
// - More menu (duplicate, delete, copy link, move to)

// Custom block toolbar:
<Editor
  blockToolbar={({ editor, block }) => (
    <div className="block-toolbar">
      <DragHandle blockId={block.id} />
      <BlockTypeSelector
        currentType={block.type}
        onChange={(type) => editor.chain().setBlockType(block.id, type).run()}
      />
      <MoreMenu>
        <MenuItem onClick={() => editor.chain().duplicateBlock(block.id).run()}>
          Duplicate
        </MenuItem>
        <MenuItem onClick={() => editor.chain().deleteBlock(block.id).run()}>
          Delete
        </MenuItem>
      </MoreMenu>
    </div>
  )}
/>
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

| Контекст | Tab | Shift+Tab |
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

## Сравнение с Tiptap/BlockNote

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
| **License** | MIT (all features) | MIT (core) | MPL 2.0 |

---

## Styling

### CSS Variables (theming)

```css
/* Дефолтная тема — через CSS variables */
:root {
  --gotipe-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --gotipe-font-size: 16px;
  --gotipe-line-height: 1.6;
  --gotipe-color-text: #1a1a1a;
  --gotipe-color-text-secondary: #6b7280;
  --gotipe-color-bg: #ffffff;
  --gotipe-color-bg-hover: #f3f4f6;
  --gotipe-color-border: #e5e7eb;
  --gotipe-color-primary: #3b82f6;
  --gotipe-color-selection: rgba(59, 130, 246, 0.2);
  --gotipe-color-cursor-remote: #ef4444;
  --gotipe-border-radius: 4px;
  --gotipe-block-spacing: 4px;
  --gotipe-code-font: 'JetBrains Mono', 'Fira Code', monospace;
  --gotipe-code-bg: #f8f9fa;
  --gotipe-callout-bg: #f0f9ff;
  --gotipe-highlight-yellow: #fef9c3;
  --gotipe-highlight-green: #dcfce7;
  --gotipe-highlight-blue: #dbeafe;
  --gotipe-highlight-pink: #fce7f3;
  --gotipe-highlight-purple: #f3e8ff;
}

/* Dark theme */
[data-theme="dark"] {
  --gotipe-color-text: #e5e7eb;
  --gotipe-color-text-secondary: #9ca3af;
  --gotipe-color-bg: #111827;
  --gotipe-color-bg-hover: #1f2937;
  --gotipe-color-border: #374151;
  --gotipe-code-bg: #1e293b;
  --gotipe-callout-bg: #1e3a5f;
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

### Headless Mode (no default styles)

```typescript
import { createEditor } from '@gotipe/core';
import { Editor } from '@gotipe/react';

// Headless: только data, рендери сам
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

## Связанные документы

- [03-editor-core.md](03-editor-core.md) — document model, transforms, commands
- [05-extensions.md](05-extensions.md) — extension system, built-in extensions
- [06-framework-adapters.md](06-framework-adapters.md) — React components, hooks
- [07-ai.md](07-ai.md) — AI integration (ghost text shows in blocks)
