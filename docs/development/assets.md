# Изображения и файлы

У загрузки один контракт: `saveAsset(host, blob, kind)` из `@gotipe/core`.
`host.saveAsset` сохраняет файл и возвращает долговечный путь; `host.resolveAsset`
превращает путь в доступный для показа URL. Хост владеет своими blob URLs и их
освобождением. Ошибки видны в интерфейсе и `host.onError`.

Без хоста файлы до 10 MiB включаются в документ как base64 data URLs. Это позволяет
сохранить JSON/Markdown и открыть его после перезагрузки. Большие файлы требуют
host storage. Основные image types — PNG/JPEG/GIF/WebP; executable SVG не принимается
как inline upload. Data attachments скачиваются, а не открываются как HTML-страницы.

React и PageEditor используют общие ImageBlock/FileBlock. Upload не заменяет
изменённый источник и не воскрешает удалённый блок. File paste/drop сохраняет
пакет одним undoable изменением; если за время загрузки изменились документ или
selection, поздняя вставка отменяется с явной ошибкой. Повтор должен быть явным.

Изображения поддерживают размер в пределах контейнера, caption, alternative text,
preview, crop, duplicate, move, delete и download. Crop использует browser canvas,
сохраняет PNG через тот же storage contract и восстанавливается Undo. Для remote
image нужен CORS от сервера; анимированный файл при crop становится одним кадром.
Ограничение canvas — 16 megapixels. Нет скрытого fetch к стороннему proxy.

Поиск в каталогах включается только через `host.imageSources`:

```ts
const host = {
  imageSources: [{
    id: 'company-library',
    label: 'Library',
    async search(query, signal) {
      // Call your own authenticated asset service; keep provider secrets on its server.
      return [{ id: 'cover', src: 'https://assets.example/cover.png', alt: 'Cover' }];
    },
  }],
};
```

Поиск отменяет устаревший запрос, показывает loading/error/empty, принимает только
HTTP(S) results и ограничивает одну страницу 40 items. Без adapter интерфейс
показывает Upload/Link; фиктивных вкладок Unsplash/GIPHY нет. Владелец adapter
соблюдает условия своего каталога, attribution и tracking downloads.
