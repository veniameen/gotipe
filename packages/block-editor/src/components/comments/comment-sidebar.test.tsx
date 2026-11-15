// @vitest-environment jsdom
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { DefaultPreset } from "@gotipe/core/presets";
import { GoTipeI18nProvider } from "@gotipe/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommentSidebar } from "../comment-sidebar";
import type { CommentData } from "./types";

let container: HTMLDivElement;
let root: Root;
let editor: GoTipeEditor;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  editor = await createEditor({ extensions: [DefaultPreset], content: "Text" });
});
afterEach(() => {
  act(() => root.unmount());
  editor.destroy();
  container.remove();
});

const thread = (id: string, resolved: boolean): CommentData => ({
  id,
  author: "Анна",
  timestamp: 0,
  body: `Комментарий ${id}`,
  quotedText: "Text",
  anchorBlockId: "missing",
  orphaned: true,
  resolved,
  replies: [],
});
const comments = [thread("1", false), thread("2", false), thread("3", true)];
const actions = {
  onAddReply: () => {},
  onResolve: () => {},
  onUnresolve: () => {},
  onDelete: () => {},
  onToggleCollapse: () => {},
};

function render(locale: string, collapsed = false) {
  act(() =>
    root.render(
      <GoTipeI18nProvider locale={locale}>
        <CommentSidebar
          editor={editor}
          comments={comments}
          currentUser="Анна"
          collapsed={collapsed}
          {...actions}
        />
      </GoTipeI18nProvider>,
    ),
  );
}
const words = () =>
  [...container.querySelectorAll("button, h2, p, label, aside, textarea")].flatMap((node) =>
    [
      node.getAttribute("aria-label"),
      node.getAttribute("placeholder"),
      [...node.childNodes]
        .filter((child) => child.nodeType === 3)
        .map((child) => child.textContent),
    ]
      .flat()
      .filter((text): text is string => !!text?.trim()),
  );
const click = (name: string) =>
  act(() =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === name)
      ?.click(),
  );

describe("CommentSidebar (D-34)", () => {
  it("speaks the interface's language", () => {
    render("ru");
    click("Ответить");
    expect(words()).toEqual([
      "Комментарии",
      "Комментарии",
      "Свернуть панель",
      "Свернуть",
      "Открытые (2)",
      "Решённые (1)",
      "Предыдущий комментарий",
      "Назад",
      "Следующий комментарий",
      "Далее",
      "Процитированный текст изменён или удалён.",
      "Комментарий 1",
      "Перейти к цитате в тексте",
      "Показать цитату",
      "Решено",
      "Удалить комментарий",
      "Удалить",
      "Отвечает Анна",
      "Ответ",
      "Ответ…",
      "Отправить ответ",
      "Отмена",
      "Процитированный текст изменён или удалён.",
      "Комментарий 2",
      "Перейти к цитате в тексте",
      "Показать цитату",
      "Решено",
      "Удалить комментарий",
      "Удалить",
      "Ответить",
    ]);
    click("Решённые (1)");
    expect(words()).toContain("Вернуть в открытые");
    expect(words()).toContain("Открыть снова");
    render("ru", true);
    expect(words()).toEqual(["Комментарии", "Развернуть комментарии", "Комментарии (2)"]);
  });

  it("keeps its English words without a provider's language", () => {
    render("en");
    expect(words().slice(0, 6)).toEqual([
      "Comments",
      "Comments",
      "Collapse sidebar",
      "Collapse",
      "Open (2)",
      "Resolved (1)",
    ]);
    act(() => root.render(<CommentSidebar editor={editor} comments={[]} {...actions} />));
    expect(words()).toContain("No open comments");
  });
});
