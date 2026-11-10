# GoTipe — Accessibility & Internationalization

> **Историческая спецификация, не руководство по текущему API.** Примеры, сроки,
> сравнения производительности, коммерческие условия и обещания ниже не подтверждают
> реализацию или доступность сервиса. Актуально: [контракты](development/editor-contracts.md),
> [карта кода](development/code-map.md), [проверки](development/testing.md),
> [план выпуска](22-release-readiness.md). Лицензии определяются `LICENSE` и manifest
> каждого пакета, а не этим документом.

## Обзор

GoTipe обеспечивает первоклассную поддержку accessibility (a11y) и internationalization (i18n) на уровне core. Rich text editor — один из самых сложных UI-компонентов с точки зрения доступности: он должен корректно работать с клавиатурой, screen readers, различными языками, IME, RTL-текстом и assistive technologies. GoTipe решает все эти задачи системно — a11y и i18n встроены в архитектуру, а не добавлены как afterthought.

```
┌──────────────────────────────────────────────────────────────────┐
│                    Accessibility & i18n Stack                      │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  WCAG 2.1 AA │  │  Keyboard    │  │   Screen Reader        │ │
│  │  Compliance  │  │  Navigation  │  │   ARIA Support         │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘ │
│         └────────┬────────┴────────┬────────────┘               │
│                  ▼                 ▼                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            @gotipe/core — A11y Layer                      │   │
│  │  ARIA attributes │ Focus management │ Announcements       │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          @gotipe/i18n — Locale Engine                     │   │
│  │  ICU MessageFormat │ RTL/BiDi │ Pluralization │ IME       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  High        │  │  Reduced     │  │   Mobile/Touch         │ │
│  │  Contrast    │  │  Motion      │  │   A11y                 │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

Связанные документы:
- [04-block-editor.md](04-block-editor.md) — block types, slash commands, drag-and-drop
- [06-framework-adapters.md](06-framework-adapters.md) — ViewState, framework integration
- [05-extensions.md](05-extensions.md) — extension API, keyboard shortcuts
- [03-editor-core.md](03-editor-core.md) — editor state, commands, transforms

---

## 1. WCAG 2.1 Compliance

### Целевой уровень: AA

GoTipe нацелен на полное соответствие WCAG 2.1 Level AA. Для rich text editors это включает специфические требования, выходящие за рамки стандартных web-компонентов.

### Чеклист для Rich Text Editor

| WCAG Критерий | Уровень | Статус | Реализация в GoTipe |
|---------------|---------|--------|---------------------|
| **1.1.1** Non-text Content | A | Обязательно | `alt` атрибуты для image blocks, `aria-label` для embed blocks |
| **1.3.1** Info and Relationships | A | Обязательно | Семантический HTML: `<h1>`-`<h6>`, `<ul>`, `<ol>`, `<blockquote>`, `<table>` |
| **1.3.2** Meaningful Sequence | A | Обязательно | DOM order = reading order, logical block sequence |
| **1.3.3** Sensory Characteristics | A | Обязательно | Инструкции не зависят только от цвета/формы |
| **1.4.1** Use of Color | A | Обязательно | Highlight marks имеют дополнительные индикаторы помимо цвета |
| **1.4.3** Contrast (Minimum) | AA | Обязательно | Минимум 4.5:1 для текста, 3:1 для крупного текста |
| **1.4.4** Resize Text | AA | Обязательно | Работает при 200% zoom без потери функциональности |
| **1.4.11** Non-text Contrast | AA | Обязательно | UI-элементы (кнопки toolbar, focus ring) с контрастом >= 3:1 |
| **1.4.12** Text Spacing | AA | Обязательно | Работает с пользовательскими настройками spacing |
| **1.4.13** Content on Hover/Focus | AA | Обязательно | Tooltip/popover dismissible, hoverable, persistent |
| **2.1.1** Keyboard | A | Обязательно | Все операции доступны с клавиатуры |
| **2.1.2** No Keyboard Trap | A | Обязательно | Focus можно покинуть из любого элемента |
| **2.4.1** Bypass Blocks | A | Обязательно | Skip navigation link для editor region |
| **2.4.3** Focus Order | A | Обязательно | Логичный tab order: toolbar → editor → footer |
| **2.4.6** Headings and Labels | AA | Обязательно | Все UI-элементы имеют accessible labels |
| **2.4.7** Focus Visible | AA | Обязательно | Видимый focus indicator на всех интерактивных элементах |
| **2.5.1** Pointer Gestures | A | Обязательно | Multipoint gestures имеют single-pointer alternatives |
| **3.1.1** Language of Page | A | Обязательно | `lang` атрибут на editor container |
| **3.1.2** Language of Parts | AA | Обязательно | Поддержка `lang` на уровне отдельных блоков |
| **3.2.1** On Focus | A | Обязательно | Focus не вызывает неожиданных изменений контекста |
| **3.2.2** On Input | A | Обязательно | Ввод текста не вызывает неожиданных изменений |
| **4.1.1** Parsing | A | Обязательно | Валидный HTML без duplicate IDs |
| **4.1.2** Name, Role, Value | A | Обязательно | ARIA roles/states для всех custom widgets |
| **4.1.3** Status Messages | AA | Обязательно | Live regions для collaboration уведомлений |

### Принципы WCAG в контексте GoTipe

#### Perceivable (Воспринимаемость)

```typescript
// packages/core/src/a11y/perceivable.ts

export interface BlockA11yConfig {
  /** Роль для screen reader */
  role: AriaRole;
  /** Текстовая метка блока */
  label: string | ((block: BlockView) => string);
  /** Описание для сложных блоков */
  description?: string | ((block: BlockView) => string);
  /** Является ли блок landmark */
  landmark?: boolean;
}

// Каждый block type определяет свою a11y-конфигурацию
export const defaultA11yConfigs: Record<string, BlockA11yConfig> = {
  paragraph: {
    role: 'paragraph',
    label: 'Paragraph',
  },
  heading: {
    role: 'heading',
    label: (block) => `Heading level ${block.attrs.level}`,
  },
  codeBlock: {
    role: 'code',
    label: (block) => `Code block, language: ${block.attrs.language || 'plain text'}`,
    description: 'Press Escape to exit code block',
  },
  image: {
    role: 'img',
    label: (block) => block.attrs.alt || 'Image without description',
  },
  table: {
    role: 'table',
    label: 'Table',
    description: (block) => {
      const rows = block.children?.length ?? 0;
      const cols = block.children?.[0]?.children?.length ?? 0;
      return `${rows} rows, ${cols} columns`;
    },
  },
};
```

#### Operable (Управляемость)

Все операции доступны через клавиатуру. Drag-and-drop имеет keyboard alternative (Alt+Arrow для перемещения блоков). Timer-based операции (автосохранение) не требуют пользовательского ввода.

#### Understandable (Понятность)

Предсказуемое поведение: focus не меняет контекст, ввод текста не открывает popover (кроме slash commands, которые пользователь явно инициирует вводом `/`). Все error messages доступны screen readers через `aria-live`.

#### Robust (Надёжность)

Семантический HTML + ARIA: editor использует `<div role="textbox" aria-multiline="true">` с правильной иерархией `<h1>`-`<h6>`, `<ul>/<ol>`, `<table>`, `<blockquote>`. Custom blocks обёрнуты в ARIA widgets.

---

## 2. Keyboard Navigation

### Таблица горячих клавиш

GoTipe поддерживает полный набор keyboard shortcuts для всех операций. `Mod` = `Cmd` на macOS, `Ctrl` на Windows/Linux.

#### Форматирование текста

| Shortcut | Действие | Команда |
|----------|---------|---------|
| `Mod+B` | Bold | `toggleBold()` |
| `Mod+I` | Italic | `toggleItalic()` |
| `Mod+U` | Underline | `toggleUnderline()` |
| `Mod+Shift+X` | Strikethrough | `toggleStrike()` |
| `Mod+E` | Inline Code | `toggleCode()` |
| `Mod+Shift+H` | Highlight | `toggleHighlight()` |
| `Mod+K` | Link | `openLinkDialog()` |
| `Mod+Shift+M` | Comment | `addComment()` |

#### Блочные операции

| Shortcut | Действие | Команда |
|----------|---------|---------|
| `/` | Открыть slash menu | `openSlashMenu()` |
| `Enter` | Новый блок | `splitBlock()` |
| `Shift+Enter` | Soft break (новая строка в блоке) | `insertHardBreak()` |
| `Backspace` | В начале блока — merge с предыдущим | `joinBackward()` |
| `Delete` | В конце блока — merge со следующим | `joinForward()` |
| `Tab` | Indent (в списках, code block) | `indent()` |
| `Shift+Tab` | Outdent | `outdent()` |
| `Mod+Shift+0` | Paragraph | `setBlock('paragraph')` |
| `Mod+Shift+1` | Heading 1 | `setBlock('heading', { level: 1 })` |
| `Mod+Shift+2` | Heading 2 | `setBlock('heading', { level: 2 })` |
| `Mod+Shift+3` | Heading 3 | `setBlock('heading', { level: 3 })` |
| `Mod+Shift+7` | Ordered List | `toggleOrderedList()` |
| `Mod+Shift+8` | Bullet List | `toggleBulletList()` |
| `Mod+Shift+9` | Blockquote | `toggleBlockquote()` |
| `Mod+Alt+C` | Code Block | `toggleCodeBlock()` |

#### Навигация

| Shortcut | Действие | Команда |
|----------|---------|---------|
| `Arrow Up/Down` | Перемещение между блоками | `moveCursor()` |
| `Mod+Home` | В начало документа | `moveTo('start')` |
| `Mod+End` | В конец документа | `moveTo('end')` |
| `Escape` | Выход из code block / закрыть меню | `exitNode()` / `closeMenu()` |
| `Alt+Arrow Up` | Переместить блок вверх | `moveBlockUp()` |
| `Alt+Arrow Down` | Переместить блок вниз | `moveBlockDown()` |
| `Mod+Shift+Arrow Up` | Выделить до начала блока | `selectToBlockStart()` |
| `Mod+Shift+Arrow Down` | Выделить до конца блока | `selectToBlockEnd()` |

#### History

| Shortcut | Действие | Команда |
|----------|---------|---------|
| `Mod+Z` | Undo | `undo()` |
| `Mod+Shift+Z` / `Mod+Y` | Redo | `redo()` |

#### Selection

| Shortcut | Действие | Команда |
|----------|---------|---------|
| `Mod+A` | Выделить весь контент блока / весь документ (двойное нажатие) | `selectAll()` |
| `Shift+Click` | Выделение диапазона | Selection extension |
| `Mod+D` | Выделить следующее вхождение слова | `selectNextOccurrence()` |

### Focus Management

```typescript
// packages/core/src/a11y/focus-manager.ts

