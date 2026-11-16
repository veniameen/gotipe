// @vitest-environment jsdom
import { GoTipeError, type GoTipeErrorCode } from "@gotipe/core";
import { type GoTipeEditor, createEditor } from "@gotipe/core/js";
import { DefaultPreset } from "@gotipe/core/presets";
import { GoTipeI18nProvider } from "@gotipe/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorErrorToast, EditorFailure } from "./editor-states";

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
  vi.restoreAllMocks();
});

function report(locale: string, code: GoTipeErrorCode, message: string) {
  act(() =>
    root.render(
      <GoTipeI18nProvider locale={locale}>
        <EditorErrorToast editor={editor} />
      </GoTipeI18nProvider>,
    ),
  );
  act(() => editor.reportError(new GoTipeError(code, message)));
  const toast = container.querySelector("[data-gotipe-toast]");
  return toast && [...toast.querySelectorAll("span")].map((span) => span.textContent);
}

describe("the error toast", () => {
  it("says a suggestion went stale in the interface's words, not the engine's", () => {
    const reason = "The suggestion anchor is ambiguous";
    expect(report("ru", "PROPOSAL_STALE", reason)).toEqual([
      "Предложение устарело",
      "Текст вокруг него изменился.",
    ]);
    act(() => root.unmount());
    root = createRoot(container);
    expect(report("en", "PROPOSAL_STALE", reason)).toEqual([
      "The suggestion is out of date",
      "The text around it has changed.",
    ]);
  });

  it("leaves extension errors and composition conflicts to the console", () => {
    const console = vi.spyOn(globalThis.console, "error").mockImplementation(() => {});
    expect(report("ru", "EXTENSION_ERROR", "Listener failed: update")).toBeNull();
    expect(report("ru", "COMPOSITION_CONFLICT", "An outside change ended the input")).toBeNull();
    expect(console.mock.calls.map(([error]) => (error as GoTipeError).code)).toEqual([
      "EXTENSION_ERROR",
      "COMPOSITION_CONFLICT",
    ]);
  });

  it("keeps the error's own message under the title of other codes", () => {
    expect(report("ru", "TRANSFORM_ERROR", "Block not found: x")).toEqual([
      "Не удалось применить изменение",
      "Block not found: x",
    ]);
  });
});

describe("the page that could not be opened", () => {
  it("keeps its words apart from the glyph, so only the glyph is red", () => {
    act(() =>
      root.render(
        <GoTipeI18nProvider locale="ru">
          <EditorFailure />
        </GoTipeI18nProvider>,
      ),
    );
    const alert = container.querySelector("[data-gotipe-editor-error]");
    expect(alert?.getAttribute("role")).toBe("alert");
    expect([...(alert?.children ?? [])].map((child) => child.tagName.toLowerCase())).toEqual([
      "svg",
      "span",
    ]);
    expect(alert?.querySelector(".gotipe-editor-error-text")?.textContent).toBe(
      "Документ не открылся",
    );
  });
});
