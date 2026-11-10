import { expect, it, vi } from "vitest";
import { createShikiHighlighter } from "./shiki";

it("loads only a requested grammar and preserves Unicode, trailing newlines and both themes", async () => {
  const language = vi.fn(() => import("shiki/langs/javascript.mjs"));
  const highlighter = createShikiHighlighter({
    langs: { javascript: language },
    aliases: { js: "javascript", constructor: "javascript" },
    themes: {
      light: () => import("shiki/themes/github-light.mjs"),
      dark: () => import("shiki/themes/github-dark.mjs"),
    },
  });
  expect(await highlighter("hello", "unknown-language")).toBeNull();
  expect(language).not.toHaveBeenCalled();
  const code = "const привет = '😀';\n";
  const lines = await highlighter(code, "js");
  expect(lines?.map((line) => line.map((token) => token.content).join("")).join("\n")).toBe(code);
  expect(lines?.flat().some((token) => token.color && token.darkColor)).toBe(true);
  await highlighter("let x = 1;", "javascript");
  expect(await highlighter("let x = 1;", "constructor")).not.toBeNull();
  expect(language).toHaveBeenCalledOnce();
});

it("does not load themes or inherited grammar/alias keys for unsupported languages", async () => {
  const language = vi.fn(() => import("shiki/langs/javascript.mjs"));
  const light = vi.fn(() => import("shiki/themes/github-light.mjs"));
  const dark = vi.fn(() => import("shiki/themes/github-dark.mjs"));
  const inheritedLanguages = Object.create({ javascript: language });
  const inheritedAliases = Object.create({ inheritedAlias: "javascript" });
  for (const options of [
    { langs: {} },
    { langs: inheritedLanguages },
    { langs: { javascript: language }, aliases: inheritedAliases },
  ]) {
    const highlighter = createShikiHighlighter({ ...options, themes: { light, dark } });
    for (const id of ["constructor", "__proto__", "toString", "inheritedAlias"]) {
      expect(await highlighter("const x = 1;", id)).toBeNull();
    }
    if (options.langs === inheritedLanguages) {
      expect(await highlighter("const x = 1;", "javascript")).toBeNull();
    }
  }
  expect(language).not.toHaveBeenCalled();
  expect(light).not.toHaveBeenCalled();
  expect(dark).not.toHaveBeenCalled();
});

it("allows retry after a failed lazy grammar load", async () => {
  let attempts = 0;
  const highlighter = createShikiHighlighter({
    langs: {
      javascript: async () => {
        if (++attempts === 1) throw new Error("Grammar chunk unavailable");
        return import("shiki/langs/javascript.mjs");
      },
    },
    themes: {
      light: () => import("shiki/themes/github-light.mjs"),
      dark: () => import("shiki/themes/github-dark.mjs"),
    },
  });
  await expect(highlighter("const x = 1;", "javascript")).rejects.toThrow(
    "Grammar chunk unavailable",
  );
  expect(await highlighter("const x = 1;", "javascript")).not.toBeNull();
  expect(attempts).toBe(2);
});
