# GoTipe — Design System

> **Историческая спецификация, не руководство по текущему API.** Примеры, сроки,
> сравнения производительности, коммерческие условия и обещания ниже не подтверждают
> реализацию или доступность сервиса. Актуально: [контракты](development/editor-contracts.md),
> [карта кода](development/code-map.md), [проверки](development/testing.md),
> [план выпуска](22-release-readiness.md). Лицензии определяются `LICENSE` и manifest
> каждого пакета, а не этим документом.

> Визуальный дизайн редактора из коробки и система тем для кастомизации. GoTipe поставляется с polished default theme и headless API для полного контроля.
>
> **Лицензия:** `@gotipe/theme` — коммерческий пакет (входит в лицензию `@gotipe/block-editor`). Headless mode (без стилей) и `base.css` (структурные стили) доступны бесплатно в MIT core. Кастомные CSS custom properties — бесплатно.

---

## 1. Принципы дизайна

| # | Принцип | Описание |
|---|---------|----------|
| 1 | **Content-first** | Интерфейс минимален. Фокус на контенте, а не на UI-элементах. Toolbar, меню, панели появляются только при необходимости |
| 2 | **Polished by default** | Дефолтная тема — production-ready. Не "базовые стили, которые нужно допиливать", а готовый дизайн уровня Notion |
| 3 | **Headless when needed** | Каждый визуальный элемент можно заменить кастомным. Core = логика + состояние, design = отдельный слой |
| 4 | **Accessible** | WCAG 2.1 AA. Контрасты, focus indicators, keyboard navigation — в дефолтной теме |
| 5 | **Responsive** | Адаптация от мобильного (320px) до десктопа (2560px+). Touch-friendly элементы на мобильных |
| 6 | **Dark mode native** | Light и dark — не afterthought, а два равноценных варианта с единым source of truth |

---

## 2. Типографика

### Шрифты

```css
/* Content font — Inter для оптимальной читаемости */
--gt-font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
                Roboto, "Helvetica Neue", Arial, sans-serif;
--gt-font-mono: "SF Mono", "Fira Code", "JetBrains Mono", Consolas,
                "Courier New", monospace;
--gt-font-heading: var(--gt-font-body);
```

**Inter** как дефолтный шрифт: оптимизирован для экранного текста, поддерживает variable font, хороший кернинг. При отсутствии Inter — fallback на системные шрифты (нулевая задержка).

### Шкала размеров

| Токен | Размер | Line-height | Weight | Использование |
|-------|--------|-------------|--------|---------------|
| `--gt-text-xs` | 12px | 16px (1.33) | 600 | Labels, badge, category headers |
| `--gt-text-sm` | 14px | 20px (1.43) | 500 | UI текст, toolbar labels, описания |
| `--gt-text-base` | 16px | 24px (1.5) | 400 | Основной текст контента (body) |
| `--gt-text-lg` | 18px | 28px (1.55) | 400 | Увеличенный текст |
| `--gt-text-xl` | 20px | 28px (1.4) | 600 | Heading 3 |
| `--gt-text-2xl` | 24px | 32px (1.33) | 600 | Heading 2 |
| `--gt-text-3xl` | 30px | 36px (1.2) | 700 | Heading 1 |

### Параграф

```css
--gt-paragraph-spacing: 0.75em;    /* Между параграфами */
--gt-paragraph-indent: 0;          /* Отступ первой строки (0 по умолчанию) */
--gt-line-height-body: 1.5;        /* Оптимально для чтения (16px → 24px) */
--gt-letter-spacing: -0.011em;     /* Slight tightening для body */
```

### Heading стили

| Level | Размер | Weight | Margin-top | Letter-spacing |
|-------|--------|--------|-----------|---------------|
| H1 | `--gt-text-3xl` (30px) | 700 | 2em | -0.02em |
| H2 | `--gt-text-2xl` (24px) | 600 | 1.75em | -0.017em |
| H3 | `--gt-text-xl` (20px) | 600 | 1.5em | -0.014em |

---

## 3. Цветовая система

### Semantic tokens

Все цвета определены через semantic CSS custom properties. Два набора: light и dark.

