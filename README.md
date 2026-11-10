# GoTipe

GoTipe — собственный блочный редактор на TypeScript и Rust/WASM. Ядро, Markdown,
транзакции, история и CRDT принадлежат проекту; Tiptap/ProseMirror не используются.

Три уровня интеграции:

- **Headless core** — `@gotipe/core` + адаптеры (React, Vue, Svelte, Solid), строишь UI сам
- **Готовый UI** — `@gotipe/block-editor`: Markdown-first PageEditor и BlockEditor,
  общие токены, таблицы, медиа и review
- **GoTipe Cloud** — исходники собственного backend для развёртывания: API,
  WebSocket, PostgreSQL, фоновые экспорты и адаптеры AI

`engine: 'js'` работает без WASM и подходит строгому CSP. `engine: 'wasm'` включает
Rust и совместную работу; `'auto'` пробует WASM и использует JS при недоступности
модуля. Ошибки схемы и документа не маскируются переключением движка.

Текущий статус кандидата и обязательные проверки — в
[плане выпуска](docs/22-release-readiness.md). Локальная готовность не означает,
что пакеты опубликованы или внешний Cloud уже развёрнут.

## Локальный запуск

Нужны Node.js, pnpm из `packageManager`, Rust с `wasm32-unknown-unknown`, wasm-pack
и Binaryen (`wasm-opt`). Сборка полного workspace включает отдельный PDF/DOCX WASM:

```sh
pnpm install --frozen-lockfile
pnpm build:wasm
pnpm build:export-wasm
pnpm build
pnpm --filter @gotipe/playground exec vite --host 127.0.0.1 --port 5173
```

Локальный адрес: `http://127.0.0.1:5173/`. По умолчанию открывается PageEditor;
в меню доступны остальные примеры. PDF/DOCX exporter загружается только при
соответствующем экспорте и не входит в основной editor WASM.

## PageEditor

```tsx
import { useState } from 'react';
import { PageEditor } from '@gotipe/block-editor';
import '@gotipe/theme/page.css';

export function Document() {
  const [markdown, setMarkdown] = useState('# Документ\n\nНачните писать.\n');
  return <PageEditor markdown={markdown} onChange={setMarkdown} locale="ru" />;
}
```

Для хранения файлов подключите `host.saveAsset` и `host.resolveAsset`.
Без хоста небольшие файлы включаются в документ как data URLs; callbacks и
ограничения описаны в [контракте медиа](docs/development/assets.md).
Для полной структуры rich document используйте `getJSON()`; Markdown сохраняет
синтаксис и семантику поддерживаемых Markdown-конструкций, а не произвольный JSON.

## Стек

Rust + WASM (Core) · TypeScript + pnpm + Turborepo (Packages) · Go + Chi (Cloud API) · PostgreSQL · Valkey · Playwright (E2E)

## Документация

- [Правила разработки и SOLID](AGENTS.md), [карта кода](docs/development/code-map.md)
- [Зависимости](docs/development/dependencies.md), [проверки](docs/development/testing.md)
- [Браузерная синхронизация](docs/development/browser-collaboration.md)
- [Cloud API и эксплуатационные контракты](docs/development/cloud-contract.md)
- [Бюджет WASM](docs/development/wasm-budget.md)

Документы `00`–`20` описывают первоначальный проект и требования. Наличие идеи
в них не является подтверждением реализации; статус проверяется по плану выпуска,
публичным API и текущим тестам.

## Лицензии

Headless packages лицензируются по MIT. Готовые UI/theme packages сохраняют
собственную коммерческую лицензию, указанную в их `package.json` и LICENSE.
Файлы лицензий и notices сторонних компиляторов/шрифтов входят в архивы пакетов.
