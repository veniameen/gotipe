# Step 1E: Parity Gap List (Notion vs Notion-like)

_Updated: February 14, 2026_

## Closed in this iteration

### GAP-001 (P0) — `SLASH-010`: slash в начале непустой строки

- Notion reference: существующий текст сохраняется при transform.
- Было в нашем редакторе: кейс был в `fixme` quarantine.
- Сделано:
  - снят `fixme` в `/Users/veniameen/Projects/gotipe/e2e/notion-like-matrix.spec.ts`
  - кейс включён в основной прогон как обязательный
- Доказательство:
  - `Notion-like matrix`: `32/32` PASS (Chromium)
  - кейс: `slash at line start preserves existing text`

### GAP-002 (P0) — Нет production `Turn into` в меню 6-точек

- Notion reference: row handle menu содержит `Turn into` и позволяет in-place конверсию.
- Было в нашем редакторе: только `Delete / Duplicate / Reset Formatting / Copy`.
- Сделано:
  - добавлен пункт `Turn into` и submenu с типами:
    - `Text`, `Heading 1/2/3`, `Bullet List`, `Numbered List`, `To-do List`, `Blockquote`, `Code Block`
  - добавлено сохранение текста при конверсии paragraph -> heading/todo
- Код:
  - `/Users/veniameen/Projects/gotipe/packages/block-editor/src/components/block-context-menu.tsx`
  - `/Users/veniameen/Projects/gotipe/packages/theme/src/theme.css`
- Доказательство:
  - `Block toolbar suite`: `16/16` PASS
  - кейсы:
    - `Turn into converts paragraph to heading 2 and preserves text`
    - `Turn into converts paragraph to to-do list item and preserves text`

### GAP-003 (P1) — Отсутствовал placeholder пустого heading после slash

- Notion reference: после `/heading 1` пустой блок показывает `Heading 1` до ввода.
- Было в нашем редакторе: placeholder не рендерился.
- Сделано:
  - placeholder для пустых heading (`Heading 1/2/3...`)
  - e2e-проверка появления и очистки после ввода
- Код:
  - `/Users/veniameen/Projects/gotipe/packages/react/src/editor-content.tsx`
  - `/Users/veniameen/Projects/gotipe/packages/theme/src/base.css`
- Доказательство:
  - кейс в `notion-like-matrix`:
    - `slash: heading shows placeholder before typing and clears after input`

### GAP-004 (P0) — Проверка checkbox сразу после slash transform

- Notion reference: checkbox toggle не должен ломать текст/позицию строки.
- Сделано:
  - отдельный e2e-кейс на immediate flow после `/todo`
- Доказательство:
  - кейс:
    - `todo checkbox toggle right after slash transform keeps text in place`
  - `notion-like-matrix`: `32/32` PASS

## Remaining gaps (next iteration)

### GAP-005 (P1) — Контекст-меню 6-точек пока проще, чем у Notion

- Что отличается:
  - меньше пунктов экосистемного уровня (`Color`, `Comment`, `Suggest edits`, и т.д.)
  - упрощённая структура submenu.
- План:
  - расширить меню до полной production-матрицы действий, не ломая текущие 16 e2e.

### GAP-006 (P1) — Нужен второй референс-проход по list-row behavior

- Что нужно добить:
  - детальная проверка row-by-row поведения handle/plus именно внутри многострочных списков,
  - дополнительная фиксация caret/menu геометрии в длинных документах.
- План:
  - отдельный Notion step 2 capture + зеркальный autoplay сценарий в нашем редакторе.

## Regression summary (this iteration)

- `pnpm playwright test e2e/notion-like-matrix.spec.ts --project=chromium --workers=1`
  - Result: `32 passed`
- `pnpm playwright test e2e/block-toolbar.spec.ts --project=chromium --workers=1`
  - Result: `16 passed`
- `pnpm playwright test e2e/notion-like-matrix.spec.ts e2e/block-toolbar-fast-hover.spec.ts e2e/block-toolbar.spec.ts e2e/editor-production-ux.spec.ts --project=chromium --workers=1`
  - Result: `79 passed`