```css
/* Surface */
--gt-bg:                  /* Фон редактора */
--gt-bg-hover:            /* Фон при hover */
--gt-bg-active:           /* Фон при active/pressed */
--gt-bg-selected:         /* Фон выделенного блока */
--gt-bg-code:             /* Фон code block */
--gt-bg-callout:          /* Фон callout/blockquote */

/* Text */
--gt-text:                /* Основной текст */
--gt-text-secondary:      /* Вторичный текст */
--gt-text-tertiary:       /* Третичный (placeholder, disabled) */
--gt-text-link:           /* Ссылки */
--gt-text-code:           /* Inline code */

/* Border */
--gt-border:              /* Основная граница */
--gt-border-hover:        /* Граница при hover */
--gt-border-focus:        /* Граница при focus */
--gt-border-divider:      /* Разделитель (hr) */

/* Accent */
--gt-accent:              /* Основной accent (кнопки, ссылки, selection) */
--gt-accent-hover:        /* Accent hover */
--gt-accent-text:         /* Текст на accent фоне */

/* Status */
--gt-success:             /* Зелёный */
--gt-warning:             /* Жёлтый */
--gt-error:               /* Красный */
--gt-info:                /* Синий */

/* Collaboration */
--gt-cursor-1 через --gt-cursor-8:  /* 8 цветов для курсоров коллабораторов */

/* AI */
--gt-ai-ghost:            /* Ghost text (suggestion) */
--gt-ai-highlight:        /* AI-generated content highlight */
--gt-ai-border:           /* AI panel border */
```

### Light theme (default)

```css
:root, [data-theme="light"] {
  --gt-bg: #ffffff;
  --gt-bg-hover: #f7f7f5;
  --gt-bg-active: #efefed;
  --gt-bg-selected: #e8f0fe;
  --gt-bg-code: #f7f6f3;
  --gt-bg-callout: #f7f6f3;

  --gt-text: #1f1f1f;
  --gt-text-secondary: #6b6b6b;
  --gt-text-tertiary: #a3a3a3;
  --gt-text-link: #2563eb;
  --gt-text-code: #eb5757;

  --gt-border: #e5e5e5;
  --gt-border-hover: #d4d4d4;
  --gt-border-focus: #2563eb;
  --gt-border-divider: #e5e5e5;

  --gt-accent: #2563eb;
  --gt-accent-hover: #1d4ed8;
  --gt-accent-text: #ffffff;

  --gt-success: #16a34a;
  --gt-warning: #ca8a04;
  --gt-error: #dc2626;
  --gt-info: #2563eb;

  --gt-ai-ghost: #9ca3af;
  --gt-ai-highlight: #dbeafe;
  --gt-ai-border: #93c5fd;

  /* Shadows — 4-layer soft elevation (Tiptap-adapted) */
  --gt-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --gt-shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --gt-shadow-lg: 0 8px 24px rgba(0,0,0,0.12);
  --gt-shadow-elevated:
    0px 16px 48px 0px rgba(17,24,39,0.04),
    0px 12px 24px 0px rgba(17,24,39,0.04),
    0px 6px 8px 0px rgba(17,24,39,0.02),
    0px 2px 3px 0px rgba(17,24,39,0.02);

  /* Highlight palette — 5 colors for text highlights */
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

  /* Border-radius scale */
  --gt-radius-sm: 6px;
  --gt-radius-md: 8px;
  --gt-radius-lg: 12px;
  --gt-radius-xl: 16px;
  --gt-radius-card: 20px;
}
```

### Dark theme

```css
[data-theme="dark"] {
  --gt-bg: #191919;
  --gt-bg-hover: #222222;
  --gt-bg-active: #2d2d2d;
  --gt-bg-selected: #1e3a5f;
  --gt-bg-code: #2d2d2d;
  --gt-bg-callout: #252525;

  --gt-text: #e8e8e8;
  --gt-text-secondary: #999999;
  --gt-text-tertiary: #666666;
  --gt-text-link: #60a5fa;
  --gt-text-code: #f87171;

  --gt-border: #333333;
  --gt-border-hover: #444444;
  --gt-border-focus: #60a5fa;
  --gt-border-divider: #333333;

  --gt-accent: #3b82f6;
  --gt-accent-hover: #60a5fa;
  --gt-accent-text: #ffffff;

  --gt-success: #22c55e;
  --gt-warning: #eab308;
  --gt-error: #ef4444;
  --gt-info: #3b82f6;

  --gt-ai-ghost: #6b7280;
  --gt-ai-highlight: #1e3a5f;
  --gt-ai-border: #2563eb;

  --gt-shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --gt-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --gt-shadow-lg: 0 8px 24px rgba(0,0,0,0.5);
  --gt-shadow-elevated:
    0px 16px 48px 0px rgba(0,0,0,0.16),
    0px 12px 24px 0px rgba(0,0,0,0.12),
    0px 6px 8px 0px rgba(0,0,0,0.08),
    0px 2px 3px 0px rgba(0,0,0,0.06);

  /* Highlight palette — dark mode adapted */
  --gt-highlight-blue-bg: #1e3a5f;
  --gt-highlight-blue-text: #93c5fd;
  --gt-highlight-green-bg: #14532d;
  --gt-highlight-green-text: #86efac;
  --gt-highlight-yellow-bg: #422006;
  --gt-highlight-yellow-text: #fde68a;
  --gt-highlight-red-bg: #450a0a;
  --gt-highlight-red-text: #fca5a5;
  --gt-highlight-purple-bg: #3b0764;
  --gt-highlight-purple-text: #d8b4fe;
}
```

