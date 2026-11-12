import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// design-tokens.json → packages/theme/src/tokens/{palette,views}.css. tokens.css only imports them.
const source = new URL("../packages/theme/src/design-tokens.json", import.meta.url);
const targets = {
  palette: new URL("../packages/theme/src/tokens/palette.css", import.meta.url),
  views: new URL("../packages/theme/src/tokens/views.css", import.meta.url),
};
const tokens = JSON.parse(readFileSync(source, "utf8"));

const declarations = (values) =>
  Object.entries(values)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
const rules = (selector, values, mode) =>
  `${selector} {\n${declarations(values)}${mode ? `\n  color-scheme: ${mode};` : ""}\n}\n`;
const indent = (css) =>
  css
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n");
const references = (value) => [...value.matchAll(/var\((--gt-[\w-]+)/g)].map((match) => match[1]);

// A shared token that leads to the palette is declared again wherever the palette changes, so its
// var() resolves there; every other shared token is declared once.
const themed = new Set(Object.keys(tokens.light));
for (let grown = true; grown; ) {
  grown = false;
  for (const [key, value] of Object.entries(tokens.shared)) {
    if (!themed.has(key) && references(value).some((name) => themed.has(name))) {
      themed.add(key);
      grown = true;
    }
  }
}
const pick = (values, keep) => Object.fromEntries(Object.entries(values).filter(keep));
const sharedThemed = pick(tokens.shared, ([key]) => themed.has(key));
const sharedFixed = pick(tokens.shared, ([key]) => !themed.has(key));

// The palette lives on the root and on any element that names its theme; everything else, the
// editors included, inherits it, so a host's own --gt-* on a page's container reach the content.
const darkSelectors = '[data-theme="dark"]';
const palette = `${rules(':root,\n[data-theme="light"]', { ...sharedThemed, ...tokens.light }, "light")}\n${rules(darkSelectors, { ...sharedThemed, ...tokens.dark }, "dark")}\n@media (prefers-color-scheme: dark) {\n${indent(
  rules(":root:not([data-theme])", { ...sharedThemed, ...tokens.dark }, "dark"),
)}}\n`;

// Views: notion's values are the base of every view; a view changes only what makes it itself.
// A narrow container changes the tokens of the editor's children, never the markup.
const aliases = pick(tokens.view, ([, value]) => value.includes("var("));
const containers = ":is(.gotipe-block-editor, .gotipe-editor)";
const viewSelector = (name) => `[data-gt-view="${name}"]`;
const narrow = tokens.narrow.map(({ max, tokens: values, views: own = {} }) => {
  const inner = [
    rules(`${containers} > *`, { ...values, ...aliases }),
    ...Object.entries(own).map(([name, overrides]) =>
      rules(`${viewSelector(name)}${containers} > *,\n${viewSelector(name)} ${containers} > *`, {
        ...overrides,
        ...aliases,
      }),
    ),
  ].join("\n");
  return `@container (max-width: ${max}) {\n${indent(inner)}}\n`;
});
const views = [
  rules(":root", sharedFixed),
  rules(":root,\n[data-gt-view]", tokens.view),
  ...Object.entries(tokens.views).map(([name, values]) => rules(viewSelector(name), values)),
  ...narrow,
].join("\n");

const header = "/* Generated from design-tokens.json by scripts/generate-theme.mjs. */\n\n";
const require = createRequire(import.meta.url);
const format = (css, target) =>
  execFileSync(
    process.execPath,
    [
      require.resolve("@biomejs/biome/bin/biome"),
      "format",
      "--stdin-file-path",
      fileURLToPath(target),
    ],
    { input: header + css, encoding: "utf8" },
  );
const outputs = [
  [targets.palette, format(palette, targets.palette)],
  [targets.views, format(views, targets.views)],
];
if (process.argv.includes("--check")) {
  for (const [target, css] of outputs) {
    const current = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (current !== css) {
      console.error(`Theme CSS is out of date: ${fileURLToPath(target)}. Run pnpm generate:theme.`);
      process.exitCode = 1;
    }
  }
} else {
  mkdirSync(new URL(".", targets.palette), { recursive: true });
  for (const [target, css] of outputs) writeFileSync(target, css);
}
