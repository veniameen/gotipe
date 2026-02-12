# Tiptap Editor — Полный анализ функционала

> **Дата исследования:** 12 февраля 2026  
> **Источник:** https://tiptap.dev/  
> **Метод:** прокликивание всех элементов, ввод текста, скриншоты каждого состояния

---

## 0) Важная поправка: у Tiptap нет "единственного внешнего вида"

Tiptap — **headless редактор**: ядро даёт схему документа + команды + плагины/расширения, а "как выглядит" (тулбары, меню, поповеры, блок-меню) — это UI, который вы делаете сами или берёте из **Tiptap UI Components / Templates**.

Поэтому корректно анализировать нужно в **2 слоя**:

1. **Editor capabilities** (что умеет движок и расширения)
2. **Reference UI/UX** (как это упаковано в официальных шаблонах)

На главной странице tiptap.dev представлены **4 варианта редактора**, каждый демонстрирует разный уровень кастомизации:

| Вариант | Назначение | Уровень UI |
|:--------|:-----------|:-----------|
| **Agent editor** | AI-native редактирование, Cursor-like | Максимальный (AI + comments + diffs) |
| **Notion-like editor** | Блочный редактор с drag & drop | Высокий (slash-меню, drag handle, bubble menu) |
| **Simple editor** | Готовый к продакшену шаблон | Средний (полированный тулбар) |
| **Headless editor** | Демо "голого" API | Минимальный (текстовые кнопки) |

---

## 1) Agent Editor — AI-native редактор

### Скриншот
![Agent editor — AI Toolkit](./agent_editor_recording.webp)

### 1.1 Компоновка интерфейса

Agent Editor состоит из **4 основных зон**:

| Зона | Описание |
|:-----|:---------|
| **Верхний тулбар** | Комплексный набор инструментов форматирования |
| **AI Toolkit (дропдаун)** | Меню с предзаполненными AI-экшенами |
| **Область редактирования** | Rich-text канва с контентом |
| **AI Command Bar (снизу)** | Плавающий инпут для кастомных AI-инструкций |

### 1.2 AI Toolkit — подробное описание каждой функции

#### "AI Toolkit examples" — дропдаун в левом верхнем углу

При клике открывается список AI-действий:

---

##### ① Add AI Comment
- **Что делает:** AI анализирует документ и оставляет **контекстные комментарии** — прямо как ревьюер.
- **Визуал:** В тексте появляется подчёркивание/выделение (например, "[Your University or Research Center]"), а на правом поле — **пузырёк комментария** (comment bubble).
- **При клике на пузырёк:** Открывается **поповер** с текстом комментария:
  - Пример: *"Please specify the official name of your institution here"*
  - Кнопки: **Reply** (ответить), **Resolve** (закрыть тред)
  - Навигация: стрелки для переключения между несколькими комментариями (prev/next)
- **UX-паттерн:** Полноценные треды, как в Google Docs / Word Online.
- **Применение:** Code review, peer review, совместное редактирование.

---

##### ② Add New Paragraph
- **Что делает:** AI генерирует **новый параграф**, контекстно релевантный существующему тексту.
- **Визуал:** Новый текст появляется как **"зелёное предложение" (diff-view)**:
  - Зелёным подсвечен добавляемый текст
  - Серым со зачёркиванием — удаляемый текст
- **Кнопки:** **Accept** (принять) / **Reject** (отклонить)
- **UX-паттерн:** "Track Changes" / "Suggestions" — как в Google Docs / Word. Пользователь **сам решает**, принять или отклонить.

---

##### ③ Proofread
- **Что делает:** AI сканирует **весь документ** на ошибки (опечатки, грамматика, стиль).
- **Визуал:**
  - **Зелёные хайлайты** — предлагаемые исправления (additions)
  - **Серые зачёркивания** — то, что предлагается удалить (deletions)
  - Пример: "giaging" → "aging", "nueral" → "neural", "Metabolm" → "Metabolism"
- **Suggestion Toolbar (снизу):**
  - Счётчик: **"1/12"** — показывает текущую и общее количество найденных правок
  - Стрелки ◀ ▶ — навигация между предложениями
  - **Accept all** — принять все исправления
  - **Reject all** — отклонить все

---

#### AI Command Bar (нижняя панель)

- **Плавающий инпут:** "Tell AI what else needs to be changed..."
- **При клике:** Расширяется область ввода для свободного текста.
- **Пример команды:** "Summarize this page in one sentence."
- **Результат:** AI интеллектуально модифицирует документ:
  - Может заменить заголовок ("ABSTRACT" → "EXECUTIVE SUMMARY")
  - Вставить суммаризированный параграф
  - Результат опять же показывается как **suggestion для одобрения**
- **Индикатор статуса:** При работе AI в футере появляется анимация *"Using AI toolkit"*

### 1.3 Стандартный тулбар Agent Editor

| Кнопка | Функция | Детали |
|:-------|:--------|:-------|
| **B** | Bold (жирный) | Cmd+B / Ctrl+B |
| **I** | Italic (курсив) | Cmd+I / Ctrl+I |
| **S** | Strikethrough (зачёркивание) | — |
| **U** | Underline (подчёркивание) | — |
| **Highlight** | Выделение маркером | Жёлтый фон |
| **Headings** | Дропдаун: H1, H2, H3, H4 | Уровни заголовков |
| **Lists** | Bullet / Ordered / Checkbox | 3 типа списков |
| **Alignment** | Left / Center / Right / Justify | 4 варианта выравнивания |
| **Zoom** | Масштаб документа | Например 100% |
| **Custom Components** | Вставка сложных UI-элементов | Компоненты прямо в текст |

