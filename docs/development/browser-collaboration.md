# Подключение браузерного редактора к Cloud

`@gotipe/collaboration` передаёт операции собственного Rust/WASM CRDT.
Для этого сценария создавай редактор с `engine: "wasm"`: JS-only entry явно
возвращает `COLLABORATION_UNAVAILABLE`, а не имитирует синхронизацию копиями JSON.
Точный формат сервера: [replication contract](collaboration-protocol.md).

## Загрузка и запуск

GET `/v1/documents/{id}` возвращает `content` для отображения и
`collaboration_state: { baseline, updates }` для восстановления реплики.
В SDK поле называется `collaborationState`; вложенные CRDT данные не переименовываются.
Создай редактор из baseline и примени **все** updates перед началом ввода.
Один materialized content не содержит идентичностей и истории репликации.

```ts
import { createEditor } from "@gotipe/core";
import { FullPreset } from "@gotipe/core/presets";
import { CollaborationProvider } from "@gotipe/collaboration";

async function openDocument(
  documentId: string,
  apiUrl: string,
  wsUrl: string,
  getToken: () => Promise<string>,
) {
  const response = await fetch(`${apiUrl}/v1/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${await getToken()}` },
  });
  if (!response.ok) throw new Error(`Document load failed: ${response.status}`);
  const { collaboration_state: initialState } = await response.json();
  const editor = await createEditor({
    engine: "wasm",
    content: initialState.baseline,
    extensions: [FullPreset],
  });
  const provider = new CollaborationProvider({
    documentId,
    wsUrl,
    initialState,
    peerId: crypto.randomUUID(),
    token: getToken,
    user: { name: "Alice", color: "#3264ab" },
  });
  provider.connect(editor);
  return { editor, provider };
}
```

`peerId` принадлежит одной живой реплике и сохраняется при reconnect. Разные
вкладки получают разные IDs. Повторный connect с другим редактором запрещён.
`initialState` применяется один раз; переподключение не заменяет локальный документ.

## Состояние сохранения

`getState()` / `onStateChange` описывают соединение. `connected` означает завершённый
обмен начальным состоянием. `getSyncState()` / `onSyncChange` возвращают
`pendingOperations` и `saving`: интерфейс может показывать несохранённые правки.

Сервер подтверждает пакет только после устойчивой записи. Провайдер держит один
пакет в полёте, отправляет только неподтверждённые IDs и повторяет их после разрыва.
Если подтверждение потерялось, handshake обнаруживает уже записанные операции.
Ошибки сохранения и протокола приходят в `onError`; они не превращаются в успех.

`disconnect()` закрывает соединение и подписки без автоматического reconnect;
`connect(editor)` возобновляет работу той же реплики. Несохранённые операции
сохраняются **в памяти редактора**. Переживание закрытия вкладки требует host storage
для baseline и `editor.getCollaborationUpdate()`; провайдер сам не пишет в IndexedDB.
`destroy()` окончателен, игнорирует поздние token promises и освобождает ресурсы.

## Авторизация и присутствие

Браузер передаёт краткоживущий JWT в credential subprotocol; секрет не попадает в URL.
Cloud проверяет token, scope, роль и доступ к документу до upgrade и не возвращает
credential subprotocol клиенту. `token`-функция позволяет обновлять JWT при reconnect.
`SYNC_ALLOWED_ORIGINS` содержит точные разрешённые frontend origins; wildcard не принят.

Peer awareness содержит имя, цвет, курсор и выделение. Провайдер обновляет слой
`collaboration` и `onPeersChange`, очищает его при disconnect и при сообщении удаления.
Он не изменяет документ ради курсора. Закрывая компонент, вызывай `provider.destroy()`
и `editor.destroy()`; уничтожение редактора также отключает провайдер.

## Локальное использование

`LocalCollaborationBridge` связывает несколько редакторов одной baseline без сервера.
Он передаёт те же CRDT updates и сохраняет идентичности блоков/символов. Это удобный
локальный пример; он не предоставляет дисковое хранение или удалённую авторизацию.

## Проверенное состояние

Контрактные тесты провайдера покрывают ACK, reconnect, потерю ACK, отказ сохранения,
намеренное отключение, позднюю авторизацию, malformed data и presence cleanup.
Реальный Chrome + локальный Cloud/PostgreSQL: две WASM реплики сделали конкурентные
правки с кириллицей/emoji без соединения, сошлись после reconnect, дождались ACK,
а новый редактор восстановил тот же текст из GET baseline и durable updates.
Локальное доказательство: `output/cloud-validation/browser-sync-result.json`.