### Cursor colors (collaboration)

```css
--gt-cursor-1: #f87171;   /* Red */
--gt-cursor-2: #60a5fa;   /* Blue */
--gt-cursor-3: #34d399;   /* Green */
--gt-cursor-4: #fbbf24;   /* Yellow */
--gt-cursor-5: #a78bfa;   /* Purple */
--gt-cursor-6: #fb923c;   /* Orange */
--gt-cursor-7: #f472b6;   /* Pink */
--gt-cursor-8: #38bdf8;   /* Cyan */
```

---

## 4. Spacing и Layout

### Spacing scale

```css
--gt-space-1:  4px;
--gt-space-2:  8px;
--gt-space-3:  12px;
--gt-space-4:  16px;
--gt-space-5:  20px;
--gt-space-6:  24px;
--gt-space-8:  32px;
--gt-space-10: 40px;
--gt-space-12: 48px;
--gt-space-16: 64px;
```

### Editor layout

```css
--gt-editor-padding-x: var(--gt-space-16);   /* Боковые отступы (64px) */
--gt-editor-padding-y: var(--gt-space-12);   /* Верхний/нижний отступ */
--gt-editor-max-width: 720px;                /* Макс. ширина контента */
--gt-editor-min-height: 200px;               /* Мин. высота */
```

### Block spacing

```css
--gt-block-gap: var(--gt-space-1);           /* Между блоками (4px) */
--gt-block-padding: var(--gt-space-1) 0;     /* Padding внутри блока */
--gt-block-indent: var(--gt-space-6);        /* Отступ вложенных блоков (24px) */
```

### Responsive breakpoints

```css
--gt-breakpoint-sm: 640px;    /* Mobile landscape */
--gt-breakpoint-md: 768px;    /* Tablet */
--gt-breakpoint-lg: 1024px;   /* Desktop */
--gt-breakpoint-xl: 1280px;   /* Wide desktop */
```

**Mobile адаптация (< 640px):**
- `--gt-editor-padding-x` → `16px`
- `--gt-editor-max-width` → `100%`
- Toolbar переходит в bottom sheet
- Bubble menu адаптируется под touch
- Slash commands — full-width modal

---

## 5. Компоненты UI

### 5.1 Toolbar (Fixed/Floating)

```
┌─────────────────────────────────────────────────────────────┐
│ B  I  U  S  ~  </>  H1▾  •  1.  ☐  ""  —  🔗  📎  ⋯    │
└─────────────────────────────────────────────────────────────┘
```

**Требования:**

| Свойство | Значение |
|----------|---------|
| Высота | 44px |
| Фон | `--gt-bg` с `backdrop-filter: blur(12px)` |
| Border | `1px solid rgba(0,0,0,0.05)` + `--gt-shadow-sm` |
| Border-radius | `var(--gt-radius-lg)` (12px) |
| Кнопка размер | 32px × 32px, border-radius `var(--gt-radius-lg)` (12px) |
| Кнопка default | Transparent background |
| Кнопка hover | `rgba(0,0,0,0.08)` background, transition 150ms |
| Кнопка active | `--gt-accent` для текста/иконок |
| Разделитель | 1px вертикальная линия, `rgba(0,0,0,0.05)`, height 20px, margin 0 4px |
| Иконки | 18px, stroke 1.5px, `--gt-text-secondary` (default), `--gt-text` (hover) |
| Dropdown | `--gt-shadow-elevated`, border-radius `var(--gt-radius-card)` (20px), max-height 320px |
| Позиционирование | sticky top (desktop), fixed bottom (mobile) |

**Варианты:**
- `toolbar="fixed"` — сверху, прилипает при скролле
- `toolbar="floating"` — появляется при выделении текста (= bubble menu)
- `toolbar="bottom"` — фиксированный снизу (mobile)
- `toolbar={false}` — без toolbar (headless)

### 5.2 Bubble Menu

Появляется при выделении текста. Layout: AI Improve → Block Type dropdown → Formatting marks → Text Color → More.

```
                    ┌──────────────────────────────────────────────────────┐
Selected text here  │ ✨ Improve │ Paragraph ▾ │ B I U S </> 🔗 │ A▾ │ ⋮ │
                    └──────────────────────────────────────────────────────┘
```

