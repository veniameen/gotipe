# GoTipe Block Editor — Пошаговый план реализации

> Детальная документация: каждая фича разбита на атомарные шаги. Работаем последовательно — каждый шаг проверяем перед переходом к следующему.

---

## Состояние кодовой базы (аудит)

**Что реально работает (не заглушки):**
- WASM скомпилирован (1.8MB бинарник), `WasmEditor` реально применяет транзакции
- `editor.ts` — полный contentEditable с обработкой `beforeinput` (insertText, splitBlock, deleteText, mergeBlocks)
- `chain.ts` — 30+ команд (toggleBold, setBlockType, insertBlockAfter, moveBlock и т.д.)
- 26 extensions с реальными keybindings, inputRules, slash commands
- `editor-content.tsx` — рендерит блоки с `data-block-id`, монтирует editor через `editor.mount()`
- Все UI компоненты block-editor (SlashMenu, BubbleMenu, DragHandle и т.д.) реально подключены к editor
- `WasmBridge` с fallback-режимом (если WASM не загрузится — показывает начальный контент, но транзакции не применяет)

**Что означает для нас:**
- Ядро работает. Проблемы в playground — это проблемы подключения, а не отсутствия логики.
- Все `editor.chain().toggleBold().run()` — реальные вызовы, которые создают Transaction → отправляют в WASM → получают новый state → вызывают `viewStateChange` → React перерендеривает.

---

## Фаза 0: Базовый рабочий редактор ✅

Цель: открываем playground, видим текст, можем его редактировать.

> **Статус:** Завершена. Найден и исправлен баг двойной вставки символов — `unmount()` не удалял event listeners, React strict mode вешал обработчики дважды. Исправлено через `AbortController` + rAF DOM correction как safety net.

### Шаг 0.1: Проверить загрузку WASM ✅

**Файл:** `packages/core/src/wasm-bridge.ts`

**Что проверить:**
1. Открыть `http://localhost:5173/#simple` в Chrome DevTools → Console
2. Если видим `"GoTipe WASM init failed, using JS fallback:"` — WASM не загрузился
3. В Network tab проверить: загружается ли `gotipe_wasm_bg.wasm`?

**Возможные проблемы и решения:**
- WASM файл не находится → проверить что `packages/wasm/pkg/gotipe_wasm_bg.wasm` существует
- Vite не раздаёт `.wasm` → в `vite.config.ts` playground добавить:
  ```ts
  optimizeDeps: { exclude: ['@gotipe/wasm'] }
  ```
- MIME type неправильный → Vite должен отдавать `application/wasm`

**Критерий:** В консоли нет ошибок WASM. `editor.wasm.isFallback === false`.

### Шаг 0.2: Проверить mount() и contentEditable ✅

**Файл:** `packages/react/src/editor-content.tsx` (строка 224-228)

**Что происходит:**
1. `EditorContent` получает `editor` через prop
2. В `useEffect` вызывает `editor.mount(containerRef.current)`
3. `mount()` ставит `contenteditable="true"` на элемент
4. `mount()` вешает обработчики: `beforeinput`, `keydown`, `input`, `selectionchange`, `paste`, `copy`, `cut`

**Что проверить в DevTools:**
1. Elements → найти `<div data-gotipe-content contenteditable="true">` — должен быть `contenteditable`
2. Если нет — editor не смонтирован
3. Кликнуть в область → должен появиться текстовый курсор

**Возможная проблема:** `<Editor>` из `@gotipe/react` рендерит `<EditorContent>`, который вызывает `mount()`. Если playground использует `<BlockEditor>` из block-editor, тот внутри рендерит `<Editor>` → `<EditorContent>` → `mount()`. Цепочка длинная — проверить что editor не null на каждом уровне.

**Критерий:** `contenteditable="true"` на DOM элементе. Текстовый курсор при клике.

### Шаг 0.3: Проверить ввод текста ✅

**Файл:** `packages/core/src/editor.ts` (строки 645-699)