### 1.4 Ключевая философия Agent Editor

> **"Human-in-the-loop"** — AI выступает как **умный помощник**, который предлагает правки, оставляет заметки и следует инструкциям. Финальное решение **всегда за человеком** через Accept/Reject workflow.

### 1.5 Дизайн и UI-структура (Agent Specific)

- **Layout:** Трехколоночная сетка (Sidebar левый / Canvas центр / Sidebar правый для комментов)
- **Canvas (область редактора):**
  - Не имеет явных границ (border: none)
  - Фон: прозрачный
  - Типографика: `DM Sans`
  - Отступы: асимметричные, с местом под комментарии справа
- **Floating Command Bar:**
  - Позиционирование: `fixed` внизу по центру
  - Скругление: `50px` (полный pill-shape)
  - Тень: глубокая `box-shadow` (elevated)
  - Ширина: адаптивная, ~600px
  - Анимация: плавает с `backdrop-filter: blur`
- **AI Sidebar:**
  - Фиксированная ширина слева
  - Фон: светлый серый / прозрачный
  - Разделитель: тонкий border-right

---

## 2) Notion-like Editor — Блочный редактор

### Скриншот
![Notion-like editor](./notion_editor.png)

### 2.1 Компоновка интерфейса

- **Документ-канва:** Одна колонка контента, чистый белый/тёмный фон.
- **Верхняя панель:**
  - **Undo/Redo** (стрелки отмены/повтора)
  - **Переключатель темы** (☀️ / 🌓 — Light / Dark mode)
  - **Аватары коллабораторов** (real-time presence)
- **Gutter (левая область):** При наведении на блок появляются **две кнопки**:
  - **`+` (плюсик)** — открывает дропдаун вставки нового блока (slash-меню)
  - **`⠿` (drag handle)** — открывает контекст-меню блока / позволяет перетаскивать
- **Плавающие плейсхолдеры:** При пустом блоке — "Write, type '/' for commands..."

### 2.2 Дропдаун вставки блока (`+` плюсик и `/` slash-команды)

Одно и то же меню можно вызвать **двумя способами**:

| Триггер | Где | Описание |
|:--------|:----|:---------|
| **Кнопка `+`** | Левый gutter (появляется при наведении на блок) | Клик → открывается дропдаун |
| **Символ `/`** | В пустой строке набрать `/` | Появляется то же самое меню |

Меню содержит **4 категории** с разделителями:

#### 🤖 AI
| Команда | Описание |
|:--------|:---------|
| `Continue Writing` | AI продолжает написание на основе существующего текста |
| `Ask AI` | Промпт-интерфейс для кастомной генерации |

#### 🎨 Style (Типы блоков)
| Команда | Описание |
|:--------|:---------|
| `Text` | Обычный параграф |
| `Heading 1` | Заголовок первого уровня |
| `Heading 2` | Заголовок второго уровня |
| `Heading 3` | Заголовок третьего уровня |
| `Bullet List` | Маркированный список |
| `Numbered List` | Нумерованный список |
| `To-do list` | Чеклист с чекбоксами (task list) |
| `Blockquote` | Блоковая цитата |
| `Code Block` | Блок кода с подсветкой синтаксиса |

#### 📎 Insert (Вставка)
| Команда | Описание |
|:--------|:---------|
| `Mention` | Вставка упоминания пользователя (`@name`) |
| `Emoji` | Вставка эмодзи через пикер |
| `Table` | Вставка настраиваемой таблицы |
| `Separator` | Горизонтальная линия-разделитель (`<hr>`) |
| `Table of contents` | Автосгенерированное оглавление по заголовкам |

#### 📤 Upload (Загрузка)
| Команда | Описание |
|:--------|:---------|
| `Image` | Загрузка изображения (upload / drag & drop) |

### 2.3 Floating Selection Toolbar (Bubble Menu)

Появляется **при выделении текста**. Содержит:

| Кнопка | Функция |
|:-------|:--------|
| **AI 'Improve'** | AI улучшает выделенный текст |
| **Block Type** | Дропдаун текущего типа блока (Heading 1, Text и т.д.) — позволяет переключать |
| **Bold** | Жирный |
| **Italic** | Курсив |
| **Underline** | Подчёркивание |
| **Strikethrough** | Зачёркивание |
| **Code** | Инлайн-код |
| **Link** | Добавление/редактирование гиперссылки |
| **Text Color** | Пикер цвета текста (иконка "A" с цветной полосой) |
| **More Options** | Вертикальное многоточие (⋮) — дополнительные действия |

### 2.4 Drag Handle & Block Context Menu

**При наведении на блок** слева появляется **шеститочечная ручка** (`⠿`).

**При клике на ручку** открывается **контекст-меню блока:**

| Пункт | Описание |
|:------|:---------|
| **Duplicate** | Клонирование всего блока |
| **Delete** | Удаление блока |
| **Reset Formatting** | Сброс всех стилей текста внутри блока |
| **Copy to Clipboard** | Копирование содержимого блока |
| **Drag & Drop** | Ручка также позволяет **перетаскивать** блоки вверх/вниз |

### 2.5 Инлайн-триггеры (шорткаты прямо в тексте)

