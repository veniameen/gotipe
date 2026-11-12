# 21 — Использование библиотеки GoTipe внутри SpecOrbit

GoTipe — библиотека редактора. Wiki является функцией приложения SpecOrbit и
реализуется в его репозитории поверх публичных пакетов GoTipe. В GoTipe нет
отдельной Wiki-страницы, файлового рабочего пространства или runtime SpecOrbit.

| GoTipe | Приложение SpecOrbit |
|---|---|
| Документ, команды, выделение, история, Markdown | Страницы проекта, пути и дерево файлов |
| Универсальный `PageEditor`, блоки, меню и оформление | Вкладки, панели, навигация и компоновка Wiki |
| Host contracts для assets, links и ошибок | Чтение/запись файлов, права, durable storage и автосохранение |
| Отображение предложений/комментариев и действия над ними | Запросы к модели, ревизии, бизнес-процесс принятия правок |

Основной playground показывает универсальные варианты Page и Block одного
редактора: `/?view=page#basic` и `/?view=block#basic`. Примеры ниже описывают код
адаптера **на стороне SpecOrbit**: `wiki.*`, `file`, `projectPath` и функции
сохранения принадлежат хосту, не являются API пакетов GoTipe. Этот документ не
подтверждает выполнение интеграции или её проверок в репозитории SpecOrbit.

## Пакеты

| Пакет | Зачем |
|---|---|
| `@gotipe/block-editor` | `PageEditor`, `ReviewBar`, `LaneAvatars`, `PageIcon`, `insertPageBlock` |
| `@gotipe/theme` | `@gotipe/theme/base.css` и `theme.css` — общие виды; `page.css` грузит их же одним файлом |
| `@gotipe/core`, `@gotipe/react` | ядро и React-слой (peer) |
| `@gotipe/markdown` | собственный кодек Markdown; ещё и для runtime: `applyAnchoredEdits` — в `@gotipe/suggestions` |
| `@gotipe/suggestions` | типы и якоря предложений: `findAnchor`, `applyAnchoredEdits`, `locateEdits` |
| `@gotipe/i18n` | русские строки (`locale="ru"` по умолчанию) |

Для JS-режима и редактирования без подсветки не нужны `@gotipe/wasm` и `shiki`.
Кодек использует собственный parser GoTipe, без runtime-зависимостей mdast/micromark.
Нетронутые Markdown-фрагменты сохраняют исходные байты; произвольные JSON-атрибуты
не становятся частью Markdown автоматически.

## Сборка (Vite)

```ts
// vite.config.ts renderer
resolve: {
  alias: [
    // JS-движок: в бандл не попадает ни строчки WASM.
    { find: /^@gotipe\/core$/, replacement: "@gotipe/core/js" },
  ],
},
```

- `@gotipe/core/js` — JS entry без загрузки `@gotipe/wasm`; native collaboration
  в этом режиме недоступна. Основной entry поддерживает optional WASM peer и
  выбирает движок через `engine`. Для строгой JS-only сборки сохраняйте точный alias.
- На стороне SpecOrbit экран Wiki можно загружать лениво вместе с
  `import "@gotipe/theme/base.css"` и `import "@gotipe/theme/theme.css"` (или `page.css` — то же
  одним файлом). Состав стартового bundle проверяется в сборке
  хоста; сам пакет GoTipe не создаёт экран или маршрут приложения.
- Импорт модулей GoTipe не вешает слушателей, не ходит в сеть и не грузит шрифты.
  Именованные HTML references декодирует собственная таблица Unicode без создания
  DOM-элементов; отдельный alias для декодера не нужен.
- Размер проверяется на конкретной production-сборке. Поддерживаемые бюджеты
  полного JS-графа описаны в [javascript-budgets.md](development/javascript-budgets.md),
  native-модуля — в [wasm-budget.md](development/wasm-budget.md). Они не являются
  обещанием неизменного размера произвольного приложения SpecOrbit.

## CSP

Изолированный consumer-тест `build:csp-test` проверяет библиотеку под политикой:
`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'`.
Сборка сама по себе не доказывает отсутствие нарушений CSP. Проверка запросов,
ошибок и реального ввода описана в [контракте CSP](development/csp.md);
интеграция в приложение хоста требует отдельного прогона в его renderer.