export interface FocusManagerConfig {
  /** Tab order: toolbar → editor → footer */
  tabOrder: FocusRegion[];
  /** Trap focus в модальных окнах */
  trapFocus: boolean;
  /** Восстановить focus после закрытия меню */
  restoreFocus: boolean;
}

export type FocusRegion =
  | 'skip-nav'
  | 'toolbar'
  | 'editor'
  | 'slash-menu'
  | 'bubble-menu'
  | 'link-dialog'
  | 'footer';

export class FocusManager {
  private regions: Map<FocusRegion, HTMLElement> = new Map();
  private focusStack: HTMLElement[] = [];

  /** Регистрация региона */
  register(region: FocusRegion, element: HTMLElement): void {
    this.regions.set(region, element);
    element.setAttribute('data-gotipe-region', region);
  }

  /** Переключение focus на регион */
  focusRegion(region: FocusRegion): void {
    const el = this.regions.get(region);
    if (el) {
      this.focusStack.push(document.activeElement as HTMLElement);
      el.focus();
    }
  }

  /** Восстановление предыдущего focus */
  restoreFocus(): void {
    const prev = this.focusStack.pop();
    if (prev && prev.isConnected) {
      prev.focus();
    }
  }

  /** Focus trap для модальных окон */
  trapFocusIn(container: HTMLElement): () => void {
    const focusable = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handler);
    first?.focus();

    return () => container.removeEventListener('keydown', handler);
  }
}
```

### Tab Order

```html
<!-- Логичный tab order для editor -->
<a href="#gotipe-editor" class="gotipe-skip-nav">
  Skip to editor content
</a>

<div class="gotipe-toolbar" role="toolbar" aria-label="Formatting options">
  <!-- tabindex="0" на первом элементе, "-1" на остальных -->
  <!-- Arrow keys для навигации внутри toolbar -->
  <button tabindex="0" aria-label="Bold" aria-pressed="false">B</button>
  <button tabindex="-1" aria-label="Italic" aria-pressed="false">I</button>
  <button tabindex="-1" aria-label="Underline" aria-pressed="false">U</button>
</div>

<div
  id="gotipe-editor"
  role="textbox"
  aria-multiline="true"
  aria-label="Document editor"
  contenteditable="true"
  tabindex="0"
>
  <!-- Editor content -->
</div>
```

### Keyboard-only Editing Flow

Полный сценарий без мыши:

1. `Tab` — focus на toolbar
2. `Arrow Right/Left` — навигация по кнопкам toolbar
3. `Tab` — focus на editor
4. Ввод текста — paragraph автоматически
5. `/` — открытие slash menu (focus trap)
6. `Arrow Down` — навигация по элементам меню
7. `Enter` — выбор блока
8. `Escape` — закрыть меню, вернуть focus в editor
9. Выделить текст — `Shift+Arrow`
10. `Mod+B` — применить bold
11. `Alt+Arrow Down` — переместить блок вниз (keyboard DnD alternative)
12. `Tab` — focus на footer / следующий элемент

---

## 3. Screen Reader Support

### ARIA Roles и Attributes для Editor

```html
<!-- Основной editor container -->
<div
  role="application"
  aria-roledescription="rich text editor"
  aria-label="Document editor — My Document"
>
  <!-- Toolbar -->
  <div role="toolbar" aria-label="Text formatting" aria-orientation="horizontal">
    <div role="group" aria-label="Text style">
      <button role="button" aria-pressed="true" aria-label="Bold (Ctrl+B)">
        <strong>B</strong>
      </button>
      <button role="button" aria-pressed="false" aria-label="Italic (Ctrl+I)">
        <em>I</em>
      </button>
    </div>
    <div role="separator" aria-orientation="vertical"></div>
    <div role="group" aria-label="Block type">
      <button
        role="button"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-label="Block type: Paragraph"
      >
        Paragraph ▾
      </button>
    </div>
  </div>

  <!-- Editor area -->
  <div
    role="textbox"
    aria-multiline="true"
    aria-label="Document content"
    aria-describedby="gotipe-status"
    contenteditable="true"
  >
    <!-- Block content -->
  </div>

  <!-- Status bar (live region) -->
  <div id="gotipe-status" role="status" aria-live="polite" aria-atomic="true">
    Line 5, Column 12 — 3 collaborators editing
  </div>
</div>
```

### ARIA Attributes для каждого Block Type

| Block Type | ARIA Role | ARIA Attributes | Пример |
|-----------|-----------|-----------------|--------|
| `paragraph` | `paragraph` (неявный) | — | `<p>Text</p>` |
| `heading` | `heading` | `aria-level="1..6"` | `<h2 aria-level="2">Title</h2>` |
| `bulletList` | `list` | — | `<ul role="list">` |
| `orderedList` | `list` | — | `<ol role="list">` |
| `listItem` | `listitem` | `aria-checked` (для task list) | `<li role="listitem" aria-checked="false">` |
| `codeBlock` | `code` | `aria-label="Code block, language: javascript"` | `<pre><code aria-label="...">` |
| `blockquote` | `blockquote` | — | `<blockquote>` |
| `callout` | `note` | `aria-label="Info callout"` | `<aside role="note">` |
| `image` | `img` | `aria-label`, `alt` | `<img alt="..." />` |
| `table` | `table` | `aria-rowcount`, `aria-colcount` | `<table aria-rowcount="5">` |
| `tableCell` | `cell` | `aria-rowindex`, `aria-colindex` | `<td aria-colindex="2">` |
| `divider` | `separator` | — | `<hr role="separator" />` |
| `toggle` | `region` | `aria-expanded`, `aria-label` | `<details aria-expanded="true">` |
| `embed` | `figure` | `aria-label="Embedded content: YouTube"` | `<figure role="figure">` |
| `math` | `math` | `aria-label` (текстовое представление) | `<span role="math" aria-label="x squared">` |
| `file` | `link` | `aria-label="Attached file: report.pdf, 2.3 MB"` | `<a role="link">` |

### Live Regions для Collaboration

```typescript
// packages/core/src/a11y/announcer.ts

export class A11yAnnouncer {
  private liveRegion: HTMLElement;
  private logRegion: HTMLElement;

  constructor(container: HTMLElement) {
    // Polite announcements — не прерывают текущее чтение
    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('role', 'status');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.className = 'gotipe-sr-only';
    container.appendChild(this.liveRegion);

    // Log region — для collaboration events
    this.logRegion = document.createElement('div');
    this.logRegion.setAttribute('role', 'log');
    this.logRegion.setAttribute('aria-live', 'polite');
    this.logRegion.setAttribute('aria-relevant', 'additions');
    this.logRegion.className = 'gotipe-sr-only';
    container.appendChild(this.logRegion);
  }

  /** Объявить действие (block type change, formatting) */
  announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    this.liveRegion.setAttribute('aria-live', priority);
    // Clearing and re-setting заставляет screen reader перечитать
    this.liveRegion.textContent = '';
    requestAnimationFrame(() => {
      this.liveRegion.textContent = message;
    });
  }

  /** Добавить collaboration event в log */
  logCollabEvent(event: string): void {
    const entry = document.createElement('div');
    entry.textContent = event;
    this.logRegion.appendChild(entry);
    // Очистка старых записей
    while (this.logRegion.children.length > 20) {
      this.logRegion.removeChild(this.logRegion.firstChild!);
    }
  }
}
```

### Примеры announcement

```typescript
// Block type changes
announcer.announce('Changed to Heading level 2');
announcer.announce('Converted to bullet list');
announcer.announce('Inserted code block, language JavaScript');

// Mark announcements
announcer.announce('Bold applied');
announcer.announce('Link inserted: https://gotipe.com');
announcer.announce('Highlight removed');

// Collaboration
announcer.logCollabEvent('Alice started editing line 5');
announcer.logCollabEvent('Bob joined the document');
announcer.logCollabEvent('Charlie left the document');

// Error states
announcer.announce('Image upload failed: file too large', 'assertive');
announcer.announce('Connection lost. Changes saved locally.', 'assertive');
```

### Custom Block A11y

Extension API позволяет определять accessibility для custom blocks:

```typescript
// Пример: extension для custom block "poll"
import { defineExtension } from '@gotipe/core';

export const PollExtension = defineExtension({
  name: 'poll',

  nodes: [{
    name: 'poll',
    group: 'block',
    attrs: {
      question: { default: '' },
      options: { default: [] },
    },

    // A11y конфигурация для custom block
    accessibility: {
      role: 'group',
      label: (node) => `Poll: ${node.attrs.question}`,
      description: (node) =>
        `${node.attrs.options.length} options. Use arrow keys to navigate, Enter to vote.`,
      announceOnInsert: 'Poll block inserted. Type your question.',
      announceOnDelete: 'Poll block removed.',
      keyboardInstructions: 'Arrow Up/Down to navigate options. Enter to select. Escape to exit.',
    },
  }],
});
```

---

## 4. Focus Management

### Editor Focus

```typescript
// packages/core/src/a11y/editor-focus.ts

