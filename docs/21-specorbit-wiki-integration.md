# 21 — Вики-страница SpecOrbit на GoTipe: интеграция

Для кого: SpecOrbit (Electron, React 19), Ф60 — вики-страницы проекта (ADR-0059) и правки
модели (ADR-0047). Редактор — `PageEditor` из `@gotipe/block-editor`. Пример с моками всего,
что делает runtime SpecOrbit: `apps/playground/src/wiki/` (`pnpm --filter @gotipe/playground
dev`, страница `/wiki.html`).

## Пакеты

| Пакет | Зачем |
|---|---|
| `@gotipe/block-editor` | `PageEditor`, `ReviewBar`, `LaneAvatars`, `PageIcon`, `insertPageBlock` |
| `@gotipe/theme` | `@gotipe/theme/page.css` — всё оформление страницы |
| `@gotipe/core`, `@gotipe/react` | ядро и React-слой (peer) |
| `@gotipe/markdown` | кодек GFM без потерь (peer; ещё и для runtime: `applyAnchoredEdits` — в `@gotipe/suggestions`) |
| `@gotipe/suggestions` | типы и якоря предложений: `findAnchor`, `applyAnchoredEdits`, `locateEdits` |
| `@gotipe/i18n` | русские строки (`locale="ru"` по умолчанию) |

Не нужны: `@gotipe/wasm`, `shiki`. Зависимости кодека (`mdast-util-from-markdown`,
`mdast-util-gfm`, `micromark-extension-gfm`) — те же версии, что уже стоят в SpecOrbit.

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

- `@gotipe/core/js` — тот же API, что `@gotipe/core`, без ссылок на `@gotipe/wasm`. Без alias
  сборка потребует установленный `@gotipe/wasm` и положит 1,9 МБ `.wasm` в ленивый chunk.
- Всё вики — в ленивом chunk (`features/wiki/load-view.ts` → `import("./WikiEditor")`),
  CSS импортируется там же: `import "@gotipe/theme/page.css"` — Vite вынесет его в CSS этого
  chunk, стартовые JS и CSS не растут.
- Импорт модулей GoTipe не вешает слушателей, не ходит в сеть и не грузит шрифты. Одна
  оговорка: браузерная сборка `decode-named-character-reference` (зависимость micromark) при
  загрузке создаёт отсоединённый `<i>` для разбора `&nbsp;` и подобных. Без сети и слушателей;
  если и это лишнее — alias на его чистую JS-версию (`decode-named-character-reference/index.js`
  по абсолютному пути из `node_modules`).
- Размер: пример `pnpm --filter @gotipe/playground build:wiki` — 544 КБ JS (161 КБ gzip) вместе
  с React; CSS страницы — 32 КБ (6 КБ gzip).

## CSP

Проверено сборкой `build:wiki` с CSP SpecOrbit из `app/index.html`
(`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'`): ни одного нарушения,
в бандле нет `WebAssembly`, `eval`, `new Function`, внешних шрифтов.

- `script-src 'self'` — хватает: JS-движок, без `wasm-unsafe-eval` и `unsafe-eval`.
- `style-src 'unsafe-inline'` — нужен для атрибутов `style` (позиции меню и курсоров, цвет
  дорожки `--gt-track`, выравнивание ячеек). У SpecOrbit он уже есть.
- `img-src data:` — картинки страницы показываются data URL из `host.resolveAsset`.
- `font-src` — `page.css` не объявляет `@font-face`: шрифты берутся из `--gt-font-ui` и
  `--gt-font-mono` (SpecOrbit подставляет свои Inter и Geist Mono).
- `connect-src` — редактор в сеть не ходит.
- Подсветка кода по умолчанию выключена. Если нужна: `@gotipe/block-editor/shiki`
  (`shiki/core` + JavaScript regex engine, без WASM; грамматики — ленивыми `import()`).

## Использование

