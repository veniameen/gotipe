// @vitest-environment jsdom
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PageHead } from "../components/page-head";
import { PageEditor } from "./page-editor";
import type { PageTitleLevel } from "./page-views";

let container: HTMLDivElement;
let root: Root;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const MARKDOWN = "# Meeting notes\n\nBody text.\n\n## Decisions\n\n# Appendix\n";
const headings = () =>
  [...container.querySelectorAll(".gotipe-content h1, .gotipe-content h2, .gotipe-content h3")].map(
    (element) =>
      `${element.tagName.toLowerCase()}${element.classList.contains("gotipe-page-title") ? ".title" : ""}: ${element.textContent}`,
  );

describe("the level of a page title (D-84)", () => {
  async function page(titleLevel?: PageTitleLevel) {
    await act(async () => {
      root.render(
        <PageEditor markdown={MARKDOWN} locale="en" autoFocus={false} titleLevel={titleLevel} />,
      );
      await wait(60);
    });
  }

  it("draws the file's leading heading as an h1 by default", async () => {
    await page();
    expect(headings()).toEqual(["h1.title: Meeting notes", "h2: Decisions", "h1: Appendix"]);
  });

  it("draws it at the host's level, other headings keep theirs", async () => {
    await page(2);
    expect(headings()).toEqual(["h2.title: Meeting notes", "h2: Decisions", "h1: Appendix"]);
  });

  it("gives PageHead the same choice, h1 by default", () => {
    act(() => root.render(<PageHead title="Roadmap" />));
    expect(container.querySelector(".gotipe-page-head-title")?.tagName).toBe("H1");
    act(() => root.render(<PageHead title="Roadmap" titleLevel={3} onTitleChange={() => {}} />));
    const title = container.querySelector(".gotipe-page-head-title");
    expect(title?.tagName).toBe("H3");
    expect(title?.getAttribute("role")).toBe("textbox");
    expect(container.querySelector("h1")).toBeNull();
  });
});