| Свойство | Значение |
|----------|---------|
| Фон | `--gt-bg` |
| Border | `1px solid rgba(0,0,0,0.05)` |
| Shadow | `--gt-shadow-elevated` (4-layer soft) |
| Border-radius | `var(--gt-radius-lg)` (12px) |
| Padding | `4px` |
| Кнопка размер | 32×32px, border-radius `var(--gt-radius-lg)` (12px) |
| Кнопка default | Transparent background |
| Кнопка hover | `rgba(0,0,0,0.08)` background |
| Кнопка active mark | `--gt-accent` цвет иконки |
| Разделитель | 1px вертикальная, `rgba(0,0,0,0.05)`, height 20px, margin 0 4px |
| Анимация появления | `opacity 0→1 + translateY(4px→0)`, 150ms ease-out |
| Анимация скрытия | `opacity 1→0`, 100ms ease-in |
| Позиционирование | Над выделением, по центру. Flips below when near top edge. Viewport edge detection. |
| Отступ от выделения | 8px |
| Z-index | `--gt-z-bubble: 40` |

### 5.3 Slash Commands Menu

Появляется при вводе `/` в начале блока.

```
┌──────────────────────────────────────┐
│ 🔍 Search blocks...                  │
├──────────────────────────────────────┤
│ TEXT                                 │
│  ¶  Text            Plain text       │
│  H1 Heading 1       Large heading    │
│  H2 Heading 2       Medium heading   │
│  H3 Heading 3       Small heading    │
├──────────────────────────────────────┤
│ LISTS                                │
│  •  Bullet List     Unordered list   │
│  1. Numbered List   Ordered list     │
│  ☐  To-do List      Checklist        │
│  ▸  Toggle          Collapsible      │
├──────────────────────────────────────┤
│ MEDIA                                │
│  🖼 Image           Upload or embed  │
│  📹 Video           YouTube, Vimeo   │
│  📎 File            Upload file      │
├──────────────────────────────────────┤
│ ADVANCED                             │
│  <> Code Block      Syntax highlight │
│  "" Blockquote      Quote text       │
│  — Divider          Horizontal line  │
│  ⊞ Table            Insert table     │
│  📐 Math            LaTeX equation   │
│  📊 Callout         Highlighted box  │
└──────────────────────────────────────┘
```

| Свойство | Значение |
|----------|---------|
| Ширина | 320px |
| Max-height | 400px (scrollable) |
| Фон | `--gt-bg` |
| Border | `1px solid var(--gt-border)` |
| Shadow | `--gt-shadow-elevated` (4-layer soft) |
| Border-radius | `var(--gt-radius-card)` (20px) |
| Search input | `--gt-bg-hover` фон, border-radius 6px, 36px высота, placeholder: "Search blocks..." |
| Категория | `--gt-text-tertiary`, 11px, uppercase, letter-spacing 0.05em, padding-left 12px |
| Item высота | 40px |
| Item padding | `8px 12px` |
| Item hover | `--gt-bg-hover`, border-radius 6px |
| Item selected (keyboard) | `--gt-bg-selected` |
| Иконка | 20px, margin-right 10px |
| Item title | `--gt-text`, `--gt-text-sm` (14px), font-weight 500 |
| Item description | `--gt-text-tertiary`, `--gt-text-xs` (12px) |
| Анимация | `opacity + scale(0.98→1) + translateY(4px→0)`, 150ms ease-out |
| Позиционирование | Ниже курсора, прижат к левому краю блока |
| Keyboard nav | Arrow Up/Down, Enter для выбора, Esc для закрытия |
| Фильтрация | Realtime fuzzy search по title. Подсветка совпадений `<mark>` |
| Пустой результат | "No results" с `--gt-text-tertiary` по центру |

### 5.4 Block Handles (Drag Handle + Add Button)

Появляются при hover на блоке (слева).

```
  ⊕  ⋮⋮  This is a paragraph block
```

| Свойство | Значение |
|----------|---------|
| Add button `⊕` | 20px, `--gt-text-tertiary`, hover: `--gt-text-secondary` |
| Drag handle `⋮⋮` | 20px, `--gt-text-tertiary`, hover: `--gt-text-secondary`, cursor: grab |
| Позиционирование | Слева от блока, выровнены по первой строке |
| Отступ от контента | `8px` |
| Появление | `opacity 0→1`, 100ms, при hover на блоке |
| Click на `⊕` | Открывает slash commands menu |
| Drag `⋮⋮` | Начинает drag-and-drop блока |
| Drop indicator | Горизонтальная линия `2px`, `--gt-accent`, между блоками |
| Drop animation | Блок перемещается с `ease-out 200ms` |

### 5.5 Selection

| Тип | Визуал |
|-----|--------|
| **Text selection** | `--gt-bg-selected` фон, нативный browser selection |
| **Block selection** | Весь блок: `--gt-bg-selected` фон + `2px solid --gt-accent` border-left |
| **Multi-block selection** | Каждый выделенный блок с block selection стилем |
| **Node selection** (image, embed) | `2px solid --gt-accent` border, 8 resize handles по углам и сторонам |