**Что происходит при нажатии клавиши:**
1. Браузер генерирует `beforeinput` с `inputType: "insertText"`, `data: "a"`
2. `editor.mount()` перехватывает: `e.preventDefault()`
3. Определяет текущую позицию курсора из `currentSelection`
4. Создаёт step: `{ type: "insertText", blockId, offset, text: "a", marks: [] }`
5. Вызывает `this.dispatch({ steps })` → `WasmBridge.apply(transactionJson)`
6. WASM возвращает новый document JSON
7. Editor парсит JSON → обновляет `currentState` → вызывает `emit("viewStateChange")`
8. React перерендеривает блоки через `useSyncExternalStore`
9. `scheduleSelectionRestore()` ставит курсор на `offset + 1` через `requestAnimationFrame`

**Что может ломаться:**
- `currentSelection` пустой (нет `blockId`) — курсор не установлен, позиция неизвестна
- WASM в fallback → `apply()` возвращает неизменённый state → символ не добавляется
- `resolvePosition()` не находит `data-block-id` элемент → selection tracking не работает
- React перерендеривает и сбивает DOM → `restoreDomSelection()` не находит текстовый узел

**Отладка:**
```js
// В console, после создания editor:
editor.on('viewStateChange', () => console.log('State changed:', editor.getViewState().blocks.length));
```

**Критерий:** Печатаем "hello" → видим "hello" в редакторе. Курсор двигается правильно.

### Шаг 0.4: Проверить Enter (splitBlock) ✅

**Файл:** `packages/core/src/editor.ts` (строки 701-728)

**Что происходит:**
1. `beforeinput` с `inputType: "insertParagraph"`
2. `e.preventDefault()`
3. Step: `{ type: "splitBlock", blockId, offset }`
4. WASM разделяет блок на два
5. Курсор переносится на начало нового блока

**Критерий:** Enter в середине текста → текст разделяется на два параграфа.

### Шаг 0.5: Проверить Backspace (deleteText / mergeBlocks) ✅

**Файл:** `packages/core/src/editor.ts` (строки 731-788)

**Три кейса:**
1. **Выделен текст** → `deleteText` с `from`/`to`
2. **Курсор внутри блока** → `deleteText` с `from: offset-1, to: offset`
3. **Курсор в начале блока** → `mergeBlocks` с предыдущим блоком

**Критерий:** Backspace удаляет символ. Backspace в начале блока сливает с предыдущим.

### Шаг 0.6: Проверить Delete (deleteContentForward) ✅

**Файл:** `packages/core/src/editor.ts` (строки 791-832)

**Критерий:** Delete удаляет символ вперёд.

---

## Фаза 1: Design System — Токены ✅

Цель: единообразный визуальный стиль всех компонентов.

> **Статус:** Завершена. Все CSS-токены добавлены в `:root` и `[data-theme="dark"]` блоки в `theme.css`. Inter подключён через Google Fonts. Playground импортирует `theme.css` → все переменные доступны CSS-first (без ожидания JS). Theme toggle работает корректно.

### Шаг 1.1: Обновить CSS переменные в theme.css ✅

**Файл:** `packages/theme/src/theme.css`

**Добавить/обновить:**

```css
:root {
  /* Цвета */
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

  /* Тени — 4-слойная мягкая */
  --gt-shadow-elevated:
    0px 16px 48px 0px rgba(17, 24, 39, 0.04),
    0px 12px 24px 0px rgba(17, 24, 39, 0.04),
    0px 6px 8px 0px rgba(17, 24, 39, 0.02),
    0px 2px 3px 0px rgba(17, 24, 39, 0.02);

  /* Скругления */
  --gt-radius-sm: 6px;
  --gt-radius-md: 8px;
  --gt-radius-lg: 12px;
  --gt-radius-card: 20px;

  /* Шрифты */
  --gt-font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --gt-font-mono: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace;

  /* Размеры текста */
  --gt-text-xs: 12px;
  --gt-text-sm: 14px;
  --gt-text-base-size: 16px;
  --gt-text-lg: 18px;
  --gt-text-xl: 20px;

  /* Подсветка — 5 цветов */
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

**Проверка:** Импортировать `@gotipe/theme/base.css` в playground → все компоненты используют токены.

### Шаг 1.2: Тёмная тема ✅

**Файл:** `packages/theme/src/theme.css`

**Добавить:**
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
  /* ... все остальные токены тёмной темы */
}
```

