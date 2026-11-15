import { en } from "@gotipe/i18n";
import { describe, expect, it } from "vitest";
import { blockEditorEn } from "./en";

declare global {
  interface ImportMeta {
    glob(
      pattern: string[],
      options: { query: string; import: string; eager: true },
    ): Record<string, string>;
  }
}

/** The code of every package, read by Vite at test time. */
const SOURCES = import.meta.glob(["../../../*/src/**/*.{ts,tsx,vue,svelte}", "!**/*.test.*"], {
  query: "?raw",
  import: "default",
  eager: true,
});
/** The dictionaries and their key lists name every key; they are not uses. */
const DICTIONARIES = [
  "/i18n/src/locales/",
  "/i18n/src/types.ts",
  "/i18n/src/block-editor-keys.ts",
  "/block-editor/src/i18n/en.ts",
  "/block-editor/src/i18n/ru.ts",
];
const code = Object.entries(SOURCES)
  .filter(([path]) => !DICTIONARIES.some((dictionary) => path.includes(dictionary)))
  .map(([, text]) => text)
  .join("\n");

/** A key is used when code names it, names its plural base, or builds it from its prefix. */
function used(key: string): boolean {
  const named = (name: string) => [`"${name}"`, `'${name}'`, `\`${name}\``];
  const plural = key.match(/^(.+)\.(one|few|many)$/);
  const names = [...named(key), ...(plural ? named(plural[1] as string) : [])];
  const parts = key.split(".");
  const built = parts.slice(1).map((_, end) => `\`${parts.slice(0, end + 1).join(".")}.\${`);
  return [...names, ...built].some((text) => code.includes(text));
}

describe("the dictionaries (D-34)", () => {
  it("hold only keys that a component uses", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(300);
    expect(code).toContain("comments.replyAs");
    const keys = [...Object.keys(en), ...Object.keys(blockEditorEn)];
    expect(keys.filter((key) => !used(key))).toEqual([]);
  });
});
