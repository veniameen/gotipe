// @vitest-environment jsdom
import type { CreateEditorOptions, GoTipeError as GoTipeErrorType } from "@gotipe/core";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** What `createEditor` returns instead of an editor; `null` creates the editor. */
const creation = vi.hoisted(() => ({ next: null as null | (() => Promise<never>) }));
vi.mock("@gotipe/core/js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@gotipe/core/js")>();
  return {
    ...original,
    createEditor: (options: CreateEditorOptions) =>
      creation.next ? creation.next() : original.createEditor(options),
  };
});
import { GoTipeError } from "@gotipe/core/js";
import { PageEditor } from "./page-editor";

/** Node's process of the test runner; the package does not depend on Node's types. */
declare const process: {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  off(event: "unhandledRejection", listener: (reason: unknown) => void): void;
};

let container: HTMLDivElement;
let root: Root;
let unhandled: unknown[];
const remember = (reason: unknown) => unhandled.push(reason);
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  unhandled = [];
  process.on("unhandledRejection", remember);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  process.off("unhandledRejection", remember);
  creation.next = null;
  vi.restoreAllMocks();
});

describe("PageEditor when the editor cannot be created (D-142)", () => {
  it("reports the failure to onError and host.onError and shows it instead of loading", async () => {
    const failure = new GoTipeError("VALIDATION_ERROR", "Document is invalid");
    creation.next = () => Promise.reject(failure);
    const onError = vi.fn();
    const hostError = vi.fn();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      root.render(
        <PageEditor
          markdown={"# Notes\n"}
          locale="en"
          onError={onError}
          host={{ onError: hostError }}
        />,
      );
      await settle();
    });
    expect(unhandled).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(hostError).toHaveBeenCalledWith(failure);
    expect(logged).not.toHaveBeenCalled();
    expect(container.querySelector("[data-gotipe-skeleton]")).toBeNull();
    const alert = container.querySelector("[data-gotipe-editor-error]");
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toBe("The document could not be opened");
  });

  it("turns another reason into a GoTipeError and logs it without onError", async () => {
    const reason = new SyntaxError("Unreadable Markdown");
    creation.next = () => Promise.reject(reason);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      root.render(<PageEditor markdown={"# Notes\n"} locale="ru" />);
      await settle();
    });
    expect(unhandled).toEqual([]);
    expect(logged).toHaveBeenCalledTimes(1);
    const [message, error] = logged.mock.calls[0] as [string, GoTipeErrorType];
    expect(message).toBe("GoTipe: Failed to create editor:");
    expect(error).toBeInstanceOf(GoTipeError);
    expect(error.code).toBe("EDITOR_NOT_INITIALIZED");
    expect(error.message).toBe("Unreadable Markdown");
    expect(error.details?.cause).toBe(reason);
    expect(container.querySelector("[data-gotipe-editor-error]")?.textContent).toBe(
      "Документ не открылся",
    );
  });

  it("reports nothing when the page is gone before the creation fails", async () => {
    let reject!: (reason: unknown) => void;
    creation.next = () =>
      new Promise<never>((_, fail) => {
        reject = fail;
      });
    const onError = vi.fn();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      root.render(<PageEditor markdown={"# Notes\n"} locale="en" onError={onError} />);
    });
    act(() => root.unmount());
    root = createRoot(container);
    reject(new Error("late"));
    await act(settle);
    expect(unhandled).toEqual([]);
    expect(onError).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });
});