**Проверка:** ThemeToggle переключает → все цвета меняются.

### Шаг 1.3: Подключить Inter шрифт ✅

**Файл:** `apps/playground/index.html`

**Добавить:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**Проверка:** Текст в редакторе отображается шрифтом Inter.

---

## Фаза 2: Marks (форматирование текста) ✅

> **Статус:** Завершена. Все 9 marks работают через JS fallback transform engine. Найдены и исправлены 3 критических бага: (1) `resolveExtensions` не flatten'ил вложенные массивы от presets, (2) `WasmBridge.apply()` в fallback режиме не применял транзакции — реализован полный JS transform engine (~250 строк), (3) `forceFallback()` получал JS-формат документа вместо WASM-формата. Написаны 26 unit тестов и 10 E2E тестов через Playwright.

Каждый mark — это отдельный шаг. Порядок: от простого к сложному.

### Шаг 2.1: Bold ✅

**Как работает:**
1. Пользователь выделяет текст
2. Нажимает Cmd+B (или кнопку B в toolbar)
3. Расширение Bold (в `packages/core/src/extensions/marks.ts`) регистрирует keybinding: `Mod-b`
4. Handler вызывает `editor.chain().toggleBold().run()`
5. `chain.ts` → `toggleMark("bold")` → создаёт step `{ type: "addMark", blockId, from, to, mark: { type: "bold", attrs: {} } }`
6. WASM добавляет mark к spans в указанном диапазоне
7. ViewState обновляется → TextRenderer рендерит `<strong>` тег

**Файлы задействованы:**
- `packages/core/src/extensions/marks.ts` → `defineBold` extension
- `packages/core/src/chain.ts` → `toggleMark()` (строки 70-94)
- `packages/react/src/text-renderer.tsx` → рендерит mark как `<strong>`
- `packages/core/src/editor.ts` → `beforeinput` + `dispatch()`

**Что проверить:**
1. Выделить текст → Cmd+B → текст стал bold (в DOM `<strong>`)
2. Повторно Cmd+B → bold снят
3. Кнопка B в toolbar подсвечивается когда курсор в bold тексте
4. Input rule: `**text**` → bold (если включён)

**Проблемы и как их решать:**
- Текст не становится bold → проверить что `currentSelection` правильно отслеживает from/to
- WASM не применяет mark → проверить формат транзакции: `toWasmTransaction()` правильно конвертирует `addMark` step
- `<strong>` не рендерится → проверить `TextRenderer` — обрабатывает ли mark type "bold"

### Шаг 2.2: Italic ✅

Аналогично Bold. Keybinding: `Mod-i`. Mark type: `"italic"`. Tag: `<em>`.
Input rule: `*text*` → italic.

### Шаг 2.3: Underline ✅

Keybinding: `Mod-u`. Mark type: `"underline"`. Tag: `<u>`.
Нет input rule.

### Шаг 2.4: Strikethrough ✅

Keybinding: `Mod-Shift-x`. Mark type: `"strikethrough"`. Tag: `<s>`.
Input rule: `~~text~~` → strikethrough.

### Шаг 2.5: Inline Code ✅

Keybinding: `Mod-e`. Mark type: `"code"`. Tag: `<code>`.
Input rule: `` `text` `` → code.

### Шаг 2.6: Link ✅

**Дополнительная сложность:** Link имеет атрибут `href`.

**Как работает:**
1. Выделить текст → нажать кнопку Link (или Cmd+K)
2. `prompt("Enter URL:")` — запросить URL у пользователя
3. `editor.chain().setLink(href).run()` → `addMark("link", { href })`
4. TextRenderer рендерит `<a href="...">`

**Что проверить:**
1. Выделить текст → вставить ссылку → текст становится кликабельной ссылкой
2. Повторный клик на ссылку → возможность удалить link mark
3. `toolbar.activeMarks` содержит "link" когда курсор внутри ссылки

### Шаг 2.7: Highlight ✅

Mark type: `"highlight"`. Attrs: `{ color: "#dbeafe" }`.
Tag: `<mark style="background: ...">`.