### 5.6 Floating Menu (Empty Block)

Появляется при пустом параграфе.

```
  Type '/' for commands, or start typing...   [placeholder]
```

| Свойство | Значение |
|----------|---------|
| Текст placeholder | `--gt-text-tertiary`, italic: false |
| Дефолтный текст | "Type '/' for commands, or start typing..." |
| Кастомизация | Через `Placeholder.configure({ text: '...' })` |

### 5.7 Link Preview

Popup при hover над ссылкой.

```
┌──────────────────────────────────────────┐
│ 🔗 https://example.com/article           │
│ ┌──────┐ ┌────────┐ ┌──────────┐        │
│ │ Open │ │ Edit   │ │ Unlink   │        │
│ └──────┘ └────────┘ └──────────┘        │
└──────────────────────────────────────────┘
```

| Свойство | Значение |
|----------|---------|
| Фон | `--gt-bg` |
| Shadow | `--gt-shadow-md` |
| Border-radius | `8px` |
| URL текст | `--gt-text-link`, truncate с ellipsis, max 280px |
| Кнопки | Ghost style, `--gt-text-secondary`, hover: `--gt-bg-hover` |
| Появление | Delay 300ms hover, анимация как у bubble menu |
| Скрытие | При уходе мыши, delay 100ms |

### 5.8 Code Block

```
┌──────────────────────────────────────────┐
│ JavaScript                          📋   │
├──────────────────────────────────────────┤
│  1  const editor = useEditor({           │
│  2    extensions: DefaultPreset,         │
│  3    content: '<p>Hello</p>',           │
│  4  });                                  │
└──────────────────────────────────────────┘
```

| Свойство | Значение |
|----------|---------|
| Фон | `--gt-bg-code` |
| Border-radius | `8px` |
| Padding | `16px` |
| Language selector | Dropdown вверху слева, `--gt-text-tertiary`, `--gt-text-xs` |
| Copy button | Вверху справа, `--gt-text-tertiary`, hover: `--gt-text`, tooltip "Copy code" |
| Line numbers | `--gt-text-tertiary`, fixed width 32px, right-aligned |
| Font | `--gt-font-mono`, `--gt-text-sm` (14px), line-height 1.6 |
| Syntax highlighting | Через `@gotipe/ext-code-highlight`, дефолтная тема синхронизирована с editor theme |
| Overflow | Horizontal scroll, scrollbar тонкий (4px) |

### 5.9 Table

```
┌──────────┬──────────┬──────────┐
│ Header 1 │ Header 2 │ Header 3 │  ← header row: --gt-bg-hover фон, font-weight 600
├──────────┼──────────┼──────────┤
│ Cell 1   │ Cell 2   │ Cell 3   │
├──────────┼──────────┼──────────┤
│ Cell 4   │ Cell 5   │ Cell 6   │
└──────────┴──────────┴──────────┘
```

| Свойство | Значение |
|----------|---------|
| Border | `1px solid var(--gt-border)` |
| Header фон | `--gt-bg-hover` |
| Cell padding | `8px 12px` |
| Cell min-width | `100px` |
| Selected cell | `--gt-bg-selected` фон, `2px solid --gt-accent` border |
| Column resize | Drag handle на border, cursor: col-resize, highlight `--gt-accent` 2px |
| Row/column add | `+` кнопка при hover на краю таблицы |
| Row/column menu | Right-click → context menu (insert/delete row/column, merge, split) |

### 5.10 Callout / Blockquote

```
┌─ ℹ️ ──────────────────────────────────────┐
│  This is a callout block with info icon.  │
└───────────────────────────────────────────┘

│  This is a blockquote. Left border accent.
```

| Тип | Визуал |
|-----|--------|
| **Blockquote** | `3px solid --gt-border-divider` border-left, padding-left 16px, `--gt-text-secondary` цвет текста |
| **Callout info** | `--gt-bg-callout` фон, border-radius 8px, padding 16px, emoji/icon слева |
| **Callout warning** | `--gt-warning` border-left 3px + приглушённый жёлтый фон |
| **Callout error** | `--gt-error` border-left 3px + приглушённый красный фон |
| **Callout success** | `--gt-success` border-left 3px + приглушённый зелёный фон |

### 5.11 Image Block

```
┌─────────────────────────────────────────┐
│                                         │
│              [Image]                    │
│                                         │
├─────────────────────────────────────────┤
│ Caption text here (optional)            │
└─────────────────────────────────────────┘
```