Помимо меню `+`/`/`, есть **инлайн-шорткаты**, которые работают прямо при вводе текста:

| Триггер | Функция | UX |
|:--------|:--------|:---|
| **`@`** | Mentions (упоминания) | Появляется дропдаун с именами тиммейтов (Cyndi Lauper, Joan Jett…) |
| **`:`** | Emoji picker | Поиск по эмодзи (`:smile` → 😀) |

> **Примечание:** Mention и Emoji также доступны через дропдаун `+`/`/` (категория **Insert**), но инлайн-триггеры `@` и `:` — это быстрый шорткат.

### 2.6 Темы и коллаборация

- **Dark Mode:** Полная поддержка, все меню и ручки адаптируются
- **Collaboration:** Вертикальные маркеры в правой части + аватары в верхней панели = real-time editing
- **Interactive Placeholders:** Изображения и видео показывают промпт "upload" / "embed" до загрузки контента

### 2.7 Дизайн и UI-структура (Notion-like Specific)

- **Контейнер:**
  - Максимальная ширина текста: ~708px (стандарт для читаемости)
  - Выравнивание: по центру экрана (`margin: 0 auto`)
- **Визуальный стиль:**
  - **Полный минимализм:** нет видимых границ редактора (no border)
  - **Отступы:** большие (`padding-top: 48px `), создают "воздух"
- **Drag Handle (`⠿`):**
  - Появляется в `fixed` или `absolute` позиции слева от блока (-24px offset)
  - Размер кликабельной зоны: `24px` × высока строки
  - Цвет иконок: `rgba(0,0,0, 0.4)` → при ховере темнее
- **Slash-меню:**
  - `border-radius: 20px`
  - `width: 320px`
  - `box-shadow`: Soft elevation (`0 10px 40px rgba(...)`)
  - Айтемы меню: `padding: 4px 8px`, `border-radius: 6px` при ховере

---

## 3) Simple Editor — Готовый к продакшену шаблон

### Скриншот
![Simple editor](./simple_editor.png)

### 3.1 Компоновка интерфейса

- **Канва:** Просторная белая область с предзагруженным контентом ("Getting started")
- **Тулбар:** Чистый, центрированный, со стилизованными иконками и hover-состояниями
- **Переключатель темы:** ☀️/🌓 (Light/Dark) справа на тулбаре

### 3.2 Тулбар — каждая кнопка

Слева направо:

| # | Иконка | Функция | Подробности |
|:--|:-------|:--------|:------------|
| 1 | ↶ | **Undo** | Отмена действия |
| 2 | ↷ | **Redo** | Повтор действия |
| 3 | H▾ | **Heading dropdown** | 4 уровня: H1, H2, H3, H4 |
| 4 | ☰▾ | **List dropdown** | Bullet list, Ordered list |
| 5 | ❝ | **Blockquote** | Обёртка текста в цитату |
| 6 | **B** | **Bold** | Жирный шрифт |
| 7 | *I* | **Italic** | Курсив |
| 8 | ~~S~~ | **Strike** | Зачёркивание |
| 9 | `</>` | **Code** | Инлайн-код |
| 10 | U | **Underline** | Подчёркивание |
| 11 | 🖍 | **Highlight** | Выделение маркером |
| 12 | 🔗 | **Link** | Вставка/редактирование ссылки (появляется промпт для URL) |
| 13 | x² | **Superscript** | Верхний индекс |
| 14 | x₂ | **Subscript** | Нижний индекс |
| 15 | ≡← | **Align left** | Выравнивание по левому краю |
| 16 | ≡ | **Align center** | По центру |
| 17 | ≡→ | **Align right** | По правому краю |
| 18 | ≡↔ | **Align justify** | По ширине |
| 19 | 🖼 **+ Add** | **Image upload** | Открывает зону загрузки (drag & drop / click), лимит 3 файла × 5МБ |
| 20 | ☀️ | **Theme toggle** | Переключение Light / Dark mode |

### 3.3 Heading Dropdown
![Heading dropdown](./simple_heading_dropdown.png)

При клике на H▾ открываются уровни:
- **Heading 1** — самый крупный
- **Heading 2**
- **Heading 3**
- **Heading 4** — самый мелкий

### 3.4 List Dropdown
![List dropdown](./simple_list_dropdown.png)

- **Bullet list** — маркированный
- **Ordered list** — нумерованный

### 3.5 Image Upload
![Image upload zone](./simple_image_upload.png)

При клике на "+ Add" в тулбаре:
- Появляется **зона загрузки** внутри редактора
- "Click to upload or drag and drop"
- **Лимит:** 3 файла, каждый до 5 МБ

### 3.6 Контент по умолчанию

Предзагруженный контент демонстрирует:
- **Заголовок H1:** "Getting started"
- **Параграфы** с **bold** и *italic* текстом
- **Ссылку:** "Tiptap UI Components docs"
- **Код-блок:** `npx @tiptap/cli init`
- **Заголовок H2:** "Features"
- **Blockquote** с маркдаун-шорткатами и клавиатурными сочетаниями (`**`, `⌘+B`)

### 3.7 Ключевые особенности

- ✅ Поддержка **Markdown-шорткатов** (ввод `**` для bold, `*` для italic и т.д.)
- ✅ **Типографские автозамены** (`->` → `→`)
- ✅ **MIT-лицензия** с open source UI-компонентами
- ✅ Готово к встраиванию через `npx @tiptap/cli init`