5 цветов из design system. Keybinding: `Mod-Shift-h`.

### Шаг 2.8: Superscript / Subscript ✅

Mark types: `"superscript"`, `"subscript"`. Tags: `<sup>`, `<sub>`.
Эти два marks взаимоисключающие — при активации одного, другой снимается.

---

## Фаза 3: Block Types (типы блоков)

### Шаг 3.1: Paragraph (базовый)

**Уже работает.** Это блок по умолчанию. Рендерится как `<p>`.

**Проверить:** Новый блок создаётся при Enter. Пустой параграф показывает placeholder "Type '/' for commands...".

### Шаг 3.2: Heading (H1-H6)

**Как работает:**
1. Extension: `packages/core/src/extensions/heading.ts`
2. Keybindings: `Mod-Alt-1` → H1, `Mod-Alt-2` → H2, `Mod-Alt-3` → H3
3. Input rules: `# ` → H1, `## ` → H2, `### ` → H3
4. Slash commands: "Heading 1", "Heading 2", "Heading 3" в slash menu
5. Toolbar dropdown: выбор типа блока

**Что проверить:**
1. Набрать `## ` в начале строки → блок становится H2
2. Cmd+Alt+2 → текущий блок становится H2
3. В dropdown toolbar выбрать H2 → блок меняется
4. Slash menu: `/heading 2` → вставляется H2 блок

**Файлы:**
- `packages/core/src/extensions/heading.ts` — extension definition
- `packages/react/src/editor-content.tsx` — рендерит `<h1>`...`<h6>` (строки 48-55)
- `packages/core/src/chain.ts` → `setBlockType("heading", { level: 2 })`

### Шаг 3.3: Bullet List

**Как работает:**
1. Extension: `packages/core/src/extensions/bullet-list.ts`
2. Input rule: `- ` или `* ` в начале строки → создаёт bulletList + listItem
3. Keybinding: `Mod-Shift-8`
4. Toggle: `editor.chain().toggleBulletList().run()`

**Структура блоков:**
```
bulletList (children: [listItem, listItem, ...])
  listItem (content: TextSpan[])
  listItem (content: TextSpan[])
```

**Что проверить:**
1. `- ` в начале → появляется маркер списка
2. Enter в конце элемента → новый listItem
3. Enter в пустом listItem → выход из списка (обратно в paragraph)
4. Tab → indent (вложенный список)
5. Shift+Tab → outdent

### Шаг 3.4: Ordered List

Аналогично Bullet List. Input rule: `1. ` или `1) `. Keybinding: `Mod-Shift-7`.

### Шаг 3.5: Todo List

**Дополнительная сложность:** checkbox с состоянием `checked`.

**Структура:**
```
todoList (children: [todoItem, todoItem, ...])
  todoItem (attrs: { checked: false }, content: TextSpan[])
  todoItem (attrs: { checked: true }, content: TextSpan[])
```

**Что проверить:**
1. `[] ` или `[ ] ` → создаёт todo list
2. Checkbox кликабелен → меняет `checked` attr через `setBlockAttrs()`
3. Зачёркнутый текст у completed items (опционально)

### Шаг 3.6: Code Block

**Как работает:**
1. Extension: `packages/core/src/extensions/code-block.ts`
2. Input rule: ` ``` ` → codeBlock
3. Content: `string` (не TextSpan[])
4. Attrs: `{ language: "javascript" }`

**View компонент:** `packages/block-editor/src/views/code-block-view.tsx`
- Shiki syntax highlighting (lazy loaded)
- Language selector dropdown
- Copy button (копирует код в clipboard)
- Line numbers

**Что проверить:**
1. ` ```js ` → code block с подсветкой JavaScript
2. Tab внутри code block → вставляет 2 пробела (а не переключает фокус)
3. Shift+Tab → убирает 2 пробела (dedent)
4. Language dropdown → меняет подсветку
5. Copy button → код в clipboard

### Шаг 3.7: Blockquote

Input rule: `> ` → blockquote. Рендерится как `<blockquote>` с левой border accent.

### Шаг 3.8: Divider (Horizontal Rule)

Input rule: `---` → divider. Рендерится как `<hr>`.

