// @vitest-environment jsdom
import type { GoTipeError } from "@gotipe/core";
import type { ReviewComment } from "@gotipe/suggestions";
import { act, createRef } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageEditor, type PageEditorHandle } from "../page/page-editor";
import type { PageReviewProps } from "./review-layer";

let container: HTMLDivElement;
let root: Root;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class NoResize {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("ResizeObserver", NoResize);
  vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/["\\]/g, "\\$&") });
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...rect, toJSON() {} }) as DOMRect;
  Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const markdown = "# Notes\n\nThe quick brown fox.\n";
const comment: ReviewComment = {
  id: "c1",
  laneId: "agent",
  anchor: { before: "The ", quote: "quick", after: " brown" },
  text: "Is it quick?",
};

async function mount(review: Partial<PageReviewProps>, locale = "en") {
  const ref = createRef<PageEditorHandle>();
  const errors: GoTipeError[] = [];
  const draw = (comments: ReviewComment[]) =>
    root.render(
      <PageEditor
        ref={ref}
        markdown={markdown}
        locale={locale}
        onError={(error) => errors.push(error)}
        review={{
          lanes: [{ id: "agent", name: "Agent", kind: "agent" }],
          proposals: [],
          comments,
          ...review,
        }}
      />,
    );
  await act(async () => {
    draw([comment]);
    await wait(60);
  });
  await act(async () => {
    ref.current?.review?.focus("c1");
    await wait(30);
  });
  return { ref, errors, draw };
}

const card = () => document.querySelector('[data-gotipe-review-card="comment"]');
const deleteButton = () => document.querySelector<HTMLButtonElement>(".gotipe-review-card-delete");

describe("comment card delete (onDeleteComment)", () => {
  it("has no delete button without the callback", async () => {
    await mount({});
    expect(card()).not.toBeNull();
    expect(deleteButton()).toBeNull();
  });

  it("shows a labelled trash button in the card head and calls the host", async () => {
    const onDeleteComment = vi.fn(async () => true);
    const { draw } = await mount({ onDeleteComment }, "ru");
    const button = deleteButton();
    expect(button?.closest(".gotipe-review-card-head")).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Удалить комментарий");
    expect(button?.getAttribute("title")).toBe("Удалить комментарий");
    await act(async () => {
      button?.click();
      await wait(10);
    });
    expect(onDeleteComment).toHaveBeenCalledWith("c1");
    // the host drops the comment: its card goes
    await act(async () => {
      draw([]);
      await wait(30);
    });
    expect(card()).toBeNull();
  });

  it("keeps the card when the host returns false", async () => {
    const onDeleteComment = vi.fn(() => false);
    const { errors } = await mount({ onDeleteComment });
    await act(async () => {
      deleteButton()?.click();
      await wait(10);
    });
    expect(onDeleteComment).toHaveBeenCalledOnce();
    expect(card()).not.toBeNull();
    expect(deleteButton()?.disabled).toBe(false);
    expect(errors).toEqual([]);
  });

  it("reports a thrown error as COMMENT_ACTION_FAILED and keeps the card", async () => {
    const onDeleteComment = vi.fn(async () => {
      throw new Error("disk full");
    });
    const { errors } = await mount({ onDeleteComment });
    await act(async () => {
      deleteButton()?.click();
      await wait(10);
    });
    expect(card()).not.toBeNull();
    expect(errors.map((e) => e.code)).toEqual(["COMMENT_ACTION_FAILED"]);
    expect(errors[0]?.message).toBe("disk full");
  });
});
