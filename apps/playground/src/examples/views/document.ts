/** The document of the GoTipe Atlas, frames 1–5: real text in every block the views draw. */

type Mark = { type: string; attrs?: Record<string, unknown> };
type Span = { text: string; marks: Mark[] };
interface Block {
  id: string;
  type: string;
  attrs: Record<string, unknown>;
  content: Span[] | string | null;
  children: Block[];
}

let next = 0;
const id = () => `atlas-${++next}`;
const text = (value: string, ...marks: Mark[]): Span => ({ text: value, marks });
const link = (href: string): Mark => ({ type: "link", attrs: { href } });
const block = (
  type: string,
  content: Span[] | string | null,
  attrs: Record<string, unknown> = {},
  children: Block[] = [],
): Block => ({ id: id(), type, attrs, content, children });
const paragraph = (...spans: Span[]) => block("paragraph", spans);
const heading = (level: number, value: string) => block("heading", [text(value)], { level });
const item = (value: string, children: Block[] = []) =>
  block("listItem", [text(value)], {}, children);
const list = (type: "bulletList" | "orderedList", items: Block[]) => block(type, null, {}, items);
const task = (value: string, checked: boolean) => block("todoItem", [text(value)], { checked });
const row = (cell: "tableHeader" | "tableCell", values: string[]) =>
  block(
    "tableRow",
    null,
    {},
    values.map((value) => block(cell, [text(value)])),
  );

export const ATLAS_DOCUMENT = {
  version: 1,
  blocks: [
    paragraph(
      text(
        "Правка, сделанная без сети, сейчас пропадает, если закрыть вкладку до того, как связь вернётся. В выпуске 2.8 редактор пишет каждую транзакцию в локальный журнал и отправляет его, как только сеть появится. Решение опирается на ",
      ),
      text("ADR-0031", link("https://example.com/adr-0031")),
      text(" и на обращения в поддержку за октябрь."),
    ),
    block(
      "callout",
      [
        text(
          "Черновик хранится только на устройстве и зашифрован ключом сессии. При выходе из аккаунта он удаляется вместе с ключом.",
        ),
      ],
      { type: "info", emoji: "" },
    ),
    heading(1, "Как это работает"),
    paragraph(
      text("Журнал лежит в "),
      text("IndexedDB", { type: "code" }),
      text(
        " и переживает перезапуск приложения. Сервер принимает пачку транзакций целиком или отклоняет её: ",
      ),
      text("половина пачки записаться не может", { type: "highlight" }),
      text("."),
    ),
    heading(2, "Что меняется"),
    list("bulletList", [
      item("Каждая транзакция сначала попадает в журнал и только потом — на сервер."),
      item(
        "Когда связь вернулась, журнал уходит пачкой, а сервер отвечает новой версией документа.",
      ),
      item("Конфликт решается по блокам:", [
        list("bulletList", [
          item("чужая правка блока не перезаписывает вашу;"),
          item("обе версии остаются, ваша — предложением правки."),
        ]),
      ]),
    ]),
    block(
      "codeBlock",
      '// Журнал пишется до отправки: закрытая вкладка ничего не теряет.\neditor.on("transaction", async ({ steps, version }: Transaction) => {\n  await drafts.append(documentId, { steps, version });\n  if (navigator.onLine) await drafts.flush(documentId, { retries: 3 });\n});',
      { language: "typescript" },
    ),
    heading(3, "Порядок выката"),
    list("orderedList", [
      item("Включить журнал для 5 % пользователей веб-версии."),
      item("Неделю сравнивать долю потерянных правок с контрольной группой."),
      item("Открыть всем, начиная с приложения для macOS."),
    ]),
    block(
      "callout",
      [
        text(
          "До выпуска 2.9 черновик не переносится между устройствами: правка с ноутбука не появится на телефоне, пока не отправлена.",
        ),
      ],
      { type: "warning", emoji: "" },
    ),
    heading(1, "Конфликты"),
    block("table", null, {}, [
      row("tableHeader", ["Ситуация", "Что видит автор", "Что сохраняется"]),
      row("tableCell", ["Блок изменён только у вас", "Ничего", "Ваша версия"]),
      row("tableCell", ["Блок изменён у обоих", "Предложение правки", "Обе версии"]),
      row("tableCell", ["Блок удалён на сервере", "Тост «Блок удалён»", "Ваша версия — в истории"]),
      row("tableCell", ["Документ удалён", "Окно восстановления", "Копия в «Черновиках»"]),
    ]),
    block("blockquote", [
      text("I wrote two pages on the train, and when I got off they were just gone."),
    ]),
    block("toggle", [text("Why not Background Sync?")], { open: true }, [
      paragraph(
        text(
          "Background Sync isn’t available in Safari, and our macOS app runs in WKWebView. A journal in IndexedDB behaves the same on every platform we ship, and the editor can read it back without the network.",
        ),
      ),
    ]),
    heading(2, "Задачи"),
    block("todoList", null, {}, [
      task("Схема журнала и миграция IndexedDB", true),
      task("Шифрование черновика ключом сессии", true),
      task("Индикатор «Не отправлено» в шапке документа", false),
      task("Метрика потерянных правок на дашборде выпуска", false),
    ]),
    block("divider", null),
    paragraph(
      text("Возражения принимаем до 18 ноября — в обсуждении ADR-0031 или в "),
      text("треде выпуска 2.8", link("https://example.com/release-2-8")),
      text("."),
    ),
  ],
};