- `script-src 'self'` — хватает: JS-движок, без `wasm-unsafe-eval` и `unsafe-eval`.
- `style-src 'unsafe-inline'` — нужен для атрибутов `style` (позиции меню и курсоров, цвет
  дорожки `--gt-track`, выравнивание ячеек). Нужную политику задаёт хост.
- `img-src data:` — картинки страницы показываются data URL из `host.resolveAsset`.
- `font-src` — тема не объявляет `@font-face`: шрифты берутся из `--gt-font-ui` и
  `--gt-font-mono`; шрифты и их загрузку выбирает SpecOrbit.
- `connect-src` — редактор в сеть не ходит.
- Подсветка кода по умолчанию выключена. Если нужна: `@gotipe/block-editor/shiki`
  (`shiki/core` + JavaScript regex engine, без WASM; грамматики — ленивыми `import()`).

## Использование

```tsx
import "@gotipe/theme/base.css";
import "@gotipe/theme/theme.css";
import { PageEditor, type PageEditorHandle } from "@gotipe/block-editor";

<PageEditor
  ref={pageRef}
  view="notion"                        // общий вид: notion (по умолчанию), docs, modern, minimal
  markdown={file.content}              // текст файла; новое значение ≠ последнему черновику → внешняя замена
  onChange={(md) => scheduleSave(md)}  // черновик после каждой правки; автосохранение ~1 с — у хоста
  readOnly={viewingVersion}            // В8: просмотр старой версии
  locale="ru"
  titlePlaceholder={slugToTitle(path)} // название без «# …» в файле
  host={{
    saveAsset: async (blob, { name, mediaType }) => {
      const { path } = await wiki.writeAsset({ projectPath, page, name, mediaType, data: await toBase64(blob) });
      return { src: relativeToPage(path) };        // например "assets/schema.png"
    },
    resolveAsset: async (src) => (await wiki.readAsset({ projectPath, path: resolve(page, src) })).dataUrl,
    openLink: (href) => openExternalOrPage(href),  // http(s)/mailto или путь в проекте
    onError: (error) => toast.error(errorText(error.code)), // с onError свой тост редактор не показывает
  }}
  review={review}                      // см. ниже; без него слоя предложений нет
  reviewBar={false}                    // полосу правки SpecOrbit рисует сам (WikiLiveBar) или { title, extra }
/>
```

Ручка (`ref`): `editor`, `getMarkdown()`, `focus()`, `insertBlock(kind)` (кнопки «Изображение»
и «Блоки» панели), `getTitle()`, `selectTitle()` («Переименовать»), `review` (`ReviewApi`).

- Название — первый `# …` файла. Без него показывается `titlePlaceholder`, в файл ничего не
  пишется, пока человек не наберёт название.
- Front matter, HTML, сноски, определения ссылок не показываются как текст для правки: они
  остаются как есть (блоки «Markdown» только для чтения).
- Внешняя замена (файл изменил агент, Git, принятое предложение): передайте новый `markdown` —
  id блоков переиспользуются, фокус, каретка и прокрутка сохраняются, правка попадает в undo.
- Неизменённый файл возвращается байт-в-байт; после правки абзаца меняется только его блок.
- PageEditor — это BlockEditor с Markdown-сессией и предложениями модели: та же панель над
  выделением, «/», ручка и меню блока, меню столбца таблицы (атлас, кадры 6–9 и 19). Своей темы
  у страницы нет.
- Свои виды блоков — проп `blockViews`: они важнее видов страницы и общих. Так SpecOrbit рисует,
  например, цитату, которая начинается с жирной метки «Инструкции для агента:» — для библиотеки
  это обычная цитата.

### Колбэки хоста (`EditorHost`)