### 3.8 Дизайн и UI-структура (Simple Specific)

В отличие от Notion-like, этот редактор оформлен как **единая карточка**:

- **Контейнер (Wrapper):**
  - **Border:** `1px solid rgba(0,0,0, 0.1)` (тонкая рамка)
  - **Border-radius:** `16px` (скругление всего редактора)
  - **Box-shadow:** лёгкая тень или отсутствует (плоский стиль)
- **Тулбар:**
  - Прижат к верху (`border-bottom: 1px solid ...`)
  - Sticky-позиционирование (в некоторых реализациях)
- **Кнопки:**
  - Скругление: `8px` или `12px` (мягкий квадрат)
  - Состояние Active: фон `rgba(0,0,0, 0.05)` или цвет бренда
- **Зона контента:**
  - Внутренние отступы: `padding: 24px`
  - Ограничение ширины: часто на всю ширину контейнера

---

## 4) Headless Editor — «Голое» API без стилей

### Скриншот
![Headless editor](./headless_editor.png)

### 4.1 Компоновка интерфейса

- **Тулбар:** Плотный ряд **текстовых кнопок** без иконок (только слова)
- **Канва:** Базовый белый фон с текстом, списками и кодовым блоком (тёмный фон)
- **Активное состояние:** Подсвечено **фиолетовым** (например, H2 при наведении на заголовок уровня 2)

### 4.2 Все кнопки — полный список

**Первый ряд:**

| Кнопка | Функция | Описание |
|:-------|:--------|:---------|
| **Bold** | toggleBold | Жирный |
| **Italic** | toggleItalic | Курсив |
| **Strike** | toggleStrike | Зачёркивание |
| **Code** | toggleCode | Инлайн-код |
| **Clear marks** | unsetAllMarks | Удаление **всех** инлайн-стилей (bold, italic, code…) с выделения |
| **Clear nodes** | clearNodes | Сброс блока в стандартный параграф (heading → paragraph, list → paragraph) |
| **Paragraph** | setParagraph | Установка блока как обычный текст |
| **H1** | toggleHeading level:1 | Заголовок 1 |
| **H2** | toggleHeading level:2 | Заголовок 2 |
| **H3** | toggleHeading level:3 | Заголовок 3 |
| **H4** | toggleHeading level:4 | Заголовок 4 |
| **H5** | toggleHeading level:5 | Заголовок 5 |
| **H6** | toggleHeading level:6 | Заголовок 6 |
| **Bullet list** | toggleBulletList | Маркированный список |
| **Ordered list** | toggleOrderedList | Нумерованный список |
| **Code block** | toggleCodeBlock | Блок кода (многострочный, с тёмным фоном) |

**Второй ряд:**

| Кнопка | Функция | Описание |
|:-------|:--------|:---------|
| **Blockquote** | toggleBlockquote | Блок-цитата |
| **Horizontal rule** | setHorizontalRule | Горизонтальная линия `<hr>` |
| **Hard break** | setHardBreak | Принудительный перенос строки `<br>` |
| **Undo** | undo | Отмена (может быть disabled) |
| **Redo** | redo | Повтор (может быть disabled) |

### 4.3 Тестирование функций

#### Clear marks — удаление инлайн-стилей
![Clear marks test](./headless_cleared_marks.png)
- Выделяем текст с bold/italic → нажимаем "Clear marks" → все стили сбрасываются, остаётся plain text.
- Также при тесте был добавлен Horizontal rule — появляется линия-разделитель.

#### Clear nodes — сброс типа блока
![Clear nodes + Code block](./headless_codeblock.png)
- H1 заголовок → "Clear nodes" → становится обычным параграфом
- Затем "Code block" → параграф трансформируется в блок кода

#### H1 — смена уровня заголовка
![H1 applied](./headless_h1_applied.png)
- H2 ("Hi there,") → клик на "H1" → текст увеличивается, меняется семантика

### 4.4 Контент по умолчанию

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

### 4.5 Ключевые отличия Headless от остальных

| Характеристика | Headless | Simple | Notion-like | Agent |
|:---------------|:---------|:-------|:------------|:------|
| UI-стиль | Текстовые кнопки | Иконки | Контекстные меню | AI-панели |
| Заголовки | **H1–H6** (индивидуально) | H1–H4 (дропдаун) | H1–H3 (slash + bubble) | H1–H4 (дропдаун) |
| Медиа | ❌ Нет | ✅ Upload зона | ✅ Slash-команда | ❌ Нет (фокус на AI) |
| Темы | ❌ Только light | ✅ Light/Dark | ✅ Light/Dark | ✅ Light/Dark |
| AI | ❌ Нет | ✅ Continue/Ask AI | ✅ Improve в bubble | ✅ Полный AI Toolkit |
| Утилиты | Clear marks, Clear nodes, Hard break | — | — | — |
| **Назначение** | Демо для разработчиков | Готовый продукт | Клон Notion | AI-агент |

---

## 5) Дизайн-система и CSS-токены (Design Tokens)

> Все значения получены программно через `getComputedStyle()` и парсинг CSS-переменных на `tiptap.dev` и `template.tiptap.dev`.

### 5.1 CSS Custom Properties (`--tiptap-*` и `--tt-*`)

#### Брендовый цвет

```css
--tt-brand-color-500: rgba(98, 41, 255, 1)   /* #6229FF — фиолетовый, основной акцент */
```

