# GoTipe — Block Editor (Notion-like UX)

> **Историческая спецификация, не руководство по текущему API.** Примеры, сроки,
> сравнения производительности, коммерческие условия и обещания ниже не подтверждают
> реализацию или доступность сервиса. Актуально: [контракты](development/editor-contracts.md),
> [карта кода](development/code-map.md), [проверки](development/testing.md),
> [план выпуска](22-release-readiness.md). Лицензии определяются `LICENSE` и manifest
> каждого пакета, а не этим документом.

> **Лицензия:** `@gotipe/block-editor` — коммерческий пакет. Headless core (`@gotipe/core`, `@gotipe/react`, etc.) — MIT.
> Подписчики GoTipe Cloud получают Block Editor лицензию бесплатно.

## Обзор

`@gotipe/block-editor` — коммерческий пакет с готовым Notion-like UI: slash commands, drag-and-drop, floating toolbar, nested blocks, темы. Одна строчка `<BlockEditor />` = полноценный редактор.

Headless API (`@gotipe/core` + framework adapters) позволяет построить **любой** UI бесплатно (MIT). Block Editor — для тех, кто хочет готовый Notion-like UX без написания UI.

### Что MIT vs что коммерческое

| Бесплатно (MIT) | Коммерческое (`@gotipe/block-editor`) |
|-----------------|--------------------------------------|
| Document model, transforms, commands | `<BlockEditor />` — готовый компонент |
| `useEditor()`, `<EditorContent />` | `<SlashMenu />` — slash commands UI |
| Все block types (data + commands) | `<BubbleMenu />` — floating toolbar UI |
| Все marks (bold, italic, etc.) | `<BlockToolbar />` — drag handle + block menu |
| CRDT collaboration engine | `<DragHandle />` — drag-and-drop UI |
| AI provider interface + commands | `<AIPanel />` — AI ghost text + command palette UI |
| Export (HTML, MD, PDF, DOCX) | Темы (minimal, modern, notion, docs) |
| Framework adapters (React, Vue, Svelte, Solid) | Input rules UI feedback |
| Extension API | Image block UI (resize handles, caption) |
| CSS variables API | Table block UI (column resize, toolbar) |

### Лицензирование

```tsx
import { BlockEditor } from '@gotipe/block-editor'

<BlockEditor
  licenseKey="ge_xxx"              // JWT ключ, офлайн-верификация
  content={content}
  onChange={setContent}
  theme="notion"
/>
```

- **Ключ = подписанный JWT** (ES256). Проверяется офлайн, без API-вызовов
- Содержит: plan, expiry, allowed domains
- Без ключа: редактор работает, но с watermark "GoTipe Block Editor — Unlicensed"
- Dev/localhost: всегда работает без watermark

### Цены

| Лицензия | Цена | Включает |
|----------|------|----------|
| **Block Editor Indie** | $149/app/год | 1 production domain |
| **Block Editor Business** | $499/app/год | до 10 domains, приоритетная поддержка |
| **GoTipe Cloud** (любой план) | от $29/мес | Block Editor лицензия **включена** |
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
2. Открывается dropdown (320px ширина, border-radius 20px, 4-layer soft shadow) с fuzzy search
3. Клавиатурная навигация (↑↓, Enter, Escape)
4. Выбор команды создаёт новый блок или трансформирует текущий
5. Позиционирование: рядом с курсором, viewport edge detection (если не помещается снизу — показывается сверху)

### Категории и команды

Slash menu разбит на 4 категории с визуальными разделителями:

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

**Категория AI** — отображается только если AI extension подключён (`AIInline.configure()`).

