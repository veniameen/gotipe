# CSP и сетевые границы библиотеки

PageEditor использует `@gotipe/core/js`: создание и редактирование документа не
требуют WebAssembly, eval, Worker, CDN или сетевого сервиса. Код, CSS и шрифты
поставляет приложение. Подсветка необязательна: отдельный Shiki adapter загружает
только заданные хостом локальные grammars/themes и использует JavaScript engine.

`apps/playground/tests/csp/` — технический consumer публичной библиотеки, а не
экран продукта. Его production-конфигурация `vite.csp.config.ts` задаёт строгую
политику и точный alias `@gotipe/core` → `@gotipe/core/js`; public subpaths,
включая presets, сохраняются. Результат находится только в ignored `output/`.

```sh
pnpm --filter @gotipe/playground build:csp-test
pnpm --filter @gotipe/playground preview:csp-test --host 127.0.0.1
```

Открыть `http://127.0.0.1:5310/tests/csp/index.html`. Политика в HTML:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self';
object-src 'none'; base-uri 'none'
```

Проверка в браузере включает ввод Unicode, Undo, checkbox с клавиатуры, смену темы
и read-only. Записывать `securitypolicyviolation`, ошибки страницы и реальные
requests от перезагрузки до завершения действий. У базового примера допустимы
только собственные HTML/JS/CSS resources; `.wasm` и внешних запросов быть не должно.
Development HMR не является доказательством работы production CSP.

У GoTipe нет отдельного приложения SpecOrbit Wiki. Совместимость этой consumer
сборки не заменяет проверку реального приложения, использующего библиотеку.

Хост отдельно разрешает нужные ему домены медиа, AI и collaboration. GoTipe не
расширяет CSP автоматически. Выбор WASM engine/export требует отдельной политики
хоста и не входит в обещание JS-only PageEditor под `script-src 'self'`.