| Свойство | Значение |
|----------|---------|
| Border-radius | `4px` |
| Max-width | `100%` |
| Alignment | Left / Center / Right / Full-width |
| Selected | `2px solid --gt-accent` + resize handles (8 точек) |
| Caption | `--gt-text-secondary`, `--gt-text-sm`, text-align center, placeholder "Add caption..." |
| Loading | Skeleton placeholder `--gt-bg-hover` с shimmer анимацией |
| Error | Иконка broken image + `--gt-text-tertiary` "Failed to load image" |

### 5.12 Collaboration Cursors

```
  ┃ Alice                          ← cursor line + name label
  ┃ Some text being edited ████    ← selection highlight
```

| Свойство | Значение |
|----------|---------|
| Cursor line | `2px solid var(--gt-cursor-N)`, height 100% строки |
| Name label | `--gt-cursor-N` фон, белый текст, `--gt-text-xs`, border-radius 4px 4px 4px 0, padding 2px 6px |
| Label позиция | Над курсором, слева |
| Label появление | Fade-in при idle 500ms, fade-out при движении |
| Selection | `--gt-cursor-N` с opacity 0.15 |

### 5.13 AI Ghost Text

```
  The quick brown fox |jumped over the lazy dog    ← серый ghost text после курсора
```

| Свойство | Значение |
|----------|---------|
| Цвет | `--gt-ai-ghost` |
| Стиль | Тот же font, size, но пониженная opacity |
| Появление | Fade-in 200ms после задержки ответа AI |
| Accept | Tab — ghost text становится обычным текстом, анимация `opacity 0.5→1` 100ms |
| Dismiss | Esc или продолжение набора — fade-out 100ms |
| Multi-line | Поддержка нескольких строк ghost text |

### 5.14 AI Command Panel

```
┌──────────────────────────────────────────┐
│ ✨ Ask AI...                              │
├──────────────────────────────────────────┤
│ 📝 Improve writing                       │
│ ✂️  Make shorter                          │
│ 📏 Make longer                            │
│ 🌐 Translate to...                       │
│ 💡 Explain                                │
│ 📋 Summarize                              │
│ ✏️  Fix grammar                           │
│ 🔄 Change tone to...                     │
└──────────────────────────────────────────┘
```

| Свойство | Значение |
|----------|---------|
| Trigger | `Ctrl+J` или через slash commands `/ai` |
| Ширина | 360px |
| Фон | `--gt-bg` |
| Border | `1px solid var(--gt-ai-border)` |
| Shadow | `--gt-shadow-lg` |
| Border-radius | `10px` |
| Input | Сверху, автофокус, placeholder "Ask AI..." |
| Commands | Список с иконками, hover `--gt-bg-hover` |
| Streaming output | Текст появляется token-by-token с cursor blink |
| Accept/Reject | Два кнопки внизу: "Insert" (accent) и "Discard" (ghost) |

---

### 5.15 Component Computed Styles Summary

Таблица реальных computed-стилей для ключевых компонентов (итоговые значения, не токены):

| Компонент | Background | Border | Border-radius | Shadow | Sizing |
|-----------|-----------|--------|---------------|--------|--------|
| **Editor canvas** | transparent | none | — | none | max-width 708px, centered |
| **Toolbar buttons** | transparent → hover rgba(0,0,0,0.08) | none | 12px | none | 32×32px |
| **Cards/Dropdowns** | `--gt-bg` | 1px solid rgba(0,0,0,0.05) | 20px | 4-layer elevated | auto |
| **Slash menu** | `--gt-bg` | 1px solid rgba(0,0,0,0.05) | 20px | 4-layer elevated | 320px width |
| **Bubble menu** | `--gt-bg` | 1px solid rgba(0,0,0,0.05) | 12px | 4-layer elevated | auto |
| **Block context menu** | `--gt-bg` | 1px solid rgba(0,0,0,0.05) | 12px | 4-layer elevated | auto |
| **Separators** | `rgba(0,0,0,0.05)` | — | — | — | 1px, margin 4px 0 |
| **Code block** | `--gt-bg-code` | none | 8px | none | padding 16px |
| **Image selected** | — | 2px solid `--gt-accent` | 4px | none | resize handles 8×8px |
| **AI command bar** | `--gt-bg` | 1px solid rgba(0,0,0,0.05) | 999px (pill) | 4-layer + backdrop blur | ~600px width |

**Ключевой принцип:** Минимальные borders (opacity 0.05), depth через shadows (4-layer soft), крупные border-radius (12px кнопки, 20px карточки/меню).

---

## 6. Анимации и Transitions

### Длительности

```css
--gt-duration-fast: 100ms;     /* Hover, active states */
--gt-duration-normal: 150ms;   /* Menus, tooltips */
--gt-duration-slow: 200ms;     /* Block drag, panels */
--gt-duration-enter: 200ms;    /* Появление */
--gt-duration-exit: 100ms;     /* Скрытие (быстрее, чем появление) */
```

