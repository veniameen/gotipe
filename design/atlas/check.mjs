#!/usr/bin/env node
// GoTipe Atlas — check. usage: node design/atlas/check.mjs [--no-shots]
// 1. atlas.html is the build of the current parts; 2. literal colours and sizes only in
// the token files, every var() defined, markup without inline styles or network; 3. in Chromium:
// no errors or requests, every figure in both themes of the switch, no overflow, overlap, text
// off its plate or weak contrast. Known problems (lib/known.mjs) are listed and
// pass. Frame screenshots go to output/atlas/ (ignored by Git).
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { OUTPUT, ROOT, SRC, assemble, atlasParts } from "./lib/assemble.mjs";
import { browserAudit } from "./lib/browser-audit.mjs";
import { sortProblems } from "./lib/known.mjs";
import { checkMarkup, checkStyles } from "./lib/static-rules.mjs";

const REPO = path.resolve(ROOT, "../..");
const SHOTS = path.join(REPO, "output", "atlas");
const noShots = process.argv.includes("--no-shots");

function filesIn(directory, pattern, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name;
    if (entry.isDirectory()) return filesIn(path.join(directory, entry.name), pattern, `${name}/`);
    return pattern.test(entry.name) ? [name] : [];
  });
}

const parts = atlasParts();
const problems = [];
let built = "";
try {
  built = readFileSync(OUTPUT, "utf8");
} catch {
  problems.push("atlas.html is missing — node design/atlas/build.mjs");
}
if (built && built !== assemble(parts))
  problems.push("atlas.html is stale — node design/atlas/build.mjs");

const styles = filesIn(SRC, /\.css$/);
for (const name of styles)
  if (!parts.styles.includes(name)) problems.push(`${name} is not built into the page`);
const { problems: styleProblems, defined } = checkStyles(parts.styles, parts.tokens);
problems.push(...styleProblems, ...checkMarkup(filesIn(SRC, /\.(?:html|svg)$/), defined));
if (!styles.length) problems.push("no styles found");

let frames = [];
let shots = [];
const audited = Boolean(built);
if (audited) {
  const { chromium } = createRequire(path.join(REPO, "package.json"))("@playwright/test");
  const audit = await browserAudit({ file: OUTPUT, shotsDir: noShots ? null : SHOTS, chromium });
  problems.push(...audit.problems);
  ({ frames, shots } = audit);
}

/** The weakest contrast of every measured role in each theme, with the frame it was found in. */
const weakest = new Map();
for (const frame of frames) {
  for (const [selector, value] of Object.entries(frame.contrast)) {
    const key = `${selector} · ${frame.theme}`;
    if (!weakest.has(key) || value < weakest.get(key).value)
      weakest.set(key, { value, at: frame.name });
  }
}
for (const [key, { value, at }] of [...weakest].sort()) {
  console.log(`${String(value).padStart(5)}  ${key.replace(/\.gotipe-/g, ".")}  (${at})`);
}
const where = shots.length ? ` → ${path.relative(process.cwd(), SHOTS)}` : "";
console.log(
  `atlas check: parts ${styles.length} css · frames ${frames.length} · shots ${shots.length}${where}`,
);
const { failing, known } = sortProblems([...new Set(problems)], { audited });
if (known.length) console.log(`KNOWN (${known.length}):\n  ${known.join("\n  ")}`);
if (failing.length) {
  console.log(`PROBLEMS (${failing.length}):\n  ${failing.join("\n  ")}`);
  process.exit(1);
}
console.log("ok");
