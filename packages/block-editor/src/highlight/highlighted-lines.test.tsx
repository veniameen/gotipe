import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HighlightedLines } from "../views/highlighted-lines";
import type { HighlightToken } from "./types";

it("ignores malformed font flags without coercing values or losing token text", () => {
  const invalid: unknown[] = [
    1n,
    Symbol("invalid"),
    "2",
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    8,
    1.5,
    {
      valueOf: () => {
        throw new Error("must not coerce");
      },
    },
  ];
  for (const fontStyle of invalid) {
    const token = { content: "<😀>", fontStyle } as HighlightToken;
    const html = renderToStaticMarkup(<HighlightedLines lines={[[token]]} />);
    expect(html).toBe('<span class="gotipe-code-token">&lt;😀&gt;</span>');
  }
});

it("renders valid font flags and safe colors while rejecting CSS declarations", () => {
  const html = renderToStaticMarkup(
    <HighlightedLines
      lines={[
        [
          { content: "safe", fontStyle: 7, color: "#123456", darkColor: "rgb(10, 20, 30)" },
          { content: "plain", color: "red;position:fixed", darkColor: "url(https://example.com)" },
        ],
      ]}
    />,
  );
  expect(html).toContain('data-italic="" data-bold="" data-underline=""');
  expect(html).toContain("--gt-code-token:#123456;--gt-code-token-dark:rgb(10, 20, 30)");
  expect(html).toContain('<span class="gotipe-code-token">plain</span>');
});