### Шаг 3.9: Callout

Slash command: `/callout`. Attrs: `{ emoji: "💡" }`. Рендерится как box с emoji и текстом.

### Шаг 3.10: Image

**View:** `packages/block-editor/src/views/image-view.tsx`

**Полный цикл:**
1. Slash command `/image` → вставляет image block без src
2. Показывается upload zone (click или drag-and-drop)
3. Пользователь выбирает файл → `URL.createObjectURL()` для preview
4. Simulated upload progress (в prod — реальный upload handler)
5. Block attrs обновляются: `{ src, width, height }`
6. Resize handles: 8 точек, aspect ratio lock, min 50px
7. Caption: editable figcaption

**Что проверить по шагам:**
1. `/image` → upload zone видна
2. Клик → file picker → изображение отображается
3. Drag файл на upload zone → изображение отображается
4. Hover на изображение → 8 resize handles видны
5. Drag corner handle → размер меняется с сохранением пропорций
6. Shift+drag → свободное изменение размера
7. Клик на caption → можно редактировать текст

### Шаг 3.11: Table

**View:** `packages/block-editor/src/views/table-view.tsx`

**Структура:**
```
table (children: [tableRow, tableRow, ...])
  tableRow (children: [tableCell, tableCell, ...])
    tableCell (content: TextSpan[], attrs: { header: true/false })
```

**Что проверить:**
1. Slash command `/table` → таблица 3×3 с header
2. Tab → следующая ячейка
3. Shift+Tab → предыдущая ячейка
4. Tab в последней ячейке → новая строка
5. Hover на правый край → кнопка "+" (добавить столбец)
6. Hover на нижний край → кнопка "+" (добавить строку)
7. Drag border между столбцами → resize (min 100px)
8. Header row: bold текст, серый фон

### Шаг 3.12: Toggle (Details/Summary)

Рендерится как `<details><summary>`. Клик на summary → toggle open/closed.

### Шаг 3.13: Columns

Layout блок с несколькими колонками. Slash command `/columns`.

---

## Фаза 4: UI Компоненты

### Шаг 4.1: Slash Menu

**Файл:** `packages/block-editor/src/components/slash-menu.tsx`

**Как активируется:**
1. Пользователь печатает `/` в начале пустого блока
2. Extension `SlashCommands` в `behaviors.ts` ловит input rule `^/$`
3. Вызывает `editor.emit("openSlashMenu", { position })`
4. `SlashMenu` компонент слушает это событие → показывает меню

**Функциональность:**
- 4 категории: AI, Style, Insert, Upload
- Fuzzy search с scoring (prefix > substring > fuzzy)
- Highlight совпадений через `<mark>`
- Keyboard nav: Arrow Up/Down, Enter, Escape
- Viewport edge detection для позиционирования
- Выбор item → `item.execute(editor)` → вставляет блок

**Что проверить:**
1. Печатаем `/` → меню появляется
2. Печатаем `/head` → фильтруется до "Heading 1/2/3"
3. Arrow Down → выбор перемещается
4. Enter → блок вставляется, меню закрывается
5. Escape → меню закрывается
6. Клик вне меню → закрывается
7. Меню позиционируется рядом с курсором, не выходит за viewport

### Шаг 4.2: Bubble Menu ✅

> **Статус:** Завершена. Все секции работают: Block Type dropdown (Paragraph/H1-H3/Lists/Quote/Code), Formatting кнопки (B/I/U/S/Code/Link), Text Color picker (5 highlight + 5 text colors + reset), More menu (Superscript/Subscript/Clear Formatting/Copy as Markdown). Меню появляется над выделением, скрывается при снятии selection. Позиционирование с edge detection (flip below if too close to top, clamp horizontal). Mobile: fixed bottom bar.

**Файл:** `packages/block-editor/src/components/bubble-menu.tsx`

**Как активируется:**
1. Пользователь выделяет текст (selection range, не collapsed)
2. `BubbleMenu` компонент из `@gotipe/react` отслеживает selection
3. Если selection не пустая — показывает toolbar