| Колбэк | Когда | SpecOrbit |
|---|---|---|
| `saveAsset(blob, {kind, name, mediaType, size})` → `{src, name?}` | вставка из буфера, перетаскивание, «Изображение», «Файл» | `wiki.writeAsset`; отказ — `throw` (станет событием `error`) |
| `resolveAsset(src)` → data URL \| null | показ изображения | `wiki.readAsset` → `dataUrl` |
| `openLink(href, {blockId, newTab})` | Cmd/Ctrl+клик; любой клик в режиме чтения; клик по файлу | ссылки наружу — системный браузер; `docs/pages/*.md` — вкладка страницы |
| `onError(error: GoTipeError)` | любая ошибка | тост или подсветка; своих строк ошибок у редактора нет |

Коды ошибок: `ASSET_SAVE_FAILED`, `ASSET_RESOLVE_FAILED`, `LINK_BLOCKED` (не http/https/mailto и не
относительная ссылка), `LINK_OPEN_FAILED`, `PROPOSAL_STALE`, `PROPOSAL_ACTION_FAILED`,
`COMMENT_ACTION_FAILED`, `TRANSFORM_ERROR`. Неверная ссылка в плавающей панели — подсветка поля.

### Предложения модели (ADR-0047)

```ts
const review: PageReviewProps = {
  lanes: [                       // дорожки траектории; цвет — CSS-цвет или переменная
    { id: "user", name: "Вы", kind: "user", color: "var(--gt-track-4)" },
    { id: "agent", name: "Агент", kind: "agent", color: "var(--gt-track-1)" },
    { id: "skill:company-lint", name: "company-lint", kind: "skill", color: "var(--gt-track-2)" },
    { id: "tool:psql", name: "psql", kind: "tool", color: "var(--gt-track-3)" },
  ],
  proposals: records.proposals.map((p) => ({
    id: p.id, laneId: laneOf(p.source), edits: p.edits, reason: p.reason,
    status: p.status,            // "stale" из записей тоже учитывается
  })),
  comments: records.comments.map((c) => ({
    id: c.id, laneId: laneOf(c.source), anchor: c.anchor, text: c.text, question: c.question,
    replies: c.replies.map((r) => ({ id: r.id, author: "Вы", text: r.text })),
  })),
  cursors,                       // из wiki.changed kind=cursor: {laneId, label, proposalId | anchor}
  onAccept: async (id) => {      // сохранить черновик → wiki.acceptProposal → новый текст в markdown
    await saveNow(pageRef.current!.getMarkdown());
    const { document } = await wiki.acceptProposal({ projectPath, path, proposalId: id, expectedRevision });
    setFile(document);           // PageEditor применит как внешнюю правку
    return true;                 // false — остановить «Принять все»
  },
  onReject: (id) => wiki.rejectProposal({ projectPath, path, proposalId: id }).then(() => true),
  onRejectAll: () => wiki.rejectAll({ projectPath, path }),
  onReply: (commentId, text) => wiki.reply({ projectPath, path, commentId, text }).then(() => true),
  onStatesChange: ({ proposals }) => setStale(proposals.filter((p) => p.status === "stale")),
};
```

- Якоря — те же `before + quote + after` в тексте файла. Редактор привязывает их к черновику на
  каждую правку; не найдено ровно одно совпадение — «устарело» (только «Отклонить»), подсказка
  текстом на месте `before`.
- Подсветка точная для правок внутри блоков (вставка подчёркнута цветом дорожки, замена —
  зачёркнутое и новое); новые строки списков и ячейки таблиц появляются на месте; блоки другого
  типа — старый зачёркнут, новый под ним, карточка показывает «Было» и «Стало».
- «Принять все» по умолчанию — по одному в порядке документа, остановка на первом устаревшем
  или `false`. Свой порядок — `onAcceptAll`. `ref.review.acceptAll()` — для своей полосы.
- Курсор: у `proposalId` — в конце его текста, иначе — у `anchor`. Подпись — `label`.
  Раскрытие готового текста — до 1,5 с, при `prefers-reduced-motion` сразу.
- Без `onAccept` предложение применяется локально (`applyAnchoredEdits`) — так работает пример.
- Для runtime (М1) пригодятся `findAnchor`, `locateEdits`, `applyAnchoredEdits`,
  `anchorWindowsOverlap` из `@gotipe/suggestions`: те же правила, что в редакторе.

## CSS-переменные

