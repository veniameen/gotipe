import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { HighlightedLines } from "../views/highlighted-lines";
import { createShikiHighlighter, gotipeCodeThemeLoader } from "./shiki";

it("colours code with the theme's syntax tokens in light and dark", async () => {
  const highlighter = createShikiHighlighter({
    langs: { typescript: () => import("shiki/langs/typescript.mjs") },
    themes: { light: gotipeCodeThemeLoader, dark: gotipeCodeThemeLoader },
  });
  const lines = await highlighter('// note\nconst x: Draft = "a" + 1;', "typescript");
  const colour = (text: string) => lines?.flat().find((token) => token.content.trim() === text);
  expect(colour("const")?.color).toBe("var(--gt-syn-keyword)");
  expect(colour("const")?.darkColor).toBe("var(--gt-syn-keyword)");
  expect(colour("1")?.color).toBe("var(--gt-syn-number)");
  expect(lines?.flat().some((token) => token.color === "var(--gt-syn-string)")).toBe(true);
  expect(lines?.flat().some((token) => token.color === "var(--gt-syn-comment)")).toBe(true);
});

it("renders the syntax tokens and drops any other variable reference", () => {
  const html = renderToStaticMarkup(
    <HighlightedLines
      lines={[
        [
          { content: "const", color: "var(--gt-syn-keyword)" },
          { content: " x", color: "var(--gt-text); background: red" },
        ],
      ]}
    />,
  );
  expect(html).toContain("--gt-code-token:var(--gt-syn-keyword)");
  expect(html).not.toContain("background");
});