### Easing

```css
--gt-ease-out: cubic-bezier(0.16, 1, 0.3, 1);      /* Появление (decelerate) */
--gt-ease-in: cubic-bezier(0.5, 0, 0.75, 0);        /* Скрытие (accelerate) */
--gt-ease-in-out: cubic-bezier(0.45, 0, 0.55, 1);   /* Перемещение */
--gt-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* Bounce effect (drag-drop) */
```

### Анимации компонентов

| Компонент | Появление | Скрытие |
|-----------|-----------|---------|
| Bubble Menu | `opacity + translateY(4px→0)`, 150ms ease-out | `opacity`, 100ms ease-in |
| Slash Menu | `opacity + scale(0.98→1) + translateY(4px→0)`, 150ms ease-out | `opacity + scale(1→0.98)`, 100ms ease-in |
| Toolbar | `opacity + translateY(-8px→0)`, 200ms ease-out | `opacity`, 100ms ease-in |
| Block drag | `box-shadow + scale(1.02)`, 200ms ease-spring | `ease-in-out`, 200ms |
| Drop indicator | `opacity + scaleX(0→1)`, 150ms ease-out | Мгновенно |
| Toast/notification | `opacity + translateY(8px→0)`, 200ms ease-out | `opacity + translateY(0→8px)`, 150ms ease-in |
| AI ghost text | `opacity 0→1`, 200ms ease-out | `opacity 1→0`, 100ms ease-in |

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. Theming API

### 7.1 Использование default theme

> **`@gotipe/theme`** — коммерческий пакет (требует лицензию Block Editor или Cloud подписку). `base.css` — MIT, доступен бесплатно.

```typescript
// Полная тема (light + dark) — требует лицензию Block Editor
import '@gotipe/theme/styles.css';

// Только light — требует лицензию
import '@gotipe/theme/light.css';

// Только dark — требует лицензию
import '@gotipe/theme/dark.css';

// Структурные стили (headless) — MIT, бесплатно
import '@gotipe/theme/base.css';

// Без стилей (полностью headless) — MIT
// Ничего не импортировать
```

### 7.2 Переключение тем

```typescript
const editor = useEditor({
  extensions: DefaultPreset,
  theme: 'light', // 'light' | 'dark' | 'system'
});

// Runtime switching
editor.setTheme('dark');

// System preference (auto)
editor.setTheme('system');
```

**`system`** — автоматически подбирает тему по `prefers-color-scheme`. При изменении системной темы переключает мгновенно.

### 7.3 Кастомизация через CSS Custom Properties

```css
/* Полная перекраска через переопределение токенов */
.my-editor {
  --gt-accent: #8b5cf6;         /* Purple accent */
  --gt-bg: #fafaf9;             /* Warm background */
  --gt-font-body: "Inter", sans-serif;
  --gt-text-3xl: 28px;          /* Smaller H1 */
  --gt-editor-max-width: 800px; /* Wider content */
}
```

### 7.4 Theme presets

```typescript
import { defineTheme } from '@gotipe/theme';

const myTheme = defineTheme({
  name: 'notion-like',
  extend: 'light', // базовая тема

  tokens: {
    'gt-accent': '#000000',
    'gt-bg': '#ffffff',
    'gt-bg-hover': '#f1f1ef',
    'gt-font-body': '"Inter", -apple-system, sans-serif',
    'gt-editor-padding-x': '96px',
    'gt-editor-max-width': '900px',
    'gt-border-radius': '3px',
  },

  // Кастомные стили для конкретных компонентов
  components: {
    toolbar: {
      background: 'transparent',
      borderBottom: '1px solid var(--gt-border)',
      borderRadius: '0',
    },
    slashMenu: {
      width: '280px',
    },
    codeBlock: {
      fontFamily: '"Fira Code", monospace',
      fontSize: '13px',
    },
  },
});

const editor = useEditor({
  extensions: DefaultPreset,
  theme: myTheme,
});
```

### 7.5 Component-level override

```tsx
// React
<Editor
  editor={editor}
  slotBefore={<CustomToolbar />}
  bubbleMenu={({ editor }) => <MyBubbleMenu editor={editor} />}
  slashMenu={({ editor, query }) => <MySlashMenu editor={editor} query={query} />}
  blockHandle={({ editor, blockId }) => <MyBlockHandle editor={editor} blockId={blockId} />}
/>
```

```vue
<!-- Vue -->
<Editor :editor="editor">
  <template #toolbar>
    <CustomToolbar />
  </template>
  <template #bubble-menu="{ editor }">
    <MyBubbleMenu :editor="editor" />
  </template>
  <template #slash-menu="{ editor, query }">
    <MySlashMenu :editor="editor" :query="query" />
  </template>
</Editor>
```