| Категория | Команда | Aliases | Действие |
|-----------|---------|---------|----------|
| **AI** | Continue Writing | `/continue`, `/ai-continue` | AI генерирует следующий параграф в контексте документа |
| **AI** | Ask AI | `/ask`, `/ai`, `/prompt` | Открывает AI prompt input → AI генерирует контент |
| **Style** | Text | `/text`, `/paragraph` | Новый параграф |
| **Style** | Heading 1 | `/h1`, `/heading1` | Heading level 1 |
| **Style** | Heading 2 | `/h2`, `/heading2` | Heading level 2 |
| **Style** | Heading 3 | `/h3`, `/heading3` | Heading level 3 |
| **Style** | Bullet List | `/bullet`, `/ul` | Маркированный список |
| **Style** | Numbered List | `/number`, `/ol` | Нумерованный список |
| **Style** | Todo List | `/todo`, `/checkbox` | Список с чекбоксами |
| **Style** | Blockquote | `/quote`, `/blockquote` | Цитата |
| **Style** | Code Block | `/code` | Блок кода с подсветкой синтаксиса |
| **Style** | Callout | `/callout`, `/info` | Callout блок |
| **Style** | Toggle | `/toggle` | Раскрывающийся блок |
| **Insert** | Mention | `/mention`, `/@` | Упоминание пользователя |
| **Insert** | Emoji | `/emoji` | Emoji picker |
| **Insert** | Table | `/table` | Таблица 3×3 |
| **Insert** | Separator | `/divider`, `/hr` | Горизонтальная линия |
| **Insert** | Table of Contents | `/toc`, `/contents` | Auto-генерируемое оглавление |
| **Insert** | Math | `/math`, `/equation` | Математическая формула (KaTeX) |
| **Insert** | Embed | `/embed` | Вставка URL (YouTube, Figma, etc.) |
| **Insert** | Columns | `/columns`, `/cols` | Двухколоночный layout |
| **Upload** | Image | `/image`, `/img` | Загрузка изображения |
| **Upload** | File | `/file` | Прикрепление файла |

### Fuzzy Search

Поиск по slash menu работает через fuzzy scoring с приоритетами:

1. **Exact prefix match** — наивысший приоритет (ввёл `hea` → `Heading 1` первый)
2. **Alias match** — совпадение с alias (`h1` → `Heading 1`)
3. **Fuzzy substring** — нечёткий поиск в name + description
4. Подсветка совпадений через `<mark>` в dropdown
5. При пустом результате — "No results" с `--gt-text-tertiary` по центру

### Визуальные спецификации

| Свойство | Значение |
|----------|---------|
| Ширина | `320px` |
| Max-height | `400px` (scrollable) |
| Border-radius | `20px` |
| Shadow | 4-layer soft elevation (см. 18-design-system.md) |
| Border | `1px solid rgba(0,0,0,0.05)` |
| Фон | `--gt-bg` |
| Category label | `--gt-text-tertiary`, 11px, uppercase, letter-spacing 0.05em |
| Item высота | `40px` |
| Item hover | `--gt-bg-hover`, border-radius 6px |
| Item selected (keyboard) | `--gt-bg-selected` |
| Item icon | 20px, margin-right 10px |
| Item title | `--gt-text`, 14px, font-weight 500 |
| Item description | `--gt-text-tertiary`, 12px |
| Анимация появления | `opacity + scale(0.98→1) + translateY(4px→0)`, 150ms ease-out |
| Позиционирование | Рядом с курсором; viewport edge detection — если меню выходит за низ экрана, показывается сверху |

### TypeScript API

```typescript
// packages/core/src/slash-commands.ts

export type SlashCommandGroup = 'ai' | 'style' | 'insert' | 'upload';

export interface SlashCommand {
  /** Имя команды */
  name: string;
  /** Алиасы для поиска */
  aliases: string[];
  /** Описание */
  description: string;
  /** Иконка (SVG icon name из @gotipe/theme) */
  icon: string;
  /** Категория — определяет расположение в меню и визуальный разделитель */
  group: SlashCommandGroup;
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

HTML5 Drag API (НЕ @dnd-kit) — нативный API с минимальным bundle size и лучшей совместимостью с touch devices.

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

    // Визуальное состояние: elevated shadow + scale
    const blockEl = document.querySelector(`[data-block-id="${blockId}"]`);
    if (blockEl) {
      blockEl.classList.add('gotipe-block--dragging');
    }
  };

  const handleDragEnd = () => {
    // Убрать визуальное состояние
    document.querySelector('.gotipe-block--dragging')
      ?.classList.remove('gotipe-block--dragging');
    // Убрать drop indicators
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

### Drop Indicator и зоны

```css
/* Визуальная линия drop indicator */
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

