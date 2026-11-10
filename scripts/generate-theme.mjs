import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const source = new URL("../packages/theme/src/design-tokens.json", import.meta.url);
const target = new URL("../packages/theme/src/tokens.css", import.meta.url);
const tokens = JSON.parse(readFileSync(source, "utf8"));
const rules = (selector, values, mode) =>
  `${selector} {\n${Object.entries(values)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n")}\n  color-scheme: ${mode};\n}\n`;
const darkSelectors =
  '[data-theme="dark"],\n.gotipe-page[data-theme="dark"],\n[data-theme="dark"] .gotipe-page:not([data-theme="light"])';
const generated = `/* Generated from design-tokens.json by scripts/generate-theme.mjs. */\n\n${rules(':root,\n.gotipe-page,\n[data-theme="light"]', { ...tokens.shared, ...tokens.light }, "light")}\n${rules(darkSelectors, { ...tokens.shared, ...tokens.dark }, "dark")}\n@media (prefers-color-scheme: dark) {\n${rules(
  ":root:not([data-theme]),\n:root:not([data-theme]) .gotipe-page:not([data-theme]):not([data-theme] *)",
  { ...tokens.shared, ...tokens.dark },
  "dark",
)
  .split("\n")
  .map((line) => (line ? `  ${line}` : line))
  .join("\n")}\n}\n`;
const require = createRequire(import.meta.url);
const formatted = execFileSync(
  process.execPath,
  [
    require.resolve("@biomejs/biome/bin/biome"),
    "format",
    "--stdin-file-path",
    fileURLToPath(target),
  ],
  { input: generated, encoding: "utf8" },
);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== formatted) {
    console.error("Theme CSS is out of date. Run pnpm generate:theme.");
    process.exitCode = 1;
  }
} else writeFileSync(target, formatted);