```tsx
import "@gotipe/theme/page.css";
import { PageEditor, type PageEditorHandle } from "@gotipe/block-editor";

<PageEditor
  ref={pageRef}
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
    onError: (error) => toast.error(errorText(error.code)),
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

Всё оформление страницы — `--gt-*` на `.gotipe-page` (`@gotipe/theme/page.css`). Значения по
умолчанию — v6. Тёмная тема: `[data-theme="dark"]` на предке или на `.gotipe-page`, либо
`prefers-color-scheme`. Сопоставление с токенами SpecOrbit (`app/src/ui/tokens.css`) — его же
использует пример (`apps/playground/src/wiki/wiki.css`):

```css
.wk-page .gotipe-page {
  --gt-page-bg: var(--canvas);     --gt-surface: var(--surface);      --gt-overlay: var(--overlay);
  --gt-text: var(--text);          --gt-text-2: var(--text-2);        --gt-text-3: var(--text-3);
  --gt-fill-1: var(--fill-1);      --gt-fill-2: var(--fill-2);        --gt-fill-3: var(--fill-3);
  --gt-line: var(--line);          --gt-line-strong: var(--line-strong);
  --gt-line-control: var(--line-control);                            --gt-line-active: var(--line-active);
  --gt-primary: var(--primary);    --gt-primary-hover: var(--primary-hover); --gt-primary-text: var(--primary-text);
  --gt-accent: var(--accent);      --gt-accent-text: var(--accent-text);     --gt-link: var(--link);
  --gt-selection: var(--selection);
  --gt-success: var(--success);    --gt-warning: var(--warning);      --gt-danger: var(--danger);
  --gt-danger-soft: var(--danger-soft);
  --gt-comment: var(--warning);    --gt-comment-soft: var(--warning-soft);
  --gt-shadow-overlay: var(--shadow-e2);
  --gt-font-ui: var(--font-ui);    --gt-font-mono: var(--font-mono);
  --gt-text-body: var(--text-body);   --gt-leading-body: var(--leading-body);
  --gt-text-meta: var(--text-meta);   --gt-text-prose: var(--text-prose);
  --gt-leading-prose: var(--leading-prose); --gt-text-mono-small: var(--text-mono-small);
  --gt-radius-control: var(--r-control); --gt-radius-surface: var(--r-surface);
  --gt-radius-overlay: var(--r-overlay);
}
```

Остальные токены (свои значения по умолчанию, при желании тоже сопоставить):
`--gt-track-1…6` (цвета дорожек: акцент, warning, смесь акцента и success, success, два
нейтральных; без фиолетового и терракоты), `--gt-shadow-chip`, `--gt-font-features`,
`--gt-tracking-prose`, `--gt-leading-meta`, `--gt-text-mono`, `--gt-title-size` /
`--gt-title-leading` (30/38), `--gt-h1-size…--gt-h3-leading` (24/32, 19/26, 16/22),
`--gt-radius-xs`, `--gt-radius-callout`, `--gt-page-max-width` (760px), `--gt-page-padding-top`
/ `-x` / `-bottom`, `--gt-icon-size`, `--gt-control-height`, `--gt-dur-out`, `--gt-ease-out`,
`--gt-press-scale`.

Классы для своих правок: `.gotipe-page-title`, `.gotipe-page-callout[-agent]`,
`.gotipe-page-image[-empty]`, `.gotipe-page-file`, `.gotipe-page-raw`, `.gotipe-table`,
`.gotipe-slash-menu`, `.gotipe-page-menu`, `.gotipe-page-bubble`, `.gotipe-review-card`,
`.gotipe-review-bar`, `.gotipe-lane-cursor`, `.gotipe-sug-ins|-del|-stale|-block-ins|-block-del`,
`.gotipe-cmt`. Атрибуты: `data-gotipe-proposal`, `data-gotipe-comment`, `data-gotipe-lane`.

## Что в Markdown

| Блок | Markdown |
|---|---|
| Задачи | `- [ ]` / `- [x]` |
| Выноска | `> [!NOTE]` (TIP, IMPORTANT, WARNING, CAUTION) |
| Инструкции для агента | `> **Инструкции для агента:** …` |
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