Блоки можно перетаскивать не только между блоками, но и внутрь блоков (nesting):

| Drop Zone | Определение | Действие |
|-----------|-------------|----------|
| Между блоками (top/bottom 25%) | Горизонтальная линия-индикатор | Вставить на этом уровне |
| Середина блока (центральные 50%) | Весь блок подсвечивается | Сделать child (nest inside) |
| Indent zone (правый край, >75% ширины) | Смещённый индикатор вправо | Сделать следующим sibling в parent |

### Touch Support

На мобильных устройствах drag активируется через **long-press** (300ms) на drag handle. Feedback: вибрация (Haptic API), увеличенная тень.

---

## Toolbar

### Floating Toolbar (Bubble Menu)

Появляется при выделении текста. Layout слева направо:

```
┌────────────────────────────────────────────────────────────────────┐
│ ✨ Improve │ Paragraph ▾ │ B  I  U  S  </>  🔗 │ A▾ color │ ⋮  │
└────────────────────────────────────────────────────────────────────┘
  AI action   Block Type    Formatting marks       Text     More
              dropdown                             Color    menu
```

**Секции Bubble Menu (разделены вертикальными разделителями):**

1. **AI Improve** — кнопка с иконкой ✨. При клике AI перезаписывает выделенный текст как suggestion (отображается diff). Показывается только при подключённом AI extension.
2. **Block Type dropdown** — текущий тип блока (Paragraph, Heading 1-3, Bullet List, etc.). Клик открывает dropdown для смены типа.
3. **Formatting marks** — Bold, Italic, Underline, Strikethrough, Inline Code, Link. Кнопки 32×32px, подсвечиваются при активном mark.
4. **Text Color picker** — кнопка `A` с цветной подчёркиванием. Клик открывает палитру: 5 highlight цветов (Blue, Green, Yellow, Red, Purple) + text color + reset.
5. **More (⋮)** — дополнительные опции: Superscript, Subscript, Clear Formatting, Copy as Markdown.

**Визуальные спецификации:**

| Свойство | Значение |
|----------|---------|
| Фон | `--gt-bg` |
| Border | `1px solid rgba(0,0,0,0.05)` |
| Shadow | 4-layer soft elevation (см. 18-design-system.md) |
| Border-radius | `12px` |
| Padding | `4px` |
| Кнопка размер | 32×32px, border-radius 12px |
| Кнопка hover | `rgba(0,0,0,0.08)` background |
| Кнопка active (mark включён) | `--gt-accent` цвет иконки |
| Разделитель | 1px вертикальная линия, `rgba(0,0,0,0.05)`, height 20px, margin 0 4px |
| Позиционирование | Над выделением, по центру. Если не влезает сверху — снизу. Viewport edge detection. |
| Отступ от выделения | 8px |
| Анимация | `opacity + translateY(4px→0)`, 150ms ease-out |
| Z-index | `--gt-z-bubble: 40` |

```typescript
// packages/block-editor/src/components/BubbleMenu.tsx

export function BubbleMenu({ editor }: { editor: GoTipeEditor }) {
  return (
    <div className="gotipe-bubble-menu" data-gotipe-bubble-menu>
      {/* AI Improve — показывается только если AI extension подключён */}
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

Появляется при hover на блоке. Позиционируется слева от блока (-24px). Содержит две кнопки:

```
  +  ⠿  │ Block content here...
  │  │
  │  └─ Drag handle: drag & drop + click opens context menu
  └──── Add button: opens slash menu at this block position