Используется для: активное состояние кнопок, фокус-бордеры инпутов, image handles, upload-зона.

#### Border-radius (система скруглений)

```css
--tt-radius-sm:  0.375rem   /*  6px */
--tt-radius-md:  0.5rem     /*  8px */
--tt-radius-lg:  0.75rem    /* 12px */
--tt-radius-xl:  1rem       /* 16px */
```

| Элемент | border-radius | Токен |
|:--------|:-------------|:------|
| **Кнопки тулбара** | `12px` | `--tt-radius-lg` |
| **Карточки/дропдауны** (slash-меню, поповеры) | `20px` | Кастомный (больше `--tt-radius-xl`) |
| **Headless-кнопки** | `8px` | `--tt-radius-md` |
| **Чекбоксы, мелкие элементы** | `6px` | `--tt-radius-sm` |

#### Тени (box-shadow)

```css
--tt-shadow-elevated-md:
  0px 16px 48px 0px rgba(17, 24, 39, 0.04),
  0px 12px 24px 0px rgba(17, 24, 39, 0.04),
  0px  6px  8px 0px rgba(17, 24, 39, 0.02),
  0px  2px  3px 0px rgba(17, 24, 39, 0.02);
```

- **4-слойная мягкая тень** — создаёт эффект "парящего" элемента без резких контуров
- Используется для: slash-меню, bubble menu, все поповеры и дропдауны
- Серый оттенок `rgba(17,24,39)` — почти чёрный, но очень прозрачный (2–4%)

#### Тулбар

```css
--tt-toolbar-bg-color: rgba(255, 255, 255, 1)   /* Белый фон */
--tt-toolbar-height: 2.75rem                      /* 44px */
```

#### AI-компоненты

```css
--tiptap-ai-loading-background-color:    rgba(37, 39, 45, 0.1)
--tiptap-ai-prompt-border-color:         rgba(37, 39, 45, 0.1)
--tiptap-ai-prompt-focused-border-color: rgba(98, 41, 255, 1)   /* Brand violet */
--tiptap-ai-prompt-input-bg-color:       rgba(255, 255, 255, 1)
--tiptap-ai-prompt-input-border-color:   rgba(37, 39, 45, 0.1)
--tiptap-ai-prompt-input-focused-border-color: rgba(98, 41, 255, 1)
--tiptap-ai-prompt-input-content-placeholder:  rgba(40, 44, 51, 0.42)
```

#### Аватары и коллаборация

```css
--tiptap-avatar-border-color:      rgba(255, 255, 255, 1)
--tiptap-avatar-fallback-bg-color: rgba(234, 234, 235, 1)
--tiptap-avatar-fallback-text-color: rgba(36, 39, 46, 0.78)
```

#### Карточки (slash-меню, поповеры)

```css
--tiptap-card-bg-color:     rgba(255, 255, 255, 1)
--tiptap-card-border-color: rgba(15, 22, 36, 0.05)   /* Почти невидимый бордер */
```

#### Image upload

```css
--tiptap-image-handle-bg:    rgba(84, 0, 229, 1)   /* Тёмно-фиолетовый */
--tiptap-image-upload-active: rgba(98, 41, 255, 1)
--tiptap-image-upload-border: rgba(47, 50, 55, 0.2)
```

### 5.2 Типографика

| Контекст | Шрифт | Размер | Line-height | Вес |
|:---------|:------|:-------|:------------|:----|
| **Контент редактора** (Simple, Notion-like) | `"DM Sans", sans-serif` | `16px` | `24px` (1.5) | `400` (normal) |
| **Headless редактор** | `Inter, ui-sans-serif, system-ui, …` | `16px` | `24px` | `400` |
| **Кнопки UI** | `Inter, ui-sans-serif, system-ui, …` | `14px` | `20px` | `500` (medium) |
| **Заголовок H1** | `"DM Sans"` | `30px` | `36px` | `700` (bold) |
| **Текст лейблов в меню** | `Inter` | `14px` | `20px` | `400` |
| **Лейблы категорий** (AI, Style, Insert) | `Inter` | `12px` | `16px` | `600` (semibold) |

> **DM Sans** — Google Font, геометрический sans-serif. Используется для **контента** (то, что пишет пользователь).  
> **Inter** — Google Font, нео-гротескный sans-serif. Используется для **UI** (кнопки, меню, лейблы).

### 5.3 Цветовая палитра

#### Основные цвета интерфейса

| Назначение | Light Mode | Dark Mode (приблиз.) |
|:-----------|:-----------|:---------------------|
| **Фон страницы** | `#FFFFFF` (`rgb(255,255,255)`) | `#1A1A1E` |
| **Текст основной** | `#222325` (`rgb(34,35,37)`) | `#E8E8E8` |
| **Текст приглушённый** | `rgba(40,44,51, 0.42)` | `rgba(200,200,210, 0.5)` |
| **Акцент (brand)** | `#6229FF` (`rgba(98,41,255,1)`) | `#6229FF` |
| **Фон карточек** | `#FFFFFF` | `#2A2A2E` |
| **Бордер карточек** | `rgba(15,22,36, 0.05)` | `rgba(255,255,255, 0.08)` |
| **Hover кнопок** | `rgba(61,37,20, 0.08)` | `rgba(255,255,255, 0.1)` |
| **Иконки** | `rgba(40,44,51, 0.42)` | `rgba(200,200,210, 0.6)` |

