import { expect, it } from "vitest";

/** Node's process and file reader of the test runner; the package has no Node types. */
declare const process: { cwd(): string };
type FileReader = { readFileSync(path: string, encoding: "utf8"): string };
const fs = "node:fs";

it("loads the document styles and the theme from @gotipe/block-editor/styles (D-72)", async () => {
  // Vitest gives CSS modules no text: the entry is read from disk.
  const { readFileSync } = (await import(/* @vite-ignore */ fs)) as FileReader;
  const imports = [
    ...readFileSync(`${process.cwd()}/styles.css`, "utf8").matchAll(/@import "([^"]+)";/g),
  ].map((match) => match[1]);
  expect(imports).toEqual(["@gotipe/theme/base.css", "@gotipe/theme/theme.css"]);
});