export interface EditorFocusState {
  /** Editor имеет focus */
  isFocused: boolean;
  /** Какой регион активен */
  activeRegion: FocusRegion | null;
  /** Позиция cursor (для screen reader) */
  cursorPosition: { line: number; column: number };
  /** Активный block type */
  activeBlockType: string | null;
}

export class EditorFocusController {
  private state: EditorFocusState = {
    isFocused: false,
    activeRegion: null,
    cursorPosition: { line: 0, column: 0 },
    activeBlockType: null,
  };

  onFocus(region: FocusRegion): void {
    this.state.isFocused = true;
    this.state.activeRegion = region;
    this.emit('focus', this.state);
  }

  onBlur(): void {
    this.state.isFocused = false;
    this.state.activeRegion = null;
    this.emit('blur', this.state);
  }

  /** Обновить screen reader при смене блока */
  onBlockChange(blockType: string, attrs: Record<string, unknown>): void {
    this.state.activeBlockType = blockType;
    // Объявить новый block type
    const label = this.getBlockLabel(blockType, attrs);
    this.announcer.announce(label);
  }

  private getBlockLabel(type: string, attrs: Record<string, unknown>): string {
    switch (type) {
      case 'heading':
        return `Heading level ${attrs.level}`;
      case 'codeBlock':
        return `Code block${attrs.language ? `, ${attrs.language}` : ''}`;
      case 'bulletList':
        return 'Bullet list';
      case 'orderedList':
        return 'Numbered list';
      case 'blockquote':
        return 'Block quote';
      case 'table':
        return 'Table';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }
}
```

### Menu Focus

#### Slash Menu

```typescript
// packages/core/src/menus/slash-menu-a11y.ts

export function SlashMenuA11y(props: {
  items: SlashMenuItem[];
  activeIndex: number;
  isOpen: boolean;
}) {
  return {
    role: 'listbox' as const,
    'aria-label': 'Block type menu',
    'aria-expanded': props.isOpen,
    'aria-activedescendant': props.isOpen
      ? `slash-item-${props.activeIndex}`
      : undefined,

    items: props.items.map((item, index) => ({
      id: `slash-item-${index}`,
      role: 'option' as const,
      'aria-selected': index === props.activeIndex,
      'aria-label': `${item.label}: ${item.description}`,
    })),
  };
}
```

React-реализация slash menu с focus management:

```tsx
// packages/react/src/components/SlashMenu.tsx
import { useRef, useEffect, useCallback } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useEditor } from '../hooks/useEditor';

export function SlashMenu({ items, isOpen, onSelect, onClose }: SlashMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const editor = useEditor();

  // Focus trap — Tab cycles внутри меню
  const releaseTrap = useFocusTrap(listRef, isOpen);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        onSelect(items[activeIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        // Focus возвращается в editor
        editor.focus();
        break;
    }
  }, [items, activeIndex, onSelect, onClose, editor]);

  // Announce при навигации
  useEffect(() => {
    if (isOpen && items[activeIndex]) {
      editor.a11y.announce(
        `${items[activeIndex].label}: ${items[activeIndex].description}`
      );
    }
  }, [activeIndex, isOpen]);

  if (!isOpen) return null;

  return (
    <ul
      ref={listRef}
      role="listbox"
      aria-label="Insert block"
      onKeyDown={handleKeyDown}
      className="gotipe-slash-menu"
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          id={`slash-item-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          onClick={() => onSelect(item)}
          className={index === activeIndex ? 'active' : ''}
        >
          <span className="gotipe-slash-menu__icon">{item.icon}</span>
          <div>
            <div className="gotipe-slash-menu__label">{item.label}</div>
            <div className="gotipe-slash-menu__desc">{item.description}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

#### Bubble Menu (Floating Toolbar)

```tsx
// packages/react/src/components/BubbleMenu.tsx

export function BubbleMenu({ isOpen, onClose }: BubbleMenuProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editor = useEditor();

  useEffect(() => {
    if (isOpen && toolbarRef.current) {
      // Focus на первый элемент
      const first = toolbarRef.current.querySelector<HTMLElement>('button');
      first?.focus();
    }
  }, [isOpen]);

  // roving tabindex — Arrow keys внутри toolbar
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const buttons = toolbarRef.current?.querySelectorAll<HTMLElement>('button');
    if (!buttons) return;
    const currentIndex = Array.from(buttons).indexOf(e.target as HTMLElement);

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        buttons[(currentIndex + 1) % buttons.length].focus();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        buttons[(currentIndex - 1 + buttons.length) % buttons.length].focus();
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        editor.focus();
        break;
    }
  }, [onClose, editor]);

  if (!isOpen) return null;

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Text formatting"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className="gotipe-bubble-menu"
    >
      <button
        tabIndex={0}
        aria-pressed={editor.isActive('bold')}
        aria-label="Bold"
        onClick={() => editor.chain().toggleBold().run()}
      >
        B
      </button>
      <button
        tabIndex={-1}
        aria-pressed={editor.isActive('italic')}
        aria-label="Italic"
        onClick={() => editor.chain().toggleItalic().run()}
      >
        I
      </button>
      {/* ... */}
    </div>
  );
}
```

### Dialog Focus Traps

```typescript
// packages/core/src/a11y/dialog.ts

export function createDialogA11y(dialogElement: HTMLElement, options: {
  title: string;
  onClose: () => void;
  returnFocusTo?: HTMLElement;
}): () => void {
  // Set ARIA attributes
  dialogElement.setAttribute('role', 'dialog');
  dialogElement.setAttribute('aria-modal', 'true');
  dialogElement.setAttribute('aria-label', options.title);

  // Save current focus
  const previouslyFocused = document.activeElement as HTMLElement;
  const returnTarget = options.returnFocusTo ?? previouslyFocused;

  // Focus trap
  const releaseTrap = trapFocusIn(dialogElement);

  // Escape to close
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      options.onClose();
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Cleanup function
  return () => {
    releaseTrap();
    document.removeEventListener('keydown', handleEscape);
    // Return focus
    if (returnTarget && returnTarget.isConnected) {
      returnTarget.focus();
    }
  };
}
```

### Skip Navigation

```html
<!-- Skip nav link — визуально скрыт, виден при focus -->
<a
  href="#gotipe-editor-content"
  class="gotipe-skip-nav"
  tabindex="0"
>
  Перейти к содержимому редактора
</a>

<style>
.gotipe-skip-nav {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 9999;
  padding: 8px 16px;
  background: var(--gotipe-color-primary);
  color: var(--gotipe-color-on-primary);
  text-decoration: none;
  font-weight: 600;
}

.gotipe-skip-nav:focus {
  left: 8px;
  top: 8px;
}
</style>
```

---

## 5. High Contrast & Visual Accessibility

### CSS Custom Properties

GoTipe использует CSS custom properties для полной кастомизации visual appearance:

```css
/* packages/core/src/styles/a11y-variables.css */

:root {
  /* === Цвета === */
  --gotipe-color-text: #1a1a1a;
  --gotipe-color-text-secondary: #666666;
  --gotipe-color-background: #ffffff;
  --gotipe-color-surface: #f5f5f5;
  --gotipe-color-border: #e0e0e0;
  --gotipe-color-primary: #2563eb;
  --gotipe-color-primary-hover: #1d4ed8;
  --gotipe-color-on-primary: #ffffff;
  --gotipe-color-error: #dc2626;
  --gotipe-color-success: #16a34a;

  /* === Focus === */
  --gotipe-focus-ring-color: #2563eb;
  --gotipe-focus-ring-width: 2px;
  --gotipe-focus-ring-offset: 2px;
  --gotipe-focus-ring-style: solid;

  /* === Selection === */
  --gotipe-selection-bg: #2563eb33;
  --gotipe-selection-text: inherit;
  --gotipe-collab-cursor-width: 2px;

  /* === Spacing === */
  --gotipe-block-gap: 0.5em;
  --gotipe-indent-size: 1.5em;

  /* === Typography === */
  --gotipe-font-family: system-ui, -apple-system, sans-serif;
  --gotipe-font-size-base: 16px;
  --gotipe-line-height: 1.6;

  /* === Animation === */
  --gotipe-transition-duration: 150ms;
  --gotipe-transition-easing: ease-in-out;
}
```

### Focus Indicators

```css
/* packages/core/src/styles/focus.css */

/* Видимый focus ring для всех интерактивных элементов */
.gotipe-editor *:focus-visible {
  outline: var(--gotipe-focus-ring-width) var(--gotipe-focus-ring-style) var(--gotipe-focus-ring-color);
  outline-offset: var(--gotipe-focus-ring-offset);
  border-radius: 2px;
}

/* Более заметный focus для toolbar buttons */
.gotipe-toolbar button:focus-visible {
  outline: var(--gotipe-focus-ring-width) var(--gotipe-focus-ring-style) var(--gotipe-focus-ring-color);
  outline-offset: var(--gotipe-focus-ring-offset);
  box-shadow: 0 0 0 calc(var(--gotipe-focus-ring-width) + var(--gotipe-focus-ring-offset))
    color-mix(in srgb, var(--gotipe-focus-ring-color) 25%, transparent);
}

/* Focus на editor area */
.gotipe-editor [role="textbox"]:focus-visible {
  outline: none; /* contenteditable имеет свой cursor */
  box-shadow: inset 0 0 0 2px var(--gotipe-focus-ring-color);
}

/* Block-level focus indicator (при keyboard навигации между блоками) */
.gotipe-block--focused {
  position: relative;
}