#### Палитра выделений (Highlight Colors)

| Цвет | Background | Text Color |
|:-----|:-----------|:-----------|
| 🔵 **Blue** | `#E0F2FE` | `hsl(202, 54%, 43%)` |
| 🟢 **Green** | `#DCFCE7` | `hsl(148, 32%, 39%)` |
| 🟡 **Yellow** | `#FEF9C3` | `hsl(38, 62%, 49%)` |
| 🔴 **Red** | `#FFE4E6` | `hsl(2, 62%, 55%)` |
| 🟣 **Purple** | `#F3E8FF` | `hsl(274, 32%, 54%)` |

### 5.4 Computed Styles — по компонентам

#### Редактор (`.tiptap` / `.ProseMirror`)

| Свойство | Notion-like | Simple | Headless |
|:---------|:------------|:-------|:---------|
| `font-family` | `"DM Sans", sans-serif` | `"DM Sans", sans-serif` | `Inter, ui-sans-serif, system-ui` |
| `font-size` | `16px` | `16px` | `16px` |
| `line-height` | `24px` | `24px` | `24px` |
| `color` | `rgb(34, 35, 37)` | `rgb(34, 35, 37)` | `rgb(0, 0, 0)` |
| `background-color` | `transparent` | `transparent` | `transparent` |
| `padding` | `48px` | `16px 0px 0px` | `0px 0px 32px` |
| `border-radius` | `0px` | `0px` | `0px` |

#### Кнопки тулбара (`.tiptap-button`)

| Свойство | Notion-like / Simple | Headless |
|:---------|:---------------------|:---------|
| `border-radius` | **`12px`** | **`8px`** |
| `padding` | `4px 8px` | `4px 8px` |
| `height` | `32px` | `auto` |
| `width` | `32px` (квадрат) | `auto` |
| `font-size` | `14px` | `12px` |
| `color` | `rgba(40,44,51, 0.42)` | `rgb(46, 43, 41)` |
| `background` | `transparent` → hover: `rgba(61,37,20, 0.08)` | `rgba(61,37,20, 0.08)` |
| `border` | `none` | `1px solid transparent` |

#### Карточка / Дропдаун (`.tiptap-card`)

| Свойство | Значение |
|:---------|:---------|
| `border-radius` | **`20px`** |
| `background-color` | `rgb(255, 255, 255)` |
| `border` | `1px solid rgba(15, 22, 36, 0.05)` |
| `box-shadow` | `--tt-shadow-elevated-md` (4-слойная мягкая тень) |
| `padding` | `0px` (padding внутри `.tiptap-card-body`) |

#### Лейбл категории (`.tiptap-card-group-label`)

| Свойство | Значение |
|:---------|:---------|
| `font-size` | `12px` |
| `line-height` | `16px` |
| `font-weight` | `600` (semibold) |
| `color` | `rgba(30, 32, 36, 0.95)` |
| `padding` | `8px 12px` |

#### Разделитель (`.tiptap-separator`)

| Свойство | Значение |
|:---------|:---------|
| `height` | `1px` |
| `background-color` | `rgba(15, 22, 36, 0.05)` |
| `margin` | `4px 0px` |

#### Иконки кнопок (`.tiptap-button-icon`)

| Свойство | Значение |
|:---------|:---------|
| `width × height` | `16px × 16px` |
| `color` | `currentColor` (наследуется от `.tiptap-button`) |

### 5.5 Ключевые дизайн-принципы

| Принцип | Реализация |
|:--------|:-----------|
| **Минимальные бордеры** | Бордеры почти невидимы (`0.05` opacity), визуальное разделение через тени |
| **Глубина через тени** | 4-слойная `box-shadow` вместо жёстких рамок → эффект "парения" |
| **Скруглённость** | Агрессивные радиусы: кнопки `12px`, карточки `20px` |
| **Нейтральная палитра** | Чёрно-белая база, единственный акцент — фиолетовый `#6229FF` |
| **Прозрачные hover** | Кнопки без фона, при ховере — лёгкая заливка `8%` opacity |
| **Два шрифта** | `DM Sans` для контента, `Inter` для UI — чёткое разделение |
| **Micro-animations** | CSS transitions на `background-color`, `color`, `box-shadow` (150–200ms) |

---

## 6) Collaboration (реал-тайм совместное редактирование)

Tiptap Collaboration продаётся как:

- **Live carets/cursors** — видно, кто где печатает
- **Offline editing** и синхронизация изменений
- **"Real-time collaboration anywhere"** — доступно как Platform и On-premises

### UX-реализация

| Элемент | Описание |
|:--------|:---------|
| **Курсоры** | Цветные каретки других пользователей в документе |
| **Presence** | Аватары в верхней панели (кто сейчас в документе) |
| **Merge** | Автоматическое слияние на уровне транзакций/операций (нет конфликтов) |
| **Offline sync** | Работа при оффлайне с последующей синхронизацией |

В Notion-like template коллаборация уже **встроена и видна**: аватары в хедере + вертикальные маркеры справа.

---

## 7) Comments (треды, инлайн-обсуждения, suggestions)

Tiptap Comments (Beta):

- **Threaded conversations** — полноценные треды с ответами
- **Inline suggestions** — предложения прямо в тексте
- **Comments REST API** — модерация/управление тредами на бэкенде

### UX-паттерн (проверено в Agent editor)