Страница рисуется общим видом (`view`); все цвета, шрифты и размеры — токены `--gt-*`
(`@gotipe/theme`). Тёмная тема — `data-theme="dark"` на любом предке (или `prefers-color-scheme`,
если `data-theme` нет).

- Цвета, шрифты, радиусы и тени наследуются: задайте их на контейнере страницы или выше, и они
  дойдут до текста, меню и карточек предложений.
- Размеры вида (кегль, интерлиньяж, поля страницы) задаёт сам вид на `[data-gt-view]`. Свои
  значения ставьте на `.gotipe-page .gotipe-block-editor`.

Пример адаптера на стороне SpecOrbit (имена справа — токены приложения):

```css
.wk-page {
  --gt-page-bg: var(--canvas);      --gt-sunken: var(--surface);      --gt-overlay: var(--overlay);
  --gt-text: var(--text);           --gt-text-2: var(--text-2);       --gt-text-3: var(--text-3);
  --gt-fill-1: var(--fill-1);       --gt-fill-2: var(--fill-2);       --gt-fill-3: var(--fill-3);
  --gt-line: var(--line);           --gt-line-strong: var(--line-strong);
  --gt-line-control: var(--line-control);                             --gt-line-active: var(--line-active);
  --gt-ink: var(--primary);         --gt-ink-hover: var(--primary-hover); --gt-ink-text: var(--primary-text);
  --gt-accent: var(--accent);       --gt-accent-text: var(--accent-text);
  --gt-focus: var(--focus-ring);    --gt-selection: var(--selection);
  --gt-success: var(--success);     --gt-warning: var(--warning);     --gt-danger: var(--danger);
  --gt-danger-tint: var(--danger-soft);
  --gt-comment: var(--warning);     --gt-comment-tint: var(--warning-soft);
  --gt-shadow-overlay: var(--shadow-e2);
  --gt-font-ui: var(--font-ui);     --gt-font-mono: var(--font-mono);
  --gt-radius-control: var(--r-control); --gt-radius-overlay: var(--r-overlay);
}
```

Цвета дорожек предложений — `--gt-track-1…6` (по умолчанию — цвета участников, warning и два
нейтральных; без фиолетового и терракоты); дорожка может передать свой цвет в `lanes[].color`.

Классы для своих правок: `.gotipe-page` (корень), `.gotipe-page-title`, `.gotipe-raw`,
`.gotipe-table`, `.gotipe-column-menu`, `.gotipe-bubble-menu`, `.gotipe-slash-menu`,
`.gotipe-block-context-menu`, `.gotipe-review-bar`, `.gotipe-review-card`, `.gotipe-lane-cursor`,
`.gotipe-sug-ins|-del|-stale|-block-ins|-block-del`, `.gotipe-cmt`. Атрибуты:
`data-gt-view`, `data-gotipe-proposal`, `data-gotipe-comment`, `data-gotipe-lane`.

## Что в Markdown

| Блок | Markdown |
|---|---|
| Задачи | `- [ ]` / `- [x]` |
| Выноска | `> [!NOTE]` (TIP, IMPORTANT, WARNING, CAUTION) |
| Изображение | `![alt](assets/имя.png "подпись")` — путь возвращает `saveAsset` |
| Файл | `[имя.pdf](assets/имя.pdf)` — абсолютная или относительная ссылка, текст = имя файла |
| Тип столбца | не хранится: «Число» — `---:`, «Код» — ячейки в `` ` ``, «Да / нет» — `да`/`нет` |
| HTML, сноски, определения | как есть, блок только для чтения |

## Ограничения

- Мягкие переносы строк внутри абзаца сохраняются переводом строки; в редакторе видны как
  перенос.
- Правленый блок пишется канонически: `**`, `*`, `~~`, ATX-заголовки, fenced-код; маркеры и
  нумерация списков сохраняются.
- Голые URL GFM превращает в ссылки при повторном разборе правленого блока.
- Многоабзацные пункты списков и цитаты, смешанные списки задач — блоком «как есть».
- Скорость: страница 80 КБ (2 000 блоков) — разбор ~190 мс, сериализация после правки ~16 мс.
