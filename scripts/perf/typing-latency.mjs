#!/usr/bin/env node
// Typing latency of the public PageEditor on a long generated Markdown page, in Chromium.
//
//   node scripts/perf/typing-latency.mjs [--label after] [--keys 50] [--profile] [--no-build]
//
// Builds the technical consumer `apps/playground/tests/perf` (production React, JS engine), serves
// it with `vite preview` and types into a paragraph in the middle of the page. Per key press it
// reads the time from `keydown` to the first frame after it and the time spent in `beforeinput`.
// The report goes to `output/perf/typing-latency-<label>.json`. `--profile` rebuilds without
// minification and also saves a CPU profile of the typing on the large page.
// GOTIPE_E2E_CHANNEL picks the browser channel (for example "chrome").
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const label = option("label", "run");
const keys = Number(option("keys", "50"));
const profile = flag("profile");
const port = Number(process.env.GOTIPE_PERF_PORT ?? 5320);
const pages = [
  { name: "large", sections: 236 },
  { name: "small", sections: 2 },
];
const WARM_UP = " warm up";
const out = resolve(root, "output/perf");
mkdirSync(out, { recursive: true });

function vite(extra) {
  return [
    "--filter",
    "@gotipe/playground",
    "exec",
    "vite",
    ...extra,
    "--config",
    "vite.perf.config.ts",
  ];
}

if (!flag("no-build")) {
  const built = spawnSync("pnpm", vite(["build"]), {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...(profile ? { GOTIPE_PERF_READABLE: "1" } : {}) },
  });
  if (built.status !== 0) process.exit(built.status ?? 1);
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const round = (value) => Math.round(value * 10) / 10;
  return {
    median: round(quantile(sorted, 0.5)),
    p95: round(quantile(sorted, 0.95)),
    max: round(sorted[sorted.length - 1]),
  };
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error(`The preview server did not start at ${url}`);
}

async function measure(browser, base, target) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const opened = Date.now();
  await page.goto(`${base}/tests/perf/index.html?sections=${target.sections}`);
  await page.waitForFunction(
    () => window.__GOTIPE_PERF__?.editor && document.querySelector("[data-block-id]"),
  );
  const openMs = Date.now() - opened;
  // the caret goes to the end of a paragraph in the middle of the page
  const blocks = await page.evaluate(() => {
    const perf = window.__GOTIPE_PERF__;
    const count = (list) => list.reduce((sum, block) => sum + 1 + count(block.children ?? []), 0);
    const top = perf.editor.getViewState().blocks;
    let at = Math.floor(top.length / 2);
    while (top[at].type !== "paragraph") at += 1;
    const block = top[at];
    const length = block.content.reduce((sum, span) => sum + span.text.length, 0);
    const element = Array.from(document.querySelectorAll("[data-block-id]")).find(
      (node) => node.dataset.blockId === block.id,
    );
    element.scrollIntoView({ block: "center" });
    perf.editor.focus();
    const caret = { blockId: block.id, offset: length };
    perf.editor.setSelection({ anchor: caret, head: caret });
    return count(top);
  });
  await page.waitForTimeout(500);
  const text = "the quick brown fox jumps over a lazy dog and types on ";
  // warm-up keys are typed and dropped
  for (const char of WARM_UP)
    await page.keyboard.type(char, { delay: 0 }).then(() => page.waitForTimeout(150));
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    window.__GOTIPE_PERF__.samples.length = 0;
  });
  // what the browser spent per key: scripts, style and layout (Chromium's own counters)
  const counters = await page.context().newCDPSession(page);
  await counters.send("Performance.enable");
  const spent = async () => {
    const { metrics } = await counters.send("Performance.getMetrics");
    const read = (name) => metrics.find((metric) => metric.name === name)?.value ?? 0;
    return {
      script: read("ScriptDuration"),
      style: read("RecalcStyleDuration"),
      layout: read("LayoutDuration"),
    };
  };
  const spentBefore = await spent();
  const session =
    profile && target.name === "large" ? await page.context().newCDPSession(page) : null;
  if (session) {
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: 200 });
    await session.send("Profiler.start");
  }
  for (let index = 0; index < keys; index += 1) {
    await page.keyboard.type(text[index % text.length]);
    await page.waitForFunction((want) => window.__GOTIPE_PERF__.samples.length >= want, index + 1);
    // the pause lets idle work finish, as between a person's key presses
    await page.waitForTimeout(120);
  }
  if (session) {
    const result = await session.send("Profiler.stop");
    writeFileSync(
      resolve(out, `typing-latency-${label}.cpuprofile`),
      JSON.stringify(result.profile),
    );
  }
  await page.waitForTimeout(300);
  const spentAfter = await spent();
  const perKey = (name) => Math.round(((spentAfter[name] - spentBefore[name]) * 10000) / keys) / 10;
  const result = await page.evaluate(() => {
    const perf = window.__GOTIPE_PERF__;
    // the emitted Markdown is the generated page with the typed text in it, and nothing else
    const { initial, markdown } = perf;
    let start = 0;
    while (start < initial.length && initial[start] === markdown[start]) start += 1;
    let end = 0;
    while (end < initial.length - start && initial.at(-1 - end) === markdown.at(-1 - end)) end += 1;
    return {
      samples: perf.samples,
      bytes: markdown.length,
      changes: perf.changes,
      inserted: markdown.slice(start, markdown.length - end),
      removed: initial.length - start - end,
    };
  });
  const typed = [WARM_UP, ...Array.from({ length: keys }, (_, index) => text[index % text.length])];
  const sourceKept = result.removed === 0 && result.inserted === typed.join("");
  if (!sourceKept) process.exitCode = 1;
  await page.close();
  return {
    page: target.name,
    sections: target.sections,
    blocks,
    bytes: result.bytes,
    openMs,
    changes: result.changes,
    sourceKept,
    keys: result.samples.length,
    keypressToFrameMs: summary(result.samples.map((sample) => sample.frame)),
    beforeInputMs: summary(result.samples.map((sample) => sample.input)),
    browserPerKeyMs: { script: perKey("script"), style: perKey("style"), layout: perKey("layout") },
  };
}

const server = spawn("pnpm", vite(["preview", "--port", String(port), "--strictPort"]), {
  cwd: root,
  stdio: "ignore",
  detached: true,
});
let browser;
try {
  const base = `http://localhost:${port}`;
  await waitForServer(`${base}/tests/perf/index.html`);
  const channel = process.env.GOTIPE_E2E_CHANNEL;
  browser = await chromium.launch(channel ? { channel } : {});
  const results = [];
  for (const target of pages) results.push(await measure(browser, base, target));
  const report = { label, browser: browser.version(), minified: !profile, results };
  writeFileSync(
    resolve(out, `typing-latency-${label}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  for (const row of results) {
    if (!row.sourceKept) console.error(`${row.page}: the Markdown differs beyond the typed text`);
    console.log(
      `${row.page}: ${row.blocks} blocks, ${row.bytes} bytes; keypress→frame median ${row.keypressToFrameMs.median} ms, p95 ${row.keypressToFrameMs.p95} ms; beforeinput median ${row.beforeInputMs.median} ms; per key: script ${row.browserPerKeyMs.script}, style ${row.browserPerKeyMs.style}, layout ${row.browserPerKeyMs.layout} ms`,
    );
  }
} finally {
  await browser?.close();
  process.kill(-server.pid);
}
