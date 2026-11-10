// @vitest-environment jsdom
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HighlightedLines } from "../views/highlighted-lines";
import type { CodeHighlighter, HighlightToken } from "./types";
import { useHighlightedCode } from "./use-highlighted-code";

let container: HTMLDivElement;
let root: Root;
function Surface({ code, highlight }: { code: string; highlight: CodeHighlighter }) {
  const lines = useHighlightedCode(highlight, code, "typescript", 10);
  return <code>{lines ? <HighlightedLines lines={lines} /> : code}</code>;
}
function render(code: string, highlight: CodeHighlighter) {
  act(() => root.render(<Surface code={code} highlight={highlight} />));
}
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});
it("preserves exact Unicode and trailing newline when highlighting succeeds", async () => {
  const code = "const привет = '😀';\n";
  render(code, async () => [[{ content: code.slice(0, -1), color: "#ff0000" }], []]);
  await settle();
  expect(container.textContent).toBe(code);
  expect(container.querySelector(".gotipe-code-token")).not.toBeNull();
});
it("keeps raw code when a highlighter drops text or changes line endings", async () => {
  for (const [code, tokens] of [
    ["a😀b", "ab"],
    ["a\r\nb", "a\nb"],
  ] as const) {
    render(code, async () => tokens.split("\n").map((content) => [{ content }]));
    await settle();
    expect(container.textContent).toBe(code);
    expect(container.querySelector(".gotipe-code-token")).toBeNull();
  }
});
it("keeps raw code for synchronous throws and asynchronous errors", async () => {
  const failing: CodeHighlighter[] = [
    () => {
      throw new Error("Grammar unavailable");
    },
    async () => {
      throw new Error("Grammar unavailable");
    },
  ];
  for (const highlight of failing) {
    render("safe text", highlight);
    await settle();
    expect(container.textContent).toBe("safe text");
  }
});
it("rejects malformed runtime tokens before React renders their content", async () => {
  const malformed = [[{ content: {} }]] as unknown as HighlightToken[][];
  render("[object Object]", async () => malformed);
  await settle();
  expect(container.textContent).toBe("[object Object]");
  expect(container.querySelector(".gotipe-code-token")).toBeNull();
});
it("discards a late result after a newer request completes", async () => {
  const resolve = new Map<string, (lines: HighlightToken[][]) => void>();
  const highlight: CodeHighlighter = (code) =>
    new Promise((done) => {
      resolve.set(code, done);
    });
  render("old", highlight);
  await settle();
  render("new", highlight);
  await settle();
  await act(async () => {
    resolve.get("new")?.([[{ content: "new", color: "#00ff00" }]]);
  });
  await act(async () => {
    resolve.get("old")?.([[{ content: "old", color: "#ff0000" }]]);
  });
  expect(container.textContent).toBe("new");
  expect(container.querySelector("span")?.style.getPropertyValue("--gt-code-token")).toBe(
    "#00ff00",
  );
});
it("cancels a scheduled request when the view unmounts", async () => {
  const highlight = vi.fn<CodeHighlighter>(async () => null);
  render("code", highlight);
  act(() => root.render(null));
  await settle();
  expect(highlight).not.toHaveBeenCalled();
});