**Секции (слева направо):**
1. **AI Improve** (✨) — если AI extension активен
2. **Block Type dropdown** — Paragraph, H1-H3, Lists, Quote, Code
3. **Formatting** — B, I, U, S, Code, Link (32×32px кнопки)
4. **Text Color** (A▾) — 5 цветов highlight + text color
5. **More** (⋮) — Superscript, Subscript, Clear Formatting, Copy as Markdown

**Что проверить:**
1. Выделить текст → bubble menu появляется над selection
2. B → текст bold (подсвечивается если уже bold)
3. Block Type dropdown → выбрать H2 → блок меняет тип
4. Color picker → выбрать цвет → текст подсвечен
5. More → Clear Formatting → все marks сняты
6. Menu исчезает при снятии selection

### Шаг 4.3: Block Toolbar (Drag Handle + Add + Context Menu)

**Файл:** `packages/block-editor/src/components/block-toolbar.tsx`

**Как работает:**
1. При hover на блок — слева появляется toolbar с двумя кнопками:
   - `+` (Add) → вставляет новый paragraph после этого блока
   - `⠿` (Drag Handle) → drag-and-drop ИЛИ click → context menu

**Drag and Drop:**
1. Зажатие `⠿` → `draggable=true`, `dataTransfer.setData("text/gotipe-block-id", blockId)`
2. При drag-over других блоков → drop indicator (2px accent линия)
3. Drop → `editor.chain().moveBlock(blockId, targetIndex).run()`

**Context Menu (click на ⠿):**
- Delete → `editor.chain().deleteBlock(blockId).run()`
- Duplicate → `editor.chain().duplicateBlock(blockId).run()`
- Reset Formatting → `editor.chain().setBlockType("paragraph").run()`
- Copy to Clipboard → `navigator.clipboard.writeText(...)`

**Что проверить:**
1. Hover на блок → toolbar видна слева
2. `+` клик → новый параграф ниже
3. Drag `⠿` → блок перетаскивается, indicator показывает куда
4. Drop → блок перемещён
5. Click `⠿` → context menu
6. Delete → блок удалён
7. Duplicate → копия блока ниже

### Шаг 4.4: AI Command Bar

**Файл:** `packages/block-editor/src/components/ai-command-bar.tsx`

**Как активируется:** `Cmd+K` (или всегда видим в Agent Editor)

**Функциональность:**
1. Input с placeholder "Tell AI what to change..."
2. Enter → `editor.emit("executeAiCommand", { commandId: "freeText", prompt })`
3. AI extension обрабатывает команду → генерирует текст
4. Escape → закрывает

**Что проверить:**
1. Cmd+K → bar появляется, input в фокусе
2. Печатаем промпт → Enter → AI обрабатывает
3. Escape → закрывается
4. Клик вне → закрывается

### Шаг 4.5: Suggestion Toolbar (AI Proofread)

**Файл:** `packages/block-editor/src/components/suggestion-toolbar.tsx`

**Когда видна:** После AI Proofread → найдены suggestions

**Функциональность:**
- Counter: `1/5`
- Navigation: `◄` `►`
- Accept / Reject текущую suggestion
- Accept All / Reject All

### Шаг 4.6: Comment Sidebar

**Файл:** `packages/block-editor/src/components/comment-sidebar.tsx`

**Функциональность:**
- Filter tabs: Open (N) / Resolved (N)
- Comment threads: author, timestamp, body, quoted text
- Reply input в каждом thread
- Resolve/Unresolve
- Navigation: ◄ 2/7 ►
- Scroll-to-anchor: клик на comment → скролл к тексту в редакторе

### Шаг 4.7: Theme Toggle

**Файл:** `packages/block-editor/src/components/theme-toggle.tsx`

**Функциональность:**
- 3 режима: Light, Dark, System
- Интеграция с `@gotipe/theme`: `getTheme()`, `setTheme()`, `onThemeChange()`
- Ставит `data-theme="dark"` на `<html>`

---

## Фаза 5: Toolbar в playground (StaticToolbar)

### Шаг 5.1: Реактивное состояние toolbar

**Файл:** `apps/playground/src/shared/toolbar.tsx`

**Как работает:**
```tsx
const toolbar = useEditorState<ToolbarState>(editor, (state) => state.toolbar);
```