```

**Add Button (`+`):**
- Клик → открывает Slash Menu в позиции блока
- Показывает slash menu с курсором в начале нового блока ниже

**Drag Handle (`⠿`):**
- Drag → HTML5 Drag API drag & drop (см. раздел Drag and Drop)
- Click → открывает Block Context Menu

**Block Context Menu:**

```
┌──────────────────────────┐
│  ✂️  Delete              │
│  📋 Duplicate           │
│  🧹 Reset Formatting    │
│  📎 Copy to Clipboard   │
└──────────────────────────┘
```

| Пункт | Shortcut | Действие |
|-------|----------|----------|
| Delete | `Cmd+Shift+Backspace` | Удалить текущий блок |
| Duplicate | `Cmd+D` | Дублировать блок ниже |
| Reset Formatting | — | Снять все marks, вернуть paragraph type |
| Copy to Clipboard | — | Скопировать содержимое блока как plain text + rich text |

**Визуальные спецификации:**

| Свойство | Значение |
|----------|---------|
| Позиция | Слева от блока, `-24px` от content edge |
| Появление | `opacity 0→1`, 100ms, при hover на блоке |
| Скрытие | `opacity 1→0`, 100ms, при уходе мыши |
| Кнопки | 20×20px, `--gt-text-tertiary`, hover: `--gt-text-secondary` |
| Context menu | border-radius 12px, shadow 4-layer, padding 4px |
| Context menu item | 32px высота, border-radius 8px, hover `--gt-bg-hover` |
| Touch | Long-press (300ms) на блоке → показать handles |

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
| **License** | MIT (headless) + Commercial (UI) | MIT (core) + Commercial (Editor) | MPL 2.0 |

---

## Styling

### CSS Variables (theming)

> **Все CSS variables используют префикс `--gt-*`** (НЕ `--gotipe-*`). Полная спецификация токенов — в [18-design-system.md](18-design-system.md).

```css
/* Основные переменные — см. docs/18-design-system.md для полного списка */
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

  /* Highlight palette (5 цветов для текста/фона) */
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

| Свойство | Значение |
|----------|---------|
| Upload zone | Click + drag & drop. `--gt-bg-hover` фон, dashed border `--gt-border`, border-radius 8px |
| Progress bar | Горизонтальный, `--gt-accent` цвет, высота 4px, скругление 2px |
| Resize handles | 8 точек (4 угла + 4 середины сторон). 8×8px, `--gt-accent` фон, border-radius 50% |
| Aspect ratio lock | При drag resize сохраняется пропорция (Shift для свободного resize) |
| Caption | `--gt-text-secondary`, 14px, text-align center, placeholder "Add a caption..." |
| Selected state | `2px solid --gt-accent` border вокруг изображения |
| Max files | Configurable, default: 3 файла |
| Max file size | Configurable, default: 5MB |
| Loading | Skeleton placeholder `--gt-bg-hover` с shimmer анимацией |
| Error | Иконка broken image + `--gt-text-tertiary` "Failed to load image" |

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

| Свойство | Значение |
|----------|---------|
| Cell navigation | `Tab` → следующая ячейка, `Shift+Tab` → предыдущая. В последней ячейке Tab создаёт новую строку |
| Row add button | `+` кнопка справа от таблицы, появляется при hover на строке |
| Column add button | `+` кнопка сверху от таблицы, появляется при hover на колонке |
| Column resize | Drag handle на вертикальных borders. Cursor: `col-resize`. Минимум 100px ширины |
| Header row | Первая строка: font-weight 600, `--gt-bg-hover` фон |
| Selected cell | `--gt-bg-selected` фон, `2px solid --gt-accent` border |
| Multi-cell selection | Shift+Click для выбора диапазона ячеек |
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

| Свойство | Значение |
|----------|---------|
| Syntax highlighting | Shiki (WASM) для browser, tree-sitter для Node.js. Тема синхронизирована с editor theme (light/dark) |
| Language selector | Dropdown вверху слева, `--gt-text-tertiary`, 12px. Popular languages first (JS, TS, Python, Rust, Go, HTML, CSS) |
| Copy button | Вверху справа, `--gt-text-tertiary`, hover: `--gt-text`. Click → иконка меняется на ✓ checkmark на 2s |
| Line numbers | Опционально (настраивается). `--gt-text-tertiary`, fixed width 32px, right-aligned |
| Font | `--gt-font-mono`, 14px, line-height 1.6 |
| Background | `--gt-bg-code`, border-radius 8px, padding 16px |
| Horizontal overflow | Scroll, тонкий scrollbar (4px) |
| Tab behavior | Вставляет 2 пробела (или tab, настраивается). `Shift+Tab` — dedent |

---

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