.gotipe-block--focused::before {
  content: '';
  position: absolute;
  inset-inline-start: -8px;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--gotipe-focus-ring-color);
  border-radius: 1.5px;
}
```

### Forced Colors (High Contrast Mode)

```css
/* packages/core/src/styles/high-contrast.css */

@media (forced-colors: active) {
  .gotipe-editor {
    /* В forced-colors mode цвета управляются системой */
    forced-color-adjust: none;
  }

  .gotipe-toolbar button {
    border: 1px solid ButtonText;
  }

  .gotipe-toolbar button:hover {
    background: Highlight;
    color: HighlightText;
  }

  .gotipe-toolbar button[aria-pressed="true"] {
    background: Highlight;
    color: HighlightText;
    border-color: Highlight;
  }

  .gotipe-toolbar button:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }

  /* Selection в high contrast mode */
  .gotipe-editor ::selection {
    background: Highlight;
    color: HighlightText;
  }

  /* Block focus indicator */
  .gotipe-block--focused::before {
    background-color: Highlight;
  }

  /* Collaboration cursor */
  .gotipe-collab-cursor {
    border-color: Highlight;
  }

  .gotipe-collab-cursor__label {
    background: Highlight;
    color: HighlightText;
  }

  /* Code block borders */
  .gotipe-code-block {
    border: 1px solid ButtonText;
  }

  /* Callout blocks */
  .gotipe-callout {
    border: 2px solid ButtonText;
  }

  /* Divider */
  .gotipe-divider hr {
    border-color: ButtonText;
  }

  /* Image без alt */
  .gotipe-image:not([alt]) {
    border: 2px dashed LinkText;
  }

  /* Link styling */
  .gotipe-editor a {
    color: LinkText;
    text-decoration: underline;
  }
}
```

### Contrast Ratios

| Элемент | Foreground | Background | Ratio | WCAG |
|---------|-----------|-----------|-------|------|
| Body text | `#1a1a1a` | `#ffffff` | 17.1:1 | AAA |
| Secondary text | `#666666` | `#ffffff` | 5.74:1 | AA |
| Placeholder text | `#9ca3af` | `#ffffff` | 3.0:1 | AA (large) |
| Toolbar button | `#1a1a1a` | `#f5f5f5` | 15.3:1 | AAA |
| Active button | `#ffffff` | `#2563eb` | 8.59:1 | AAA |
| Error text | `#dc2626` | `#ffffff` | 4.63:1 | AA |
| Link text | `#2563eb` | `#ffffff` | 4.62:1 | AA |
| Focus ring | `#2563eb` | `#ffffff` | 4.62:1 | AA (non-text 3:1) |
| Code block bg | `#1a1a1a` | `#f8f8f8` | 15.3:1 | AAA |

### Selection Styling

```css
/* Стилизация selection с учётом accessibility */
.gotipe-editor ::selection {
  background-color: var(--gotipe-selection-bg);
  color: var(--gotipe-selection-text);
}

/* Collaboration cursor colors — достаточный контраст с текстом */
.gotipe-collab-cursor {
  border-inline-start: var(--gotipe-collab-cursor-width) solid var(--cursor-color);
  position: relative;
}

.gotipe-collab-cursor__label {
  position: absolute;
  top: -1.5em;
  inset-inline-start: 0;
  background: var(--cursor-color);
  color: #ffffff; /* Гарантирован контраст >= 4.5:1 с любым cursor-color */
  font-size: 0.75rem;
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
  pointer-events: none;
}
```

---

## 6. Reduced Motion

### `prefers-reduced-motion`

```css
/* packages/core/src/styles/reduced-motion.css */

/* По умолчанию: анимации включены */
.gotipe-editor {
  --gotipe-transition-duration: 150ms;
}

/* Reduced motion: отключение всех необязательных анимаций */
@media (prefers-reduced-motion: reduce) {
  .gotipe-editor {
    --gotipe-transition-duration: 0ms;
  }

  /* Отключить transition на всех элементах */
  .gotipe-editor *,
  .gotipe-editor *::before,
  .gotipe-editor *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* Cursor blink — отключить */
  .gotipe-editor .gotipe-cursor {
    animation: none;
  }

  /* Collaboration cursor animations — отключить */
  .gotipe-collab-cursor {
    transition: none;
  }

  .gotipe-collab-cursor__label {
    animation: none;
    transition: none;
  }

  /* Slash menu appear — мгновенно */
  .gotipe-slash-menu {
    animation: none;
    opacity: 1;
    transform: none;
  }

  /* Bubble menu — мгновенно */
  .gotipe-bubble-menu {
    animation: none;
    opacity: 1;
    transform: none;
  }

  /* Drag-and-drop placeholder — без анимации */
  .gotipe-drop-indicator {
    animation: none;
  }

  /* Block transition при перемещении — мгновенно */
  .gotipe-block {
    transition: none;
  }

  /* Image loading skeleton — статичный placeholder */
  .gotipe-image-placeholder {
    animation: none;
    background: var(--gotipe-color-surface);
  }
}
```

### JavaScript Detection

```typescript
// packages/core/src/a11y/motion.ts

export function getPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function onMotionPreferenceChange(callback: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handler = (e: MediaQueryListEvent) => callback(e.matches);
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}

// Использование в editor:
const editor = createEditor({
  // ...
  a11y: {
    reducedMotion: 'auto', // 'auto' | 'always' | 'never'
  },
});
```

### Cursor Animation Control

```typescript
// packages/core/src/view/cursor.ts

export interface CursorConfig {
  /** Включить blink animation */
  blink: boolean;
  /** Smooth caret movement */
  smoothCaret: boolean;
  /** Collaboration cursor transition */
  collabCursorTransition: boolean;
}

export function getCursorConfig(reducedMotion: boolean): CursorConfig {
  if (reducedMotion) {
    return {
      blink: false,
      smoothCaret: false,
      collabCursorTransition: false,
    };
  }
  return {
    blink: true,
    smoothCaret: true,
    collabCursorTransition: true,
  };
}
```

---

## 7. i18n Architecture

### Locale System

```typescript
// packages/i18n/src/locale.ts

export interface GoTipeLocale {
  /** BCP 47 language tag */
  code: string;
  /** Направление текста */
  dir: 'ltr' | 'rtl';
  /** Название на своём языке */
  nativeName: string;
  /** Translations */
  messages: GoTipeMessages;
  /** Number formatting */
  numberFormat?: Intl.NumberFormatOptions;
  /** Date formatting */
  dateFormat?: Intl.DateTimeFormatOptions;
  /** Pluralization rules */
  pluralRule: (n: number) => PluralCategory;
}

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

// Полный набор translation keys
export interface GoTipeMessages {
  // === Editor ===
  'editor.label': string;
  'editor.placeholder': string;
  'editor.empty': string;

  // === Toolbar ===
  'toolbar.label': string;
  'toolbar.bold': string;
  'toolbar.italic': string;
  'toolbar.underline': string;
  'toolbar.strikethrough': string;
  'toolbar.code': string;
  'toolbar.highlight': string;
  'toolbar.link': string;
  'toolbar.link.url': string;
  'toolbar.link.text': string;
  'toolbar.link.open': string;
  'toolbar.link.remove': string;
  'toolbar.align.left': string;
  'toolbar.align.center': string;
  'toolbar.align.right': string;

  // === Block types ===
  'block.paragraph': string;
  'block.heading': string;
  'block.heading.level': string; // ICU: "Heading level {level}"
  'block.bulletList': string;
  'block.orderedList': string;
  'block.codeBlock': string;
  'block.codeBlock.language': string;
  'block.blockquote': string;
  'block.callout': string;
  'block.image': string;
  'block.image.alt': string;
  'block.image.caption': string;
  'block.table': string;
  'block.table.dimensions': string; // ICU: "{rows} rows, {cols} columns"
  'block.divider': string;
  'block.toggle': string;
  'block.embed': string;
  'block.math': string;
  'block.file': string;
  'block.file.size': string; // ICU: "{name}, {size}"

  // === Slash menu ===
  'slashMenu.label': string;
  'slashMenu.search': string;
  'slashMenu.noResults': string;
  'slashMenu.category.basic': string;
  'slashMenu.category.media': string;
  'slashMenu.category.advanced': string;

  // === Collaboration ===
  'collab.userJoined': string; // ICU: "{name} joined"
  'collab.userLeft': string;   // ICU: "{name} left"
  'collab.usersEditing': string; // ICU: "{count, plural, one {# user} other {# users}} editing"
  'collab.connectionLost': string;
  'collab.reconnecting': string;
  'collab.connected': string;

  // === History ===
  'history.undo': string;
  'history.redo': string;
  'history.noUndo': string;
  'history.noRedo': string;

  // === Errors ===
  'error.imageUpload': string;
  'error.fileTooLarge': string; // ICU: "File exceeds {maxSize}"
  'error.invalidFormat': string;

  // === A11y announcements ===
  'a11y.blockInserted': string;   // ICU: "{type} inserted"
  'a11y.blockDeleted': string;
  'a11y.blockMoved': string;      // ICU: "Block moved to position {position}"
  'a11y.markApplied': string;     // ICU: "{mark} applied"
  'a11y.markRemoved': string;
  'a11y.selectionChanged': string;
  'a11y.cursorPosition': string;  // ICU: "Line {line}, column {column}"
}
```

### Translation Keys — ICU MessageFormat

GoTipe использует [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) для сложных переводов с pluralization, gender, числовым форматированием:

```typescript
// packages/i18n/src/format.ts
import { IntlMessageFormat } from 'intl-messageformat';

export class MessageFormatter {
  private cache = new Map<string, IntlMessageFormat>();

  constructor(private locale: string) {}

  format(pattern: string, values?: Record<string, unknown>): string {
    let fmt = this.cache.get(pattern);
    if (!fmt) {
      fmt = new IntlMessageFormat(pattern, this.locale);
      this.cache.set(pattern, fmt);
    }
    return fmt.format(values) as string;
  }
}

// Пример использования:
const fmt = new MessageFormatter('ru');

// Pluralization
fmt.format(
  '{count, plural, =0 {Нет пользователей} one {# пользователь} few {# пользователя} many {# пользователей} other {# пользователей}}',
  { count: 3 }
);
// → "3 пользователя"

// Number formatting
fmt.format(
  'Размер файла: {size, number, ::compact-short}',
  { size: 2048576 }
);
// → "Размер файла: 2 М"
```

### Примеры локализаций

```typescript
// packages/i18n/src/locales/ru.ts

import type { GoTipeLocale } from '../locale';

export const ru: GoTipeLocale = {
  code: 'ru',
  dir: 'ltr',
  nativeName: 'Русский',
  pluralRule: (n) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'one';
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'few';
    if (mod10 === 0 || (mod10 >= 5 && mod10 <= 9) || (mod100 >= 11 && mod100 <= 14)) return 'many';
    return 'other';
  },
  messages: {
    'editor.label': 'Текстовый редактор',
    'editor.placeholder': 'Начните вводить текст или нажмите / для вставки блока...',
    'editor.empty': 'Пустой документ',

    'toolbar.label': 'Панель форматирования',
    'toolbar.bold': 'Жирный',
    'toolbar.italic': 'Курсив',
    'toolbar.underline': 'Подчёркнутый',
    'toolbar.strikethrough': 'Зачёркнутый',
    'toolbar.code': 'Код',
    'toolbar.highlight': 'Выделение',
    'toolbar.link': 'Ссылка',
    'toolbar.link.url': 'URL ссылки',
    'toolbar.link.text': 'Текст ссылки',
    'toolbar.link.open': 'Открыть ссылку',
    'toolbar.link.remove': 'Удалить ссылку',
    'toolbar.align.left': 'По левому краю',
    'toolbar.align.center': 'По центру',
    'toolbar.align.right': 'По правому краю',

    'block.paragraph': 'Параграф',
    'block.heading': 'Заголовок',
    'block.heading.level': 'Заголовок уровня {level}',
    'block.bulletList': 'Маркированный список',
    'block.orderedList': 'Нумерованный список',
    'block.codeBlock': 'Блок кода',
    'block.codeBlock.language': 'Язык: {language}',
    'block.blockquote': 'Цитата',
    'block.callout': 'Выноска',
    'block.image': 'Изображение',
    'block.image.alt': 'Альтернативный текст',
    'block.image.caption': 'Подпись',
    'block.table': 'Таблица',
    'block.table.dimensions': '{rows, plural, one {# строка} few {# строки} many {# строк} other {# строк}}, {cols, plural, one {# столбец} few {# столбца} many {# столбцов} other {# столбцов}}',
    'block.divider': 'Разделитель',
    'block.toggle': 'Раскрывающийся блок',
    'block.embed': 'Встроенный контент',
    'block.math': 'Формула',
    'block.file': 'Файл',
    'block.file.size': '{name}, {size}',

    'slashMenu.label': 'Меню вставки блоков',
    'slashMenu.search': 'Поиск блока...',
    'slashMenu.noResults': 'Ничего не найдено',
    'slashMenu.category.basic': 'Основные',
    'slashMenu.category.media': 'Медиа',
    'slashMenu.category.advanced': 'Дополнительные',

    'collab.userJoined': '{name} присоединился',
    'collab.userLeft': '{name} вышел',
    'collab.usersEditing': '{count, plural, one {# пользователь редактирует} few {# пользователя редактируют} many {# пользователей редактируют} other {# пользователей редактируют}}',
    'collab.connectionLost': 'Соединение потеряно',
    'collab.reconnecting': 'Переподключение...',
    'collab.connected': 'Подключено',

    'history.undo': 'Отменить',
    'history.redo': 'Повторить',
    'history.noUndo': 'Нечего отменять',
    'history.noRedo': 'Нечего повторять',

    'error.imageUpload': 'Ошибка загрузки изображения',
    'error.fileTooLarge': 'Файл превышает {maxSize}',
    'error.invalidFormat': 'Неподдерживаемый формат',

    'a11y.blockInserted': '{type} вставлен',
    'a11y.blockDeleted': 'Блок удалён',
    'a11y.blockMoved': 'Блок перемещён на позицию {position}',
    'a11y.markApplied': '{mark} применён',
    'a11y.markRemoved': '{mark} убран',
    'a11y.selectionChanged': 'Выделение изменено',
    'a11y.cursorPosition': 'Строка {line}, столбец {column}',
  },
};
```

```typescript
// packages/i18n/src/locales/en.ts (фрагмент)

export const en: GoTipeLocale = {
  code: 'en',
  dir: 'ltr',
  nativeName: 'English',
  pluralRule: (n) => n === 1 ? 'one' : 'other',
  messages: {
    'editor.label': 'Text editor',
    'editor.placeholder': 'Start typing or press / to insert a block...',
    'editor.empty': 'Empty document',
    'toolbar.label': 'Formatting toolbar',
    'toolbar.bold': 'Bold',
    // ...
    'collab.usersEditing': '{count, plural, one {# user editing} other {# users editing}}',
    // ...
  },
};
```

### Подключение i18n

```typescript
// Использование в editor
import { createEditor } from '@gotipe/core';
import { ru } from '@gotipe/i18n/locales/ru';

const editor = createEditor({
  locale: ru,
  // Или динамическая загрузка:
  // locale: () => import(`@gotipe/i18n/locales/${navigator.language.split('-')[0]}`),
});

// Смена локали в runtime
editor.setLocale(en);
```

```tsx
// React: через Provider
import { GoTipeProvider, useGoTipe } from '@gotipe/react';
import { ru } from '@gotipe/i18n/locales/ru';

function App() {
  return (
    <GoTipeProvider locale={ru}>
      <Editor />
    </GoTipeProvider>
  );
}

// Использование внутри компонентов
function StatusBar() {
  const { t, formatNumber } = useGoTipe();

  return (
    <div role="status" aria-live="polite">
      {t('a11y.cursorPosition', { line: 5, column: 12 })}
      {' — '}
      {t('collab.usersEditing', { count: 3 })}
    </div>
  );
}
```

---

## 8. RTL/BiDi Support

### CSS Logical Properties

GoTipe использует CSS logical properties вместо physical (left/right/top/bottom) для автоматической поддержки RTL:

```css
/* packages/core/src/styles/logical.css */

/* Использовать logical properties вместо physical */
.gotipe-block {
  /* Вместо: margin-left: 1.5em; */
  margin-inline-start: var(--gotipe-indent-size);
  /* Вместо: padding-left: 8px; padding-right: 8px; */
  padding-inline: 8px;
  /* Вместо: text-align: left; */
  text-align: start;
  /* Вместо: border-left: 3px solid; */
  border-inline-start: 3px solid;
}

/* Blockquote */
.gotipe-blockquote {
  border-inline-start: 4px solid var(--gotipe-color-border);
  padding-inline-start: 1em;
  margin-inline-start: 0;
  margin-inline-end: 0;
}

/* Code block line numbers */
.gotipe-code-block__line-number {
  padding-inline-end: 1em;
  text-align: end;
  user-select: none;
}

/* Callout */
.gotipe-callout {
  padding-inline-start: 1em;
  border-inline-start: 4px solid var(--gotipe-callout-border);
}

/* Table cell alignment */
.gotipe-table-cell[data-align="start"] {
  text-align: start;
}

.gotipe-table-cell[data-align="end"] {
  text-align: end;
}

/* List markers */
.gotipe-bullet-list {
  padding-inline-start: 1.5em;
}

.gotipe-ordered-list {
  padding-inline-start: 1.5em;
}

/* Toolbar layout */
.gotipe-toolbar {
  display: flex;
  flex-direction: row;
  /* В RTL — автоматически reverse */
}

/* Block drag handle */
.gotipe-block__drag-handle {
  position: absolute;
  inset-inline-start: -28px;
  top: 4px;
}

/* Focus indicator */
.gotipe-block--focused::before {
  inset-inline-start: -8px;
}
```

### `dir="auto"` Detection

```typescript
// packages/core/src/i18n/bidi.ts

/**
 * Определение направления текста на уровне блока.
 * Использует Unicode BiDi algorithm (UAX #9).
 */
export function detectTextDirection(text: string): 'ltr' | 'rtl' {
  // Первый "strong" Unicode character определяет направление
  const rtlRegex = /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  const ltrRegex = /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF\u200E\u2C00-\uFB1C\uFE00-\uFE6F\uFEFF\uFF00-\uFFEF]/;

  for (const char of text) {
    if (rtlRegex.test(char)) return 'rtl';
    if (ltrRegex.test(char)) return 'ltr';
  }
  // Default: inherit от document
  return document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
}

/**
 * Установка dir на уровне блока для mixed content.
 */
export function applyBlockDirection(
  blockElement: HTMLElement,
  content: string,
  documentDir: 'ltr' | 'rtl'
): void {
  const blockDir = detectTextDirection(content);

  if (blockDir !== documentDir) {
    blockElement.setAttribute('dir', blockDir);
  } else {
    blockElement.removeAttribute('dir');
  }
}
```

### Mixed LTR/RTL Content

```html
<!-- Документ на арабском с вставками английского кода -->
<div dir="rtl" lang="ar" class="gotipe-editor">
  <!-- RTL paragraph -->
  <p dir="rtl">هذا هو محرر النصوص GoTipe مع دعم كامل للغة العربية.</p>

  <!-- Code block — всегда LTR -->
  <pre dir="ltr" lang="en"><code>const editor = createEditor({ dir: 'rtl' });</code></pre>

  <!-- Mixed paragraph: арабский + английские термины -->
  <p dir="rtl">
    استخدم
    <bdi dir="ltr"><code>editor.chain().toggleBold().run()</code></bdi>
    لتطبيق النص العريض.
  </p>
</div>
```