`useEditorState` подписывается на `viewStateChange` → при каждом изменении state вызывает selector → возвращает:
```ts
{
  activeMarks: ["bold", "italic"],   // какие marks активны на курсоре
  activeBlockType: "heading",        // тип текущего блока
  activeBlockAttrs: { level: 2 },    // attrs текущего блока
  canUndo: true,                     // можно ли undo
  canRedo: false,                    // можно ли redo
}
```

**Что проверить:**
1. Поставить курсор в bold текст → кнопка B подсвечена
2. Поставить курсор в heading → dropdown показывает "Heading 2"
3. Undo что-то → кнопка Undo активна
4. Undo всё → кнопка Undo disabled

### Шаг 5.2: Кнопки форматирования

Каждая кнопка:
```tsx
<button
  className={`gotipe-toolbar-btn ${isMarkActive('bold') ? 'active' : ''}`}
  onClick={() => editor.chain().toggleBold().run()}
>
```

### Шаг 5.3: Dropdown типа блока

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

### Шаг 5.4: Insert dropdown

Table, Code Block, Blockquote, Divider, Callout — каждый через `insertBlockAfter()` или `setBlockType()`.

---

## Фаза 6: AI Features

### Шаг 6.1: AI Provider Interface

**Файл:** `packages/ai/src/extension.ts`

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

Все методы — async/streaming. Mock provider в playground использует `delay()` + `yield` для симуляции.

### Шаг 6.2: Level 1 — Ghost Text (Autocomplete)

**Extension:** `defineAi`

**Как работает:**
1. Пользователь останавливается печатать (debounce ~500ms)
2. AI extension собирает context (окружающие блоки)
3. Вызывает `provider.generateCompletion(context)`
4. Provider стримит текст token за token
5. Полученный текст показывается как ghost decoration (серый текст после курсора)
6. Tab → принимает ghost text (вставляет в документ)
7. Escape / продолжение печати → ghost text исчезает

**Что проверить:**
1. Остановиться печатать → через 500ms появляется серый suggestion text
2. Tab → текст вставлен
3. Escape → suggestion исчез
4. Продолжаем печатать → suggestion исчез

### Шаг 6.3: Level 2 — AI Context (Improve + Continue Writing)

**Extension:** `defineAiContext`

**"Improve" (в Bubble Menu):**
1. Выделить текст → Bubble Menu → ✨ Improve
2. `editor.emit("executeAiCommand", { commandId: "rewrite" })`
3. AI extension берёт выделенный текст
4. Вызывает `provider.streamRewrite(text, context)`
5. Показывает результат как suggestion (зелёный highlight = добавление, серый strikethrough = удаление)
6. Accept / Reject

**"Continue Writing" (в Slash Menu):**
1. `/continue` или "/Continue Writing"
2. AI генерирует следующий параграф
3. Текст стримится word по word в новый блок

### Шаг 6.4: Level 3 — AI Agent

**Extension:** `defineAiAgent`

**Proofread:**
1. Кнопка "Proofread" в AI sidebar
2. `editor.emit("executeAiCommand", { commandId: "proofread" })`
3. AI сканирует весь документ
4. Возвращает массив suggestions: `[{ blockId, from, to, originalText, suggestedText, reason }]`
5. Suggestions отображаются как inline decorations (зелёный = предложение, серый = оригинал)
6. Suggestion Toolbar появляется: `1/5 ◄ ► [Accept All] [Reject All]`

**AI Comments (Review):**
1. Кнопка "Add AI Comment" в AI sidebar
2. AI анализирует документ
3. Возвращает комментарии: `[{ blockId, content, type: "suggestion" | "note" }]`
4. Комментарии появляются в Comment Sidebar

**Add Paragraph:**
1. Кнопка "Add new paragraph" → промпт "about the topic"
2. AI генерирует текст → стримит в новый блок после текущего

**Rewrite Selection:**
1. Кнопка "Adjust text selection"
2. AI берёт выделенный текст → перепишет → показывает как suggestion

### Шаг 6.5: AI Status Indicator

**Файл:** `packages/block-editor/src/components/ai-status-indicator.tsx`