### 7.6 Headless mode (без стилей)

```typescript
const editor = useEditor({
  extensions: DefaultPreset,
  theme: false,  // Полностью headless — zero CSS
});

// Или с минимальными структурными стилями (без визуальных)
import '@gotipe/theme/base.css'; // Только layout, без цветов/теней
```

`base.css` содержит только:
- Структурные стили (display, position, overflow)
- Cursor стили (text, grab, pointer)
- Whitespace/word-break правила
- ProseMirror base (gapcursor, dropcursor geometry)

### 7.7 CSS Architecture

```
@gotipe/theme/
├── styles.css              # Full theme (light + dark + components)
├── light.css               # Light tokens only
├── dark.css                # Dark tokens only
├── base.css                # Structural-only (headless)
├── tokens/
│   ├── colors.css          # Color tokens
│   ├── typography.css      # Font tokens
│   ├── spacing.css         # Spacing tokens
│   └── animation.css       # Animation tokens
└── components/
    ├── toolbar.css
    ├── bubble-menu.css
    ├── slash-menu.css
    ├── block-handle.css
    ├── code-block.css
    ├── table.css
    ├── image.css
    ├── callout.css
    ├── collaboration.css
    └── ai.css
```

Каждый файл из `components/` можно импортировать отдельно:

```css
/* Кастомный набор — только нужные компоненты */
@import '@gotipe/theme/base.css';
@import '@gotipe/theme/tokens/colors.css';
@import '@gotipe/theme/components/toolbar.css';
@import '@gotipe/theme/components/code-block.css';
```

---

## 8. Иконки

### Иконочный набор

GoTipe поставляется с собственным набором SVG иконок, оптимизированных для 18px.

**Характеристики:**
- Stroke-based, 1.5px stroke width
- 18x18 viewBox
- Rounded linecap и linejoin
- `currentColor` для цвета

**Набор:**

| Категория | Иконки |
|-----------|--------|
| **Formatting** | bold, italic, underline, strikethrough, code, highlight, superscript, subscript |
| **Blocks** | heading-1, heading-2, heading-3, paragraph, quote, divider, callout |
| **Lists** | list-bullet, list-ordered, list-check, list-toggle |
| **Insert** | image, video, file, table, code-block, math, embed |
| **Actions** | link, unlink, copy, undo, redo, more-horizontal |
| **Alignment** | align-left, align-center, align-right, align-justify |
| **AI** | sparkle, wand, expand, compress, translate |
| **Collaboration** | user, users, comment, resolve, version |

**Кастомизация иконок:**

```typescript
import { defineIcons } from '@gotipe/theme';

const myIcons = defineIcons({
  bold: '<svg>...</svg>',       // Custom SVG
  italic: MyItalicComponent,     // React/Vue component
});

const editor = useEditor({
  extensions: DefaultPreset,
  icons: myIcons,
});
```

---

## 9. Z-index шкала

```css
--gt-z-content: 1;           /* Editor content */
--gt-z-block-handle: 10;     /* Block drag handles */
--gt-z-selection: 20;        /* Selection overlay */
--gt-z-toolbar: 30;          /* Fixed toolbar */
--gt-z-bubble: 40;           /* Bubble menu */
--gt-z-slash: 50;            /* Slash commands */
--gt-z-modal: 60;            /* Modal dialogs */
--gt-z-ai: 70;               /* AI panel */
--gt-z-toast: 80;            /* Toast notifications */
--gt-z-drag: 100;            /* Dragging block (above everything) */
```

---

## 10. Print стили

```css
@media print {
  /* Скрыть UI элементы */
  .gt-toolbar,
  .gt-bubble-menu,
  .gt-slash-menu,
  .gt-block-handle,
  .gt-collaboration-cursor { display: none; }

  /* Оптимизация для печати */
  .gt-editor {
    max-width: 100%;
    padding: 0;
    box-shadow: none;
    border: none;
  }

  /* Ссылки — показать URL */
  a[href]::after {
    content: " (" attr(href) ")";
    font-size: 0.8em;
    color: #666;
  }

  /* Page breaks */
  h1, h2, h3 { page-break-after: avoid; }
  pre, blockquote, table { page-break-inside: avoid; }
  img { max-width: 100%; page-break-inside: avoid; }
}
```

---

## Связанные документы

- [04-block-editor.md](04-block-editor.md) — Block editor UX, slash commands, drag-and-drop
- [05-extensions.md](05-extensions.md) — Extension system, UI components
- [06-framework-adapters.md](06-framework-adapters.md) — React, Vue, Svelte, Solid adapters
- [07-ai.md](07-ai.md) — AI UI components (ghost text, AI panel)
- [15-accessibility-i18n.md](15-accessibility-i18n.md) — WCAG compliance, focus management