### Cursor Movement в RTL

```typescript
// packages/core/src/input/cursor-rtl.ts

export interface BiDiCursorBehavior {
  /**
   * Visual movement: Arrow Right всегда двигает cursor вправо визуально,
   * независимо от направления текста.
   */
  visual: boolean;

  /**
   * Logical movement: Arrow Right двигает cursor "вперёд" по тексту.
   * В RTL-тексте это визуально влево.
   */
  logical: boolean;
}

/**
 * GoTipe по умолчанию использует visual cursor movement,
 * что соответствует поведению Notion и Google Docs.
 * Пользователь может переключить на logical через настройки.
 */
export const defaultBiDiCursorBehavior: BiDiCursorBehavior = {
  visual: true,
  logical: false,
};
```

### Полная RTL-конфигурация

```typescript
const editor = createEditor({
  dir: 'rtl',
  locale: ar, // Арабская локаль

  bidi: {
    /** Автоматическое определение направления для каждого блока */
    autoDetect: true,
    /** Code blocks всегда LTR */
    codeBlockDir: 'ltr',
    /** Cursor movement mode */
    cursorMovement: 'visual',
  },
});
```

---

## 9. IME Support

### Обзор

IME (Input Method Editor) — критически важная функция для ввода CJK (Chinese, Japanese, Korean) символов. GoTipe полностью поддерживает composition events и корректно синхронизирует WASM state во время composition.

```
┌──────────────────────────────────────────────────────────────┐
│                   IME Composition Flow                        │
│                                                              │
│  User types "nihon" (Japanese)                               │
│                                                              │
│  ┌─────────┐   compositionstart    ┌──────────────────────┐ │
│  │ Keyboard │ ──────────────────►  │ Browser IME          │ │
│  └─────────┘                       │                      │ │
│                                    │  に → にほ → にほん  │ │
│                compositionupdate   │  (composition text)   │ │
│               ◄────────────────── │                      │ │
│                                    │  日本 ← candidate    │ │
│                compositionend      │     selected         │ │
│               ◄────────────────── └──────────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ GoTipe Core (WASM)                                      │ │
│  │                                                         │ │
│  │  compositionstart → lock document state                 │ │
│  │  compositionupdate → render preview only (no WASM sync) │ │
│  │  compositionend → apply final text to WASM state        │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Composition Events Handling

```typescript
// packages/core/src/input/ime-handler.ts

export class IMEHandler {
  private isComposing = false;
  private compositionText = '';
  private compositionAnchor: CursorPosition | null = null;

  constructor(
    private editorElement: HTMLElement,
    private wasmCore: GoTipeWasmCore,
    private announcer: A11yAnnouncer,
  ) {
    this.bind();
  }

  private bind(): void {
    this.editorElement.addEventListener('compositionstart', this.onCompositionStart);
    this.editorElement.addEventListener('compositionupdate', this.onCompositionUpdate);
    this.editorElement.addEventListener('compositionend', this.onCompositionEnd);
  }

  private onCompositionStart = (e: CompositionEvent): void => {
    this.isComposing = true;
    this.compositionAnchor = this.wasmCore.getCursorPosition();

    // Заблокировать WASM state updates во время composition
    this.wasmCore.lockState();

    // Отключить history snapshots
    this.wasmCore.pauseHistory();

    this.announcer.announce('IME composition started', 'polite');
  };

  private onCompositionUpdate = (e: CompositionEvent): void => {
    if (!this.isComposing) return;
    this.compositionText = e.data;

    // Визуальный preview — render composition text в DOM,
    // НЕ отправлять в WASM core
    this.renderCompositionPreview(this.compositionText);
  };

  private onCompositionEnd = (e: CompositionEvent): void => {
    if (!this.isComposing) return;
    this.isComposing = false;

    const finalText = e.data;

    // Убрать preview
    this.clearCompositionPreview();

    // Разблокировать WASM state
    this.wasmCore.unlockState();

    // Применить финальный текст к WASM state
    if (this.compositionAnchor && finalText) {
      this.wasmCore.insertText(this.compositionAnchor, finalText);
    }

    // Возобновить history
    this.wasmCore.resumeHistory();

    // Reset
    this.compositionText = '';
    this.compositionAnchor = null;
  };

  /** Проверка: идёт ли composition сейчас */
  get composing(): boolean {
    return this.isComposing;
  }

  private renderCompositionPreview(text: string): void {
    // Специальный DOM-only rendering для composition text
    // с подчёркиванием (стандартный IME visual feedback)
    const preview = this.editorElement.querySelector('.gotipe-composition-preview');
    if (preview) {
      preview.textContent = text;
    }
  }

  private clearCompositionPreview(): void {
    const preview = this.editorElement.querySelector('.gotipe-composition-preview');
    if (preview) {
      preview.remove();
    }
  }
}
```

### WASM State Sync During Composition

```typescript
// packages/core/src/wasm/state-lock.ts

/**
 * Во время IME composition, WASM state заморожен.
 * Все изменения буферизируются и применяются после compositionend.
 *
 * Это критически важно:
 * 1. Если обновлять WASM state на каждый compositionupdate,
 *    browser потеряет IME candidate window positioning.
 * 2. Intermediate composition text не должен попадать в CRDT history.
 * 3. Collaboration updates от других пользователей буферизируются
 *    и применяются после compositionend.
 */
export class WasmStateLock {
  private locked = false;
  private pendingUpdates: Transaction[] = [];

  lock(): void {
    this.locked = true;
  }

  unlock(): Transaction[] {
    this.locked = false;
    const updates = [...this.pendingUpdates];
    this.pendingUpdates = [];
    return updates;
  }

  /** Буферизировать update, если state заблокирован */
  tryApply(transaction: Transaction): boolean {
    if (this.locked) {
      this.pendingUpdates.push(transaction);
      return false; // Не применено сейчас
    }
    return true; // Можно применять
  }

  get isLocked(): boolean {
    return this.locked;
  }
}
```

### Candidate Window Positioning

```css
/* IME candidate window positioning */
.gotipe-editor [contenteditable="true"] {
  /* Не устанавливать transform на contenteditable —
     это ломает positioning IME candidate window в Chrome */
  transform: none;
}

/* Composition preview styling */
.gotipe-composition-preview {
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}
```

### Тестирование IME

| Язык | Input Method | Browser | Ожидаемое поведение |
|------|-------------|---------|---------------------|
| Japanese | Hiragana → Kanji | Chrome | Candidate window под cursor, correct insertion |
| Chinese (Simplified) | Pinyin → Hanzi | Chrome/Firefox | Composition preview, candidate selection |
| Chinese (Traditional) | Zhuyin (Bopomofo) | Safari | Correct positioning, no duplicate input |
| Korean | Hangul 2-beolsik | Chrome | Syllable composition, backspace during composition |
| Vietnamese | Telex | Firefox | Tone marks applied correctly |
| Thai | — | Chrome | Correct cluster handling |

---

## 10. Mobile / Touch Accessibility

### Touch Drag-and-Drop

```typescript
// packages/core/src/input/touch-dnd.ts

export interface TouchDnDConfig {
  /** Задержка перед началом drag (ms) */
  longPressDelay: number;
  /** Минимальное расстояние для начала drag (px) */
  dragThreshold: number;
  /** Haptic feedback (если поддерживается) */
  hapticFeedback: boolean;
}

export const defaultTouchDnDConfig: TouchDnDConfig = {
  longPressDelay: 500,
  dragThreshold: 10,
  hapticFeedback: true,
};

/**
 * Touch DnD flow:
 * 1. Long press (500ms) на block → активация drag mode
 * 2. Haptic feedback (navigator.vibrate)
 * 3. Block визуально "поднимается" (scale + shadow)
 * 4. Перемещение пальцем → drop indicator показывает позицию
 * 5. Отпускание → block перемещается
 */
export class TouchDragAndDrop {
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private isDragging = false;

  constructor(
    private container: HTMLElement,
    private config: TouchDnDConfig,
  ) {
    this.bind();
  }

  private bind(): void {
    this.container.addEventListener('touchstart', this.onTouchStart, { passive: false });
    this.container.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.container.addEventListener('touchend', this.onTouchEnd);
    this.container.addEventListener('touchcancel', this.onTouchCancel);
  }