Во время работы AI показывает footer bar: "Proofreading...", "Generating...", "Reviewing..."

---

## Фаза 7: Collaboration

### Шаг 7.1: CRDT Sync

**Файл:** `packages/collaboration/src/extension.ts`

**Как работает:**
1. `defineCollaboration.configure({ wsUrl, documentId, token, user })`
2. При подключении: `WasmBridge.enableCollaboration(peerId)`
3. WebSocket binary protocol (НЕ JSON):
   - Message types: 0x01 (sync step), 0x02 (awareness), 0x03 (update), etc.
   - zstd compression
4. Каждый `dispatch()` генерирует CRDT update → отправляет по WebSocket
5. Входящие updates: `WasmBridge.receiveUpdate(binary)` → новый state

### Шаг 7.2: Remote Cursors

**Файл:** `packages/block-editor/src/components/collaboration-cursors.tsx`

Decorations с `type: "remote-cursor"` → рендерятся как цветные метки с именем пользователя.

### Шаг 7.3: Awareness

Позиция курсора каждого пользователя передаётся через awareness protocol.

---

## Фаза 8: Export

### Шаг 8.1: HTML Export

```ts
editor.getHTML() → WasmBridge.exportHtml()
```

WASM конвертирует Block[] → HTML string. Sanitization через ammonia (Rust).

### Шаг 8.2: Markdown Export

```ts
editor.getMarkdown() → WasmBridge.exportMarkdown()
```

### Шаг 8.3: JSON Export

```ts
editor.getJSON() → WasmBridge.getState()
```

Возвращает `{ version: 1, blocks: [...] }` — можно сохранить и загрузить обратно.

---

## Фаза 9: Polish и Edge Cases

### Шаг 9.1: Keyboard Shortcuts

Полный список из extensions:
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

### Шаг 9.2: Input Rules

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

### Шаг 9.3: Clipboard (Copy/Paste)

**Файл:** `packages/core/src/editor.ts` → `ClipboardHandler`

- Copy: выделенный текст → `text/plain` + `text/html` + `application/x-gotipe` (internal format)
- Paste: если `application/x-gotipe` → вставить blocks. Если HTML → sanitize через WASM → parse → вставить. Если plain text → вставить как текст.
- Cut: Copy + Delete

### Шаг 9.4: Accessibility

- `role="textbox"`, `aria-multiline="true"` на editor
- `aria-label` на всех кнопках
- Keyboard navigation во всех меню (Arrow Up/Down, Enter, Escape)
- Focus management при открытии/закрытии меню
- `aria-live="polite"` на AI status indicator
- Semantic HTML: `<h1>`-`<h6>`, `<ul>`, `<ol>`, `<blockquote>`, `<table>`, `<details>`

---

## Порядок реализации (рекомендуемый)

- [x] 1. Фаза 0: Шаги 0.1-0.6 — Базовое редактирование работает
- [x] 2. Фаза 1: Шаги 1.1-1.3 — Design tokens + тёмная тема + Inter
- [x] 3. Фаза 2: Шаги 2.1-2.8 — Все marks работают
- [x] 4. Фаза 3: Шаги 3.1-3.4 — Paragraph + Heading + Lists
- [x] 5. Фаза 3: Шаги 3.5-3.8 — Todo + CodeBlock + Blockquote + Divider
- [x] 6. Фаза 3: Шаги 3.9-3.13 — Callout + Image + Table + Toggle + Columns
- [x] 7. Фаза 4: Шаг 4.1 — Slash Menu
- [x] 8. Фаза 4: Шаг 4.2 — Bubble Menu
- [x] 9. Фаза 4: Шаг 4.3 — Block Toolbar + Drag & Drop
- [x] 10. Фаза 5: Шаги 5.1-5.4 — Static Toolbar в playground
- [x] 11. Фаза 6: Шаги 6.1-6.5 — AI Features
- [x] 12. Фаза 7: Шаги 7.1-7.3 — Collaboration
- [x] 13. Фаза 8: Шаги 8.1-8.3 — Export
- [x] 14. Фаза 9: Шаги 9.1-9.4 — Polish

Каждый шаг можно делать как отдельный PR. Проверяем перед переходом к следующему.