| Шаг | Описание |
|:----|:---------|
| 1 | Выделяешь фрагмент → **"Add comment"** |
| 2 | Появляется маркер/подсветка в тексте |
| 3 | Справа — **comment bubble** |
| 4 | При клике — **тред** (reply / resolve) |
| 5 | Навигация между комментариями (prev/next) |
| 6 | Привязка к диапазонам текста |

---

## 8) Track Changes, Versions, Diff

### 8.1 Track Changes / Redlining

В официальном roadmap заявлено **"Redlining (Tracked Changes)"** — классический режим вставки/удаления "как предложения" (как в Word/Docs).

### 8.2 AI Toolkit → Suggestions as Diffs

**Уже работает** в Agent editor (проверено):

- AI-powered suggestions как **actionable diffs**
- **Accept / Reject** changes мгновенно
- Streaming результатов в редактор
- Зелёные хайлайты (additions) + серые зачёркивания (deletions)
- Suggestion toolbar: счётчик, навигация, Accept all / Reject all

### 8.3 Version History / Snapshots

В платных фичах:

- **Снимки** документа (snapshots/versions)
- Список версий с метаданными (кто/когда)
- **Compare/diff** между версиями

---

## 9) AI Features — 2 уровня

### 9.1 Content AI (one-shot команды)

| Функция | Описание | Где доступно |
|:--------|:---------|:-------------|
| **Fix grammar** | Исправление грамматики | Agent, Notion-like |
| **Change tone** | Изменение тона текста | Agent |
| **Translate** | Перевод | Agent |
| **Summarize** | Суммаризация | Agent |
| **Continue Writing** | AI продолжает текст | Notion-like |
| **Ask AI** | Свободный промпт | Notion-like |
| **Improve** | Улучшение выделения | Notion-like (bubble menu) |
| **Copilot-style autocomplete** | Автодополнение со streaming | Agent |

### 9.2 AI Toolkit (агентное редактирование, Cursor-like)

Инфраструктура для AI, которая:
- **Понимает схему** документа
- Делает **точечные правки** (не заменяет всё)
- Выдаёт **diff-предложения** (зелёный/серый)
- Позволяет **accept/reject** каждую правку
- Поддерживает **streaming** генерации

### 9.3 UI-упаковка AI

| Компонент | Описание |
|:----------|:---------|
| **AI Menu** | Контекстное плавающее AI-меню |
| **AI Ask Button** | Кнопка для вызова AI по выделению |
| **AI Command Bar** | Свободный текстовый ввод для команд AI |
| **AI Status** | Индикатор "Using AI toolkit" в футере |

---

## 10) Custom Extensions

Ключевая сила Tiptap — возможность "дописать Notion" под свой продукт:

- **Свои node types:** Callout, Steps, Card, Embed, Smart-Block, Jira-Issue, Confluence-Excerpt…
- **Свои marks:** "semantic highlight" с типами
- **Свои команды/хоткеи/input rules**
- **Свои NodeViews:** Сложные React-рендеры узлов
- **Command-chain подход:** Цепочки команд как нормальный паттерн

---

## 11) i18n & RTL

### RTL / BiDi
- Встроенная поддержка: `textDirection: 'ltr' | 'rtl' | 'auto'`
- Команды: `setTextDirection(...)` / `unsetTextDirection()`
- Отдельный пример "Text direction & RTL support"

### i18n
- Tiptap headless → перевод интерфейса = перевод ваших UI-лейблов
- UI-компоненты принимают text-пропсы (например, `text="Insert Block"`)
- i18n делается на уровне **вашего UI-слоя**, не "внутри движка"

---

## 12) Сравнительная таблица всех 4 редакторов

| Функция | Agent | Notion-like | Simple | Headless |
|:--------|:-----:|:-----------:|:------:|:--------:|
| **Bold/Italic/Strike** | ✅ | ✅ | ✅ | ✅ |
| **Underline** | ✅ | ✅ | ✅ | ❌ |
| **Highlight** | ✅ | ✅ (цвет) | ✅ | ❌ |
| **Inline Code** | ❓ | ✅ | ✅ | ✅ |
| **Link** | ❓ | ✅ | ✅ | ❌ |
| **Superscript/Subscript** | ❌ | ❌ | ✅ | ❌ |
| **Headings H1–H4** | ✅ | ✅ | ✅ | ✅ |
| **Headings H5–H6** | ❌ | ❌ | ❌ | ✅ |
| **Bullet List** | ✅ | ✅ | ✅ | ✅ |
| **Ordered List** | ✅ | ✅ | ✅ | ✅ |
| **Task List (To-do)** | ✅ | ✅ (slash/+) | ❌ | ❌ |
| **Blockquote** | ❓ | ✅ | ✅ | ✅ |
| **Code Block** | ❓ | ✅ | ✅ (в демо) | ✅ |
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

> ❓ = Функция теоретически доступна через extensions, но не была явно замечена в демо.

---

## 13) Advanced Capabilities (на основе Tiptap Examples)

Анализ страницы `tiptap.dev/examples` раскрывает дополнительные возможности, выходящие за рамки стандартных редакторов:

### 13.1 Performance & Long Texts
- Tiptap оптимизирован для работы с **огромными документами** (тысячи узлов).
- Использует виртуализацию и умный рендеринг ProseMirror, чтобы не лагать при скролле и вводе в длинных лонгридах.

