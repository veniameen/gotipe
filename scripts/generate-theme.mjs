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
// The editor root resolves the aliases again: a host's palette on a container reaches them too.
const darkSelectors = '[data-theme="dark"]';
const palette = `${rules(':root,\n[data-theme="light"]', { ...sharedThemed, ...tokens.light }, "light")}\n${rules(darkSelectors, { ...sharedThemed, ...tokens.dark }, "dark")}\n@media (prefers-color-scheme: dark) {\n${indent(
  rules(":root:not([data-theme])", { ...sharedThemed, ...tokens.dark }, "dark"),
)}}\n\n${rules("[data-gt-view]", sharedThemed)}`;

// Views: notion's values are the base of every view; a view changes only what makes it itself.
// A narrow container changes the tokens of the editor's children, never the markup: its sizes
// (`tokens`, `views`) unless the container or an ancestor has data-gt-narrow="off", its layout
// (`layout`: what is shown and how it wraps) always.
// A narrow container re-declares the aliases that lead to what it changes, so they resolve with its
// values; an alias that a narrow container sets itself (a layout of its own) keeps that value.
const narrowOwn = new Set(
  tokens.narrow.flatMap(({ tokens: values, layout = {} }) => Object.keys({ ...values, ...layout })),
);
const aliases = pick(tokens.view, ([key, value]) => value.includes("var(") && !narrowOwn.has(key));
const leadingTo = (changed) => {
  const reached = new Set(changed);
  for (let grown = true; grown; ) {
    grown = false;
    for (const [key, value] of Object.entries(aliases)) {
      if (!reached.has(key) && references(value).some((name) => reached.has(name))) {
        reached.add(key);
        grown = true;
      }
    }
  }
  return pick(aliases, ([key]) => reached.has(key));
};
// the version history is a container of its own: on a phone its list and comparison are two screens
const containers = ":is(.gotipe-block-editor, .gotipe-editor, .gotipe-history-shell)";
const sized = `${containers}:where(:not([data-gt-narrow="off"], [data-gt-narrow="off"] *))`;
const viewSelector = (name) => `[data-gt-view="${name}"]`;
const narrow = tokens.narrow.map(({ max, tokens: values, layout = {}, views: own = {} }) => {
  const sizes = [values, ...Object.values(own)].flatMap(Object.keys);
  const inner = [
    [`${containers} > *`, { ...layout, ...leadingTo(Object.keys(layout)) }],
    [`${sized} > *`, { ...values, ...leadingTo(sizes) }],
    ...Object.entries(own).map(([name, overrides]) => [
      `${viewSelector(name)}${sized} > *,\n${viewSelector(name)} ${sized} > *`,
      overrides,
    ]),
  ]
    .filter(([, body]) => Object.keys(body).length > 0)
    .map(([selector, body]) => rules(selector, body))
    .join("\n");
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
