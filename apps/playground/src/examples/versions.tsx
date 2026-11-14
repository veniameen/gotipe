import { type HistoryVersion, PageEditor, VersionHistory } from "@gotipe/block-editor";
import type { Block, Document, GoTipeEditor } from "@gotipe/core";
import { GoTipeI18nProvider } from "@gotipe/react";
import { useCallback, useState } from "react";
import "./versions/versions.css";

const PAGE = `### Порядок выката

Журнал включают по шагам, каждый — после недели наблюдения.

1. Включить журнал для 5\u00a0% пользователей веб-версии.
2. Неделю сравнивать долю потерянных правок с контрольной группой.
3. Открыть всем, начиная с приложения для macOS.

Черновик шифруется ключом сессии с первого дня.

Возражения принимаем до 18 ноября — в обсуждении ADR-0031.
`;

const ME = { name: "Мария Лебедева", person: 2 as const };

/** A copy of the page with one block's text replaced, a block removed or a block put after another. */
function edit(page: Document, change: (blocks: Block[]) => Block[]): Document {
  return { ...page, blocks: change(structuredClone(page.blocks)) };
}
const setText = (block: Block, text: string): Block => ({
  ...block,
  content: [{ text, marks: [] }],
});
const paragraph = (id: string, text: string): Block => ({
  id,
  type: "paragraph",
  attrs: {},
  content: [{ text, marks: [] }],
  children: [],
});
const at = (daysAgo: number, hours: number, minutes: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hours, minutes, 0, 0);
  // a version saved «today» is never later than now: two hours back at the latest
  const latest = Date.now() - 2 * 60 * 60 * 1000;
  return new Date(Math.min(date.getTime(), latest)).toISOString();
};

/**
 * The host's saved versions, made from the page as it opened: the same block ids, so the panel
 * compares blocks, not texts. A real host loads them from its storage.
 */
function seed(page: Document): HistoryVersion[] {
  const text = (block: Block) =>
    Array.isArray(block.content) ? block.content.map((span) => span.text).join("") : "";
  const release = edit(page, (blocks) =>
    blocks.map((block) => {
      if (block.type === "orderedList" && block.children.length > 2)
        return {
          ...block,
          children: [
            setText(block.children[0]!, "Включить журнал для 10\u00a0% пользователей веб-версии."),
            ...block.children.slice(1, -1),
          ],
        };
      if (text(block).startsWith("Черновик шифруется"))
        return paragraph("history-encryption", "Шифрование черновика — после выпуска.");
      return block;
    }),
  );
  const review = edit(release, (blocks) => blocks.slice(0, 3));
  const yesterday = edit(release, (blocks) => blocks.slice(0, 4));
  const morning = edit(page, (blocks) => blocks.slice(0, -1));
  return [
    {
      id: "review",
      name: "Черновик для ревью",
      createdAt: at(7, 16, 20),
      createdBy: ME.name,
      person: 2,
      snapshot: review,
    },
    {
      id: "noon",
      name: "",
      auto: true,
      createdAt: at(1, 12, 5),
      createdBy: "Анна Ковалёва",
      person: 3,
      snapshot: yesterday,
    },
    {
      id: "release",
      name: "Выпуск 2.8",
      createdAt: at(1, 18, 40),
      createdBy: "Илья Орлов",
      person: 1,
      snapshot: release,
    },
    {
      id: "morning",
      name: "",
      auto: true,
      createdAt: at(0, 11, 5),
      createdBy: "Илья Орлов",
      person: 1,
      snapshot: morning,
    },
  ];
}

/**
 * Version history (GoTipe Atlas, frame 30): the library's panel beside a page. The host owns the
 * versions — here a list in memory; it saves a version and keeps the entries of a restore.
 */
export function VersionsExample() {
  const [markdown, setMarkdown] = useState(PAGE);
  const [editor, setEditor] = useState<GoTipeEditor | null>(null);
  const [versions, setVersions] = useState<HistoryVersion[]>([]);
  const [open, setOpen] = useState(true);
  const ready = useCallback((value: GoTipeEditor) => {
    setEditor(value);
    setVersions(seed(value.getJSON()));
  }, []);
  const save = (name: string, snapshot: Document) =>
    setVersions((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        createdBy: ME.name,
        person: ME.person,
        snapshot,
      },
    ]);

  return (
    <GoTipeI18nProvider locale="ru">
      <div data-gotipe-example="versions" className="gotipe-versions-example">
        <div className="gotipe-versions-actions">
          <button
            type="button"
            className="gotipe-btn"
            data-gotipe-action="create-version"
            disabled={!editor}
            onClick={() => editor && save(`Версия ${versions.length + 1}`, editor.getJSON())}
          >
            Сохранить версию
          </button>
          <button
            type="button"
            className="gotipe-btn"
            data-gotipe-action="show-history"
            aria-pressed={open}
            onClick={() => setOpen((value) => !value)}
          >
            История
          </button>
        </div>
        <VersionHistory
          editor={editor}
          versions={versions}
          user={ME}
          open={open}
          onClose={() => setOpen(false)}
          onRestore={(_, { unsaved, names }) => {
            if (unsaved) save(names.unsaved, unsaved);
            if (editor) save(names.restored, editor.getJSON());
          }}
        >
          <PageEditor markdown={markdown} onChange={setMarkdown} onReady={ready} locale="ru" />
        </VersionHistory>
      </div>
    </GoTipeI18nProvider>
  );
}
