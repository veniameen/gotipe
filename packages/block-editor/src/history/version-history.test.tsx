// @vitest-environment jsdom
import type { Block, Document } from "@gotipe/core";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { GoTipeI18nProvider } from "@gotipe/react";
import { VersionsManager } from "@gotipe/versions";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { HistoryVersion } from "./history-model";
import { VersionHistory, type VersionHistoryProps } from "./version-history";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const p = (id: string, text: string): Block => ({
  id,
  type: "paragraph",
  attrs: {},
  content: [{ text, marks: [] }],
  children: [],
});
const doc = (...blocks: Block[]): Document => ({ version: 1, blocks });
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanup.splice(0).reverse()) stop();
  document.body.innerHTML = "";
});

async function mount(
  props: Partial<VersionHistoryProps> & { editor?: GoTipeEditor; locale?: string } = {},
) {
  const { locale = "ru", ...own } = props;
  const editor =
    props.editor ??
    (await createEditor({ extensions: [], content: doc(p("a", "Журнал включают по шагам")) }));
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);
  const render = (next: Partial<VersionHistoryProps> = {}) =>
    act(() =>
      root.render(
        <GoTipeI18nProvider locale={locale}>
          <VersionHistory editor={editor} user={{ name: "Мария Лебедева" }} {...own} {...next}>
            <div className="page">page</div>
          </VersionHistory>
        </GoTipeI18nProvider>,
      ),
    );
  render();
  cleanup.push(() => {
    act(() => root.unmount());
    editor.destroy();
  });
  return { editor, host, root, render };
}
const rows = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('[role="option"]')).map((row) => ({
    name: row.querySelector(".gotipe-version-name")?.textContent,
    stat: row.querySelector(".gotipe-diff-stat")?.textContent,
    selected: row.getAttribute("aria-selected") === "true",
  }));
const key = (target: Element, name: string) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });

describe("version history panel", () => {
  it("lists versions with words changed and compares the chosen one with the page", async () => {
    const editor = await createEditor({
      extensions: [],
      content: doc(p("a", "Журнал включают по шагам"), p("b", "Шифрование после выпуска")),
    });
    const manager = new VersionsManager(editor);
    cleanup.push(() => manager.destroy());
    manager.createVersion("Выпуск 2.8", "Илья Орлов");
    editor.setContent(doc(p("a", "Журнал включают сразу"), p("c", "Черновик шифруется")), {
      addToHistory: true,
    });
    const { host } = await mount({ editor, source: manager });
    expect(rows(host)).toEqual([
      { name: "Текущая", stat: "+3 −5", selected: true },
      { name: "Выпуск 2.8", stat: "+7", selected: false },
    ]);
    expect(host.querySelector(".gotipe-review-title")?.textContent).toBe("Текущая");
    expect(host.querySelector(".page")?.closest("[hidden]")).toBeNull();
    await act(async () => host.querySelectorAll<HTMLElement>('[role="option"]')[1]!.click());
    expect(host.querySelector(".gotipe-history")?.getAttribute("data-screen")).toBe("page");
    expect(host.querySelector(".gotipe-review-title")?.textContent).toBe("Выпуск 2.8");
    expect(host.querySelector(".gotipe-history-head .gotipe-diff-stat")?.textContent).toBe(
      "+1 · −1 · 1 изменён",
    );
    const marks = Array.from(host.querySelectorAll("[data-diff]")).map((node) => [
      node.getAttribute("data-block-id"),
      node.getAttribute("data-diff"),
    ]);
    expect(marks).toEqual([
      ["a", "changed"],
      ["b", "removed"],
      ["c", "added"],
    ]);
    expect(host.querySelector('[data-block-id="a"] del')?.textContent).toBe("по шагам");
    expect(host.querySelector('[data-block-id="a"] ins')?.textContent).toBe("сразу");
    // the live page stays mounted under the comparison
    expect(host.querySelector(".page")?.closest("[hidden]")).not.toBeNull();
  });

  it("restores as one undo step, saves the entries and takes it back from the toast", async () => {
    const editor = await createEditor({ extensions: [], content: doc(p("a", "первый вариант")) });
    const manager = new VersionsManager(editor);
    cleanup.push(() => manager.destroy());
    manager.createVersion("Выпуск 2.8", "Илья Орлов");
    editor.setContent(doc(p("a", "второй вариант текста")), { addToHistory: true });
    const { host } = await mount({ editor, source: manager });
    await act(async () => host.querySelectorAll<HTMLElement>('[role="option"]')[1]!.click());
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-gotipe-action="restore-version"]')!.click(),
    );
    expect(editor.getText()).toBe("первый вариант");
    expect(host.querySelector(".gotipe-toast")?.textContent).toContain(
      "Восстановлена версия «Выпуск 2.8»",
    );
    expect(rows(host).map((row) => row.name)).toEqual([
      "Возврат к «Выпуск 2.8»",
      "До восстановления",
      "Выпуск 2.8",
    ]);
    expect(rows(host)[0]!.selected).toBe(true);
    expect(host.querySelector(".gotipe-review-title")?.textContent).toBe("Текущая");
    await act(async () => host.querySelector<HTMLButtonElement>(".gotipe-toast button")!.click());
    expect(editor.getText()).toBe("второй вариант текста");
    expect(host.querySelector(".gotipe-toast")).toBeNull();
    // one step: the edit before the restore is the next one back
    editor.undo();
    expect(editor.getText()).toBe("первый вариант");
  });

  it("moves along the list with the keys, closes with Escape and gives the focus back", async () => {
    const editor = await createEditor({ extensions: [], content: doc(p("a", "один")) });
    const versions: HistoryVersion[] = [
      {
        id: "v1",
        name: "Первая",
        createdAt: "2026-11-07T16:20:00Z",
        createdBy: "Анна Ковалёва",
        snapshot: doc(p("a", "ноль")),
      },
      {
        id: "v2",
        name: "Вторая",
        createdAt: "2026-11-08T16:20:00Z",
        createdBy: "Анна Ковалёва",
        snapshot: doc(p("a", "почти")),
      },
    ];
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const onClose = vi.fn();
    const { host, root } = await mount({ editor, versions, onClose });
    const options = () => Array.from(host.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(options().map((row) => row.tabIndex)).toEqual([0, -1, -1]);
    options()[0]!.focus();
    key(options()[0]!, "ArrowDown");
    expect(document.activeElement).toBe(options()[1]);
    key(options()[1]!, "End");
    expect(document.activeElement).toBe(options()[2]);
    key(options()[2]!, "Enter");
    expect(options()[2]!.getAttribute("aria-selected")).toBe("true");
    key(options()[2]!, "Home");
    expect(document.activeElement).toBe(options()[0]);
    key(options()[0]!, "Escape");
    expect(onClose).toHaveBeenCalledOnce();
    act(() => root.unmount());
    expect(document.activeElement).toBe(opener);
    cleanup.pop();
    editor.destroy();
  });

  it("undoes the restore when the host fails to keep it, and shows its states", async () => {
    const editor = await createEditor({ extensions: [], content: doc(p("a", "сейчас")) });
    const versions: HistoryVersion[] = [
      {
        id: "v1",
        name: "Старая",
        createdAt: "2026-11-07T16:20:00Z",
        createdBy: "Илья",
        snapshot: doc(p("a", "раньше")),
      },
    ];
    const onRestore = vi.fn().mockRejectedValue(new Error("offline"));
    const errors = vi.fn();
    editor.on("error", errors);
    const { host, render } = await mount({ editor, versions, onRestore });
    await act(async () => host.querySelectorAll<HTMLElement>('[role="option"]')[1]!.click());
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-gotipe-action="restore-version"]')!.click(),
    );
    expect(onRestore).toHaveBeenCalledWith(versions[0], {
      unsaved: expect.any(Object),
      names: { unsaved: "До восстановления", restored: "Возврат к «Старая»" },
    });
    expect(editor.getText()).toBe("сейчас");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      "Не удалось восстановить версию",
    );
    expect(errors).toHaveBeenCalled();
    render({ loading: true });
    expect(host.querySelector('[aria-busy="true"]')?.textContent).toBe("Загружаем версии…");
    const onRetry = vi.fn();
    render({ loading: false, error: "Нет сети", onRetry });
    expect(host.querySelector(".gotipe-panel [role=alert] p")?.textContent).toBe("Нет сети");
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".gotipe-panel .gotipe-btn")!.click(),
    );
    expect(onRetry).toHaveBeenCalledOnce();
    render({ error: null, versions: [] });
    expect(host.querySelector(".gotipe-panel .gotipe-history-note")?.textContent).toContain(
      "Версий пока нет",
    );
    editor.setEditable(false);
    render({ versions });
    await act(async () => host.querySelectorAll<HTMLElement>('[role="option"]')[1]!.click());
    expect(
      host.querySelector<HTMLButtonElement>('[data-gotipe-action="restore-version"]')!.disabled,
    ).toBe(true);
  });

  it("reads the page only while open, once typing pauses", async () => {
    vi.useFakeTimers();
    try {
      const editor = await createEditor({
        extensions: [],
        content: doc(p("a", "Журнал включают по шагам")),
      });
      const manager = new VersionsManager(editor);
      cleanup.push(() => manager.destroy());
      manager.createVersion("Выпуск 2.8", "Илья Орлов");
      const read = vi.spyOn(editor, "getJSON");
      const { host, render } = await mount({ editor, source: manager, open: false });
      read.mockClear();
      const type = (text: string) =>
        act(() => {
          editor.dispatch({
            steps: [{ type: "insertText", blockId: "a", offset: 0, text, marks: [] }],
          });
        });
      type("ё");
      act(() => vi.advanceTimersByTime(1000));
      // a closed panel does not follow the page
      expect(read).not.toHaveBeenCalled();
      render({ open: true });
      expect(rows(host)[0]).toMatchObject({ name: "Текущая" });
      read.mockClear();
      type("а");
      type("б");
      expect(read).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(500));
      expect(read).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dates versions in the browser's language when the locale is no language tag (D-220)", async () => {
    const editor = await createEditor({ extensions: [], content: doc(p("a", "один")) });
    const created = new Date("2025-11-07T16:20:00Z");
    const versions: HistoryVersion[] = [
      {
        id: "v1",
        name: "First",
        createdAt: created.toISOString(),
        createdBy: "Anna",
        snapshot: doc(p("a", "ноль")),
      },
    ];
    const browser = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(undefined, options).format(created);
    const time = browser({ hour: "2-digit", minute: "2-digit" });
    const { host } = await mount({ editor, versions, locale: "de_DE" });
    expect(rows(host).map((row) => row.name)).toEqual(["Current", "First"]);
    expect(host.querySelectorAll(".gotipe-history-day")[1]?.textContent).toBe(
      browser({ day: "numeric", month: "long", year: "numeric" }),
    );
    expect(host.querySelectorAll(".gotipe-version-meta time")[1]?.textContent).toBe(time);
    await act(async () => host.querySelectorAll<HTMLElement>('[role="option"]')[1]!.click());
    expect(host.querySelector(".gotipe-history-facts .gotipe-review-fact")?.textContent).toBe(
      `${browser({ day: "numeric", month: "long" })}, ${time}`,
    );
  });
});