### 13.2 Interactive NodeViews (React/Vue внутри текста)
- Вы можете встраивать **полноценные React/Vue компоненты** прямо в тело редактора.
- Примеры:
  - **Drawing:** Рисовалка (canvas) как часть документа.
  - **Interactive Kanban/Tasks:** Доски с перетаскиванием внутри текста.
  - **Charts/Graphs:** Живые графики, которые можно редактировать.
- Это не просто "статичные картинки", а **интерактивные приложения** внутри текста, которые сохраняют своё состояние в JSON документа.

### 13.3 Content Structure & Validations
- **Forced Layout:** Можно задать жесткую структуру документа на уровне схемы.
  - *Пример:* "Документ обязан начинаться с Заголовка 1, за которым следует Параграф. Удалить Заголовок 1 нельзя".
- **Linting (Experiment):** Расширение для проверки ошибок (опечатки, стиль, правила) в реальном времени с визуальной подсветкой.

### 13.4 Экспериментальные возможности
- **Collaborative Fields:** Одно Y.js соединение может синхронизировать не только текст редактора, но и **соседние поля** (например, "Title", "Status", "Tags" документа) — всё в реал-тайме.
- **iFrames:** Безопасное встраивание внешнего контента с UI для настройки размеров и URL.
- **Generic Figure:** Обертки для медиа-контента с подписями (captions).

---

## 14) Общая концепция и философия (General Concept)

На основе анализа всех редакторов и примеров, **Tiptap — это не просто "editor"**, это **конструктор**:

1.  **Everything is an Extension:**
    - Нет "ядра с кнопками". Даже `Paragraph`, `Text` и `Bold` — это расширения.
    - Вы подключаете только то, что нужно. Хотите только Plain Text? Отключите всё, кроме `Text`. Хотите сверхмощный Notion? Подключите 50 расширений.

2.  **Headless & Framework Agnostic:**
    - Tiptap **не даёт UI**. Кнопки, меню, сайдбары — вы верстаете сами на React/Vue/Svelte.
    - Это даёт **полный контроль над дизайном** (см. разницу между Agent и Simple редакторами — один движок, абсолютно разный вид).

3.  **ProseMirror под капотом:**
    - Tiptap — это удобная обёртка над **ProseMirror** (мощнейший, но сложный фреймворк).
    - Он упрощает API, но сохраняет мощь: транзакции, steps, схему документа.

4.  **JSON Output:**
    - Документ хранится не как HTML, а как **JSON-дерево** (ProseMirror Node Tree). Это позволяет легко парсить, анализировать и трансформировать контент на бэкенде.

---

## 15) Чек-лист "как всё прощёлкать самому"

### Agent Editor
1. Открой Agent editor на tiptap.dev
2. Кликни "AI Toolkit examples" → "Add AI comment" → подожди → кликни на comment bubble → скриншоть поповер с reply/resolve
3. "Add new paragraph" → подожди → скриншоть зелёные diff-предложения → Accept/Reject
4. "Proofread" → подожди → скриншоть все правки с подсчётом "1/12" → Accept all / Reject all
5. AI Command Bar → введи текст → скриншоть результат → Accept/Reject
6. Тулбар: Bold, Italic, Strike, Underline, Highlight → применяй к тексту
7. Heading dropdown → H1-H4
8. Lists → Bullet/Ordered/Task
9. Alignment → left/center/right/justify

### Notion-like Editor
1. Открой Notion-like tab
2. `/` → скриншоть slash-меню (AI / Style / Insert категории)
3. Наведи слева от блока → кликни drag handle → скриншоть контекст-меню (Duplicate/Delete/Reset/Copy)
4. Выдели текст → скриншоть floating toolbar (Improve/Bold/Italic/Link/Color)
5. `@` → скриншоть mentions dropdown
6. `:` → скриншоть emoji picker
7. ☀️/🌓 → скриншоть dark mode
8. Вставь table/image/video через slash-меню

### Simple Editor
1. Открой Simple tab
2. H▾ → скриншоть heading dropdown (H1-H4)
3. ☰▾ → скриншоть list dropdown (Bullet/Ordered)
4. Каждую кнопку тулбара → Bold/Italic/Strike/Code/Underline/Highlight/Link/Super/Sub
5. Alignment → left/center/right/justify
6. "+ Add" → скриншоть зону загрузки изображений
7. ☀️ → скриншоть dark mode

### Headless Editor
1. Открой Headless tab
2. Нажми каждую кнопку: Bold, Italic, Strike, Code
3. "Clear marks" → убедись что стили сброшены
4. "Clear nodes" → heading → paragraph
5. H1-H6 → проверь все уровни
6. Bullet list / Ordered list
7. Code block → тёмный фон
8. Blockquote → боковая полоса
9. Horizontal rule → линия-разделитель
10. Hard break → `<br>` внутри параграфа
11. Undo / Redo

---

## 16) Записи взаимодействий (Recordings)

Все взаимодействия были записаны:

| Запись | Содержание |
|:-------|:-----------|
| `main_page_recording.webp` | Навигация по главной странице tiptap.dev |
| `agent_editor_recording.webp` | Прокликивание Agent editor: AI toolkit, toolbar, форматирование |
| `notion_editor_recording.webp` | Прокликивание Notion-like editor: slash, drag, bubble, mentions, emoji |
| `simple_headless_recording.webp` | Прокликивание Simple + Headless editors: тулбар, кнопки, dropdowns |
| examples_analysis.webp | Анализ страницы Examples: скролл по экспериментам и продвинутым демо |