  private onTouchStart = (e: TouchEvent): void => {
    const block = (e.target as HTMLElement).closest('[data-block-id]');
    if (!block) return;

    this.longPressTimer = setTimeout(() => {
      this.isDragging = true;
      this.startDrag(block as HTMLElement, e.touches[0]);

      // Haptic feedback
      if (this.config.hapticFeedback && navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, this.config.longPressDelay);
  };

  // ... touchmove, touchend handlers
}
```

### Responsive Toolbar

```css
/* packages/core/src/styles/mobile.css */

/* Mobile toolbar: sticky bottom на маленьких экранах */
@media (max-width: 768px) {
  .gotipe-toolbar {
    position: fixed;
    inset-inline-start: 0;
    inset-inline-end: 0;
    bottom: 0;
    z-index: 100;
    background: var(--gotipe-color-background);
    border-top: 1px solid var(--gotipe-color-border);
    padding: 8px;
    padding-bottom: calc(8px + env(safe-area-inset-bottom));
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .gotipe-toolbar button {
    min-width: 44px;
    min-height: 44px; /* WCAG 2.5.5 Target Size */
  }

  /* Slash menu — full width sheet */
  .gotipe-slash-menu {
    position: fixed;
    inset-inline-start: 0;
    inset-inline-end: 0;
    bottom: 0;
    max-height: 50vh;
    border-radius: 12px 12px 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  /* Bubble menu — positioned above selection, не обрезается */
  .gotipe-bubble-menu {
    max-width: calc(100vw - 16px);
    overflow-x: auto;
  }
}

/* Editor content area — safe area padding */
.gotipe-editor {
  padding-inline-start: max(16px, env(safe-area-inset-left));
  padding-inline-end: max(16px, env(safe-area-inset-right));
}
```

### Virtual Keyboard Handling

```typescript
// packages/core/src/input/virtual-keyboard.ts

export class VirtualKeyboardManager {
  private viewportHeight: number;
  private isKeyboardOpen = false;

  constructor(private editorElement: HTMLElement) {
    this.viewportHeight = window.innerHeight;
    this.bind();
  }

  private bind(): void {
    // Visual Viewport API — более надёжный способ detect virtual keyboard
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.onViewportResize);
    } else {
      // Fallback для старых браузеров
      window.addEventListener('resize', this.onWindowResize);
    }
  }

  private onViewportResize = (): void => {
    const currentHeight = window.visualViewport!.height;
    const keyboardOpen = currentHeight < this.viewportHeight * 0.75;

    if (keyboardOpen !== this.isKeyboardOpen) {
      this.isKeyboardOpen = keyboardOpen;
      this.onKeyboardStateChange(keyboardOpen);
    }
  };

  private onKeyboardStateChange(isOpen: boolean): void {
    if (isOpen) {
      // Scroll cursor into view when keyboard opens
      this.scrollCursorIntoView();
      // Adjust toolbar position
      this.editorElement.classList.add('gotipe-keyboard-open');
    } else {
      this.editorElement.classList.remove('gotipe-keyboard-open');
    }
  }

  private scrollCursorIntoView(): void {
    const cursor = this.editorElement.querySelector('.gotipe-cursor');
    if (cursor) {
      cursor.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}
```

### Viewport Meta и Safe Area

```html
<!-- Рекомендуемый viewport meta для приложений с GoTipe -->
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
/>
```

```css
/* Safe area insets для iPhone/iPad с notch */
.gotipe-editor-container {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-inline-start: env(safe-area-inset-left);
  padding-inline-end: env(safe-area-inset-right);
}
```

### Gesture Support

| Gesture | Действие | A11y Alternative |
|---------|---------|------------------|
| Tap | Place cursor | Focus event |
| Double tap | Select word | `Mod+D` |
| Triple tap | Select paragraph | `Mod+A` |
| Long press | Context menu / drag | Right-click |
| Pinch | Zoom (browser native) | `Mod++` / `Mod+-` |
| Two-finger swipe | Undo/Redo (iOS) | `Mod+Z` / `Mod+Shift+Z` |
| Swipe on block handle | Delete block (swipe left) | `Backspace` |

---

## 11. Browser Compatibility

### Support Matrix

| Feature | Chrome 90+ | Firefox 90+ | Safari 15+ | Edge 90+ |
|---------|-----------|-------------|-----------|---------|
| `contenteditable` | Full | Full | Full | Full |
| `beforeinput` event | Full | Full | Full | Full |
| `compositionstart/end` | Full | Full | Full | Full |
| `Selection` API | Full | Full | Full | Full |
| `ClipboardItem` API | Full | Full | 15.4+ | Full |
| `visualViewport` API | Full | Full | 15+ | Full |
| CSS `inset-inline-*` | Full | Full | 15+ | Full |
| CSS `:focus-visible` | Full | Full | 15.4+ | Full |
| CSS `forced-colors` | Full | 89+ | No | Full |
| CSS `prefers-reduced-motion` | Full | Full | Full | Full |
| CSS `env(safe-area-*)` | Full | Full | Full | Full |
| WASM SIMD | Full | Full | 16.4+ | Full |
| `Intl.Segmenter` | Full | No* | Full | Full |
| `element.scrollIntoView({ behavior })` | Full | Full | 15.4+ | Full |
| Drag and Drop API | Full | Full | Full | Full |
| Touch Events | Full | Full | Full | Full |
| `navigator.vibrate` | Full | Full | No | Full |
| `ResizeObserver` | Full | Full | Full | Full |

\* `Intl.Segmenter` — Firefox не поддерживает нативно. GoTipe использует polyfill.

### Graceful Degradation

```typescript
// packages/core/src/compat/feature-detection.ts

export interface BrowserCapabilities {
  beforeInputEvent: boolean;
  clipboardAPI: boolean;
  visualViewport: boolean;
  focusVisible: boolean;
  forcedColors: boolean;
  intlSegmenter: boolean;
  wasmSimd: boolean;
  vibrate: boolean;
  cssLogicalProperties: boolean;
  viewTransitions: boolean;
}

export function detectCapabilities(): BrowserCapabilities {
  return {
    beforeInputEvent: typeof InputEvent !== 'undefined' &&
      'inputType' in new Event('input'),
    clipboardAPI: typeof ClipboardItem !== 'undefined',
    visualViewport: 'visualViewport' in window,
    focusVisible: CSS.supports('selector(:focus-visible)'),
    forcedColors: window.matchMedia('(forced-colors: active)').media !== 'not all',
    intlSegmenter: typeof Intl !== 'undefined' && 'Segmenter' in Intl,
    wasmSimd: (() => {
      try {
        return WebAssembly.validate(new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3,
          2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
        ]));
      } catch { return false; }
    })(),
    vibrate: 'vibrate' in navigator,
    cssLogicalProperties: CSS.supports('margin-inline-start', '0'),
    viewTransitions: 'startViewTransition' in document,
  };
}
```

### Feature Fallbacks

```typescript
// packages/core/src/compat/fallbacks.ts

/**
 * Fallback-стратегии для неподдерживаемых features.
 */
export function applyFallbacks(capabilities: BrowserCapabilities): void {
  // Intl.Segmenter fallback для Firefox
  if (!capabilities.intlSegmenter) {
    // Используем simple word boundary detection
    // вместо Unicode-aware segmentation
    console.info(
      'GoTipe: Intl.Segmenter not available. ' +
      'Using fallback word boundary detection.'
    );
  }

  // :focus-visible fallback
  if (!capabilities.focusVisible) {
    // Добавить polyfill class
    document.documentElement.classList.add('gotipe-no-focus-visible');
  }

  // ClipboardItem fallback
  if (!capabilities.clipboardAPI) {
    // Использовать deprecated document.execCommand('copy')
    // для copy/paste operations
  }

  // WASM SIMD fallback
  if (!capabilities.wasmSimd) {
    // Загрузить non-SIMD WASM bundle (немного медленнее)
    console.info(
      'GoTipe: WASM SIMD not available. ' +
      'Using scalar fallback (~20% slower on large documents).'
    );
  }

  // forced-colors fallback (Safari)
  if (!capabilities.forcedColors) {
    // High contrast detection через альтернативный метод
    // Проверяем background color computed style
    const test = document.createElement('div');
    test.style.backgroundColor = 'Canvas';
    document.body.appendChild(test);
    const bg = getComputedStyle(test).backgroundColor;
    document.body.removeChild(test);
    // Если Canvas !== white/transparent → вероятно high contrast
  }
}
```

### CSS Fallbacks

```css
/* :focus-visible fallback */
.gotipe-no-focus-visible .gotipe-editor *:focus {
  outline: 2px solid var(--gotipe-focus-ring-color);
  outline-offset: 2px;
}

/* CSS logical properties fallback (маловероятно для target browsers, но safe) */
@supports not (margin-inline-start: 0) {
  [dir="ltr"] .gotipe-blockquote {
    border-left: 4px solid var(--gotipe-color-border);
    padding-left: 1em;
  }
  [dir="rtl"] .gotipe-blockquote {
    border-right: 4px solid var(--gotipe-color-border);
    padding-right: 1em;
  }
}
```

---

## 12. Testing

### A11y Testing Tools

#### axe-core Integration

```typescript
// packages/testing/src/a11y/axe-integration.ts

import { configureAxe, toHaveNoViolations } from 'jest-axe';
import { render } from '@testing-library/react';

// Расширить Jest expect
expect.extend(toHaveNoViolations);

// Конфигурация axe для rich text editor
const axe = configureAxe({
  rules: {
    // Disable правила, которые конфликтуют с contenteditable
    'aria-allowed-attr': { enabled: true },
    'color-contrast': { enabled: true },
    'focus-order': { enabled: true },
    'keyboard-access': { enabled: true },
    'label': { enabled: true },
    'landmark-unique': { enabled: true },
    // contenteditable divs не должны быть flagged как missing form labels
    'region': { enabled: false },
  },
  // Проверять только editor region
  include: ['.gotipe-editor'],
});

// Пример теста
describe('GoTipe Editor A11y', () => {
  it('should have no accessibility violations on empty editor', async () => {
    const { container } = render(<GoTipeEditor />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have no violations with toolbar open', async () => {
    const { container } = render(<GoTipeEditor showToolbar />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have no violations with slash menu open', async () => {
    const { container } = render(<GoTipeEditor />);
    // Type "/" to open slash menu
    await userEvent.type(container.querySelector('[contenteditable]')!, '/');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have proper heading hierarchy', async () => {
    const { container } = render(
      <GoTipeEditor
        initialContent={[
          { type: 'heading', attrs: { level: 1 }, content: 'Title' },
          { type: 'heading', attrs: { level: 3 }, content: 'Skipped H2' },
        ]}
      />
    );
    // axe поймает skipped heading level
    const results = await axe(container);
    // Предупреждение о пропущенном heading level
    expect(results.violations.find(v => v.id === 'heading-order')).toBeDefined();
  });
});
```

#### pa11y Integration

```typescript
// packages/testing/src/a11y/pa11y-config.ts

export const pa11yConfig = {
  standard: 'WCAG2AA',
  // URL для тестирования (Storybook или dev server)
  defaults: {
    timeout: 30000,
    wait: 1000,
    chromeLaunchConfig: {
      args: ['--no-sandbox'],
    },
  },
  // Страницы для тестирования
  urls: [
    {
      url: 'http://localhost:6006/iframe.html?id=editor--empty',
      label: 'Empty editor',
    },
    {
      url: 'http://localhost:6006/iframe.html?id=editor--with-content',
      label: 'Editor with content',
    },
    {
      url: 'http://localhost:6006/iframe.html?id=editor--with-toolbar',
      label: 'Editor with toolbar',
    },
    {
      url: 'http://localhost:6006/iframe.html?id=editor--rtl',
      label: 'RTL editor',
    },
    {
      url: 'http://localhost:6006/iframe.html?id=editor--high-contrast',
      label: 'High contrast mode',
    },
  ],
  // Ignore правила, специфичные для contenteditable
  ignore: [
    'WCAG2AA.Principle1.Guideline1_3.1_3_1.H49.AlignAttr', // contenteditable alignment
  ],
};
```

### CI Integration

```yaml
# .github/workflows/a11y.yml

name: Accessibility Testing

on:
  pull_request:
    paths:
      - 'packages/core/src/**'
      - 'packages/react/src/**'
      - 'packages/core/src/styles/**'

jobs:
  axe-core:
    name: axe-core WCAG 2.1 AA
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @gotipe/testing test:a11y
        env:
          CI: true

  pa11y:
    name: pa11y WCAG 2.1 AA
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @gotipe/storybook build-storybook
      - run: npx http-server storybook-static -p 6006 &
      - run: pnpm --filter @gotipe/testing test:pa11y

  lighthouse-a11y:
    name: Lighthouse A11y Score
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @gotipe/storybook build-storybook
      - name: Run Lighthouse
        uses: treosh/lighthouse-ci-action@v12
        with:
          configPath: .lighthouserc.json
          urls: |
            http://localhost:6006/iframe.html?id=editor--default
      - name: Assert a11y score >= 95
        run: |
          score=$(jq '.categories.accessibility.score' lighthouse-results.json)
          if (( $(echo "$score < 0.95" | bc -l) )); then
            echo "A11y score $score is below 95%"
            exit 1
          fi
```

### Manual Testing Checklist

| # | Тест | Ожидаемый результат | Пройден |
|---|------|---------------------|---------|
| 1 | Tab через все интерактивные элементы | Focus переходит в логичном порядке | [ ] |
| 2 | Shift+Tab — обратный порядок | Focus идёт в обратном направлении | [ ] |
| 3 | Focus visible на каждом элементе | Видимый focus indicator | [ ] |
| 4 | Escape из slash menu | Focus возвращается в editor | [ ] |
| 5 | Escape из link dialog | Focus возвращается в editor | [ ] |
| 6 | Tab в slash menu | Focus остаётся в меню (trap) | [ ] |
| 7 | Keyboard-only создание и форматирование текста | Весь workflow без мыши | [ ] |
| 8 | Alt+Arrow для перемещения блоков | Block moves up/down | [ ] |
| 9 | Screen reader прочитывает block types | "Heading level 2", "Code block" | [ ] |
| 10 | Screen reader объявляет formatting changes | "Bold applied", "Link inserted" | [ ] |
| 11 | Collaboration events объявляются | "Alice joined", "Bob editing line 5" | [ ] |
| 12 | High contrast mode — все элементы видны | Borders, focus rings, text | [ ] |
| 13 | Zoom 200% — editor функционален | No overflow, no clipping | [ ] |
| 14 | Reduced motion — нет анимаций | Мгновенные transitions | [ ] |
| 15 | RTL editor — корректный layout | Mirrored UI, correct cursor | [ ] |
| 16 | IME ввод (Japanese) — корректная вставка | Composition → final text | [ ] |
| 17 | Touch: long press + drag block | Block moves on mobile | [ ] |
| 18 | Virtual keyboard — cursor visible | Editor scrolls to cursor | [ ] |
| 19 | Image без alt — предупреждение | "Image without description" announced | [ ] |
| 20 | Table navigation с клавиатуры | Tab moves between cells | [ ] |

### Screen Reader Testing Matrix

| Screen Reader | Browser | OS | Приоритет | Статус |
|--------------|---------|-----|-----------|--------|
| **NVDA 2024+** | Chrome | Windows 10/11 | P0 — Primary | Обязательно |
| **NVDA 2024+** | Firefox | Windows 10/11 | P0 — Primary | Обязательно |
| **VoiceOver** | Safari | macOS 14+ | P0 — Primary | Обязательно |
| **VoiceOver** | Safari | iOS 17+ | P1 — Secondary | Обязательно |
| **JAWS 2024+** | Chrome | Windows 10/11 | P1 — Secondary | Обязательно |
| **TalkBack** | Chrome | Android 13+ | P1 — Secondary | Обязательно |
| **Narrator** | Edge | Windows 11 | P2 — Tertiary | Желательно |
| **Orca** | Firefox | Linux (GNOME) | P2 — Tertiary | Желательно |

### Screen Reader Test Scenarios

```typescript
// packages/testing/src/a11y/screen-reader-tests.ts

/**
 * Manual screen reader test scripts.
 * Эти тесты выполняются вручную, но структурированы для повторяемости.
 */
export const screenReaderTestScripts = [
  {
    id: 'SR-001',
    title: 'Editor region announced',
    steps: [
      'Navigate to editor with Tab',
      'Listen to screen reader announcement',
    ],
    expected: 'Screen reader announces "rich text editor" or "Document editor"',
    readers: ['NVDA', 'VoiceOver', 'JAWS'],
  },
  {
    id: 'SR-002',
    title: 'Heading level announced',
    steps: [
      'Focus on a heading block',
      'Navigate with arrow keys',
    ],
    expected: 'Screen reader announces "Heading level 2" (or equivalent)',
    readers: ['NVDA', 'VoiceOver', 'JAWS'],
  },
  {
    id: 'SR-003',
    title: 'Bold formatting announced',
    steps: [
      'Select text',
      'Press Ctrl+B',
      'Listen for announcement',
    ],
    expected: '"Bold applied" announced via live region',
    readers: ['NVDA', 'VoiceOver', 'JAWS'],
  },
  {
    id: 'SR-004',
    title: 'Slash menu navigation',
    steps: [
      'Type "/" in editor',
      'Use Arrow Down to navigate',
      'Press Enter to select',
    ],
    expected: 'Each menu item announced, selection confirmed',
    readers: ['NVDA', 'VoiceOver', 'JAWS'],
  },
  {
    id: 'SR-005',
    title: 'Table navigation',
    steps: [
      'Navigate to table block',
      'Use Tab to move between cells',
      'Listen to cell position',
    ],
    expected: '"Row 2, Column 3" or equivalent announced',
    readers: ['NVDA', 'VoiceOver', 'JAWS'],
  },
  {
    id: 'SR-006',
    title: 'Collaboration user join',
    steps: [
      'Have another user join the document',
      'Listen for announcement',
    ],
    expected: '"Alice joined the document" announced via log region',
    readers: ['NVDA', 'VoiceOver'],
  },
  {
    id: 'SR-007',
    title: 'Image alt text',
    steps: [
      'Navigate to image block',
      'Listen to announcement',
    ],
    expected: 'Alt text read aloud. If no alt: "Image without description"',
    readers: ['NVDA', 'VoiceOver', 'JAWS'],
  },
  {
    id: 'SR-008',
    title: 'Code block language',
    steps: [
      'Navigate to code block',
      'Listen to announcement',
    ],
    expected: '"Code block, language JavaScript" or equivalent',
    readers: ['NVDA', 'VoiceOver', 'JAWS'],
  },
];
```

### Automated A11y Reporting

```typescript
// packages/testing/src/a11y/report.ts

export interface A11yReport {
  timestamp: string;
  tool: 'axe-core' | 'pa11y' | 'lighthouse';
  wcagLevel: 'A' | 'AA' | 'AAA';
  violations: A11yViolation[];
  passes: number;
  incomplete: number;
  score: number; // 0-100
}

export interface A11yViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  wcagCriteria: string[];
  elements: string[];
  helpUrl: string;
}

/**
 * Генерация a11y report для PR review.
 * Отправляется как comment в GitHub PR.
 */
export function formatA11yReportForPR(report: A11yReport): string {
  const status = report.violations.length === 0 ? 'PASS' : 'FAIL';
  const critical = report.violations.filter(v => v.impact === 'critical').length;
  const serious = report.violations.filter(v => v.impact === 'serious').length;

  return `
## Accessibility Report — ${status}

**Tool:** ${report.tool} | **WCAG Level:** ${report.wcagLevel} | **Score:** ${report.score}/100

| Metric | Count |
|--------|-------|
| Violations | ${report.violations.length} |
| Critical | ${critical} |
| Serious | ${serious} |
| Passes | ${report.passes} |
| Incomplete | ${report.incomplete} |

${report.violations.length > 0 ? '### Violations\n' + report.violations.map(v =>
  `- **[${v.impact.toUpperCase()}]** ${v.description} (${v.wcagCriteria.join(', ')})`
).join('\n') : 'No violations found.'}
  `.trim();
}
```

---

## Связанные документы

- [01-architecture.md](01-architecture.md) — общая архитектура, rendering pipeline, ViewState
- [03-editor-core.md](03-editor-core.md) — editor state, commands, transforms, schema
- [04-block-editor.md](04-block-editor.md) — block types, slash commands, drag-and-drop, JSON schema
- [05-extensions.md](05-extensions.md) — extension API, keyboard shortcuts, input rules
- [06-framework-adapters.md](06-framework-adapters.md) — React/Vue/Svelte/Solid adapters, ViewState contract
- [02-collaboration.md](02-collaboration.md) — CRDT, awareness, collaboration cursors
- [09-sdk-and-api.md](09-sdk-and-api.md) — пакеты, types, bundle sizes
