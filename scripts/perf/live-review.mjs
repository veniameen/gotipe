#!/usr/bin/env node
// Frames of the public PageEditor while a review's growing proposals are written, in Chromium.
//
//   node scripts/perf/live-review.mjs [--label after] [--writers 4] [--rate 12] [--seconds 10]
//     [--profile] [--no-build]
//
// Builds the technical consumer `apps/playground/tests/perf` (production React, JS engine), serves
// it with `vite preview` and opens `live.html`: a long generated page whose review holds `writers`
// growing proposals with a cursor each. Every text grows `rate` times a second for `seconds`,
// first all in one update (`batched`), then each on its own beat (`staggered`). Per run it reads
// the time from an update to the first frame after it, the length of every frame, and what the
// browser spent per update. The report goes to `output/perf/live-review-<label>.json`.
// `--profile` rebuilds without minification and saves a CPU profile of the batched run on the
// large page. GOTIPE_E2E_CHANNEL picks the browser channel (for example "chrome").
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
const writers = Number(option("writers", "4"));
const rate = Number(option("rate", "12"));
const seconds = Number(option("seconds", "10"));
const profile = flag("profile");
const port = Number(process.env.GOTIPE_PERF_PORT ?? 5320);
const pages = [
  { name: "large", sections: 236 },
  { name: "small", sections: 12 },
];
const modes = ["batched", "staggered"];
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
const round = (value) => Math.round(value * 10) / 10;
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
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

async function measure(browser, base, target, mode) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const query = `sections=${target.sections}&writers=${writers}`;
  await page.goto(`${base}/tests/perf/live.html?${query}`);
  await page.waitForFunction(
    () => window.__GOTIPE_LIVE__?.editor && document.querySelector("[data-block-id]"),
  );
  // the first writer's place in view, as a person watching the text appear has it
  const blocks = await page.evaluate((count) => {
    const all = (list) => list.reduce((sum, block) => sum + 1 + all(block.children ?? []), 0);
    const top = window.__GOTIPE_LIVE__.editor.getViewState().blocks;
    const half = Math.max(1, Math.floor(count / 2) - 1);
    const heading = Array.from(document.querySelectorAll("h2")).find((element) =>
      element.textContent?.startsWith(`Section ${half + 1}:`),
    );
    heading?.scrollIntoView({ block: "center" });
    return all(top);
  }, target.sections);
  await page.waitForTimeout(700);
  // a frame of this display and browser with nothing to do
  const idle = await page.evaluate(
    () =>
      new Promise((done) => {
        const lengths = [];
        let last = 0;
        const frame = (now) => {
          if (last) lengths.push(now - last);
          last = now;
          if (lengths.length < 30) requestAnimationFrame(frame);
          else done(lengths.sort((a, b) => a - b)[15]);
        };
        requestAnimationFrame(frame);
      }),
  );
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
  const session =
    profile && target.name === "large" && mode === "batched"
      ? await page.context().newCDPSession(page)
      : null;
  if (session) {
    await session.send("Profiler.enable");
    await session.send("Profiler.setSamplingInterval", { interval: 200 });
    await session.send("Profiler.start");
  }
  const before = await spent();
  const run = await page.evaluate(
    ([how, perSecond, length]) => window.__GOTIPE_LIVE__.start(how, perSecond, length),
    [mode, rate, seconds],
  );
  const after = await spent();
  if (session) {
    const result = await session.send("Profiler.stop");
    writeFileSync(resolve(out, `live-review-${label}.cpuprofile`), JSON.stringify(result.profile));
  }
  // the writing ends: the same proposals become ordinary ones, and nothing is revealed again
  const settled = await page.evaluate(async () => {
    const shown = () =>
      Array.from(
        document.querySelectorAll("[data-gotipe-proposal]:not([data-gotipe-proposal] *)"),
      ).reduce((sum, element) => sum + (element.textContent ?? "").length, 0);
    const was = shown();
    window.__GOTIPE_LIVE__.settle();
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    return { was, now: shown() };
  });
  await page.close();
  const updates = run.updates.length;
  const per = (name) => round(((after[name] - before[name]) * 1000) / updates);
  // a frame that took more than one and a half of the display's own was dropped at least once
  const late = run.frames.filter((length) => length > idle * 1.5);
  return {
    page: target.name,
    mode,
    blocks,
    writers,
    updatesPerSecond: mode === "batched" ? rate : rate * writers,
    updates,
    idleFrameMs: round(idle),
    updateToFrameMs: summary(run.updates),
    frames: run.frames.length,
    lateFrames: late.length,
    frameMs: summary(run.frames),
    browserPerUpdateMs: { script: per("script"), style: per("style"), layout: per("layout") },
    written: run.written,
    shown: run.shown,
    shownAfterSettle: settled.now,
    revealedAgain: settled.now < settled.was,
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
  await waitForServer(`${base}/tests/perf/live.html`);
  const channel = process.env.GOTIPE_E2E_CHANNEL;
  browser = await chromium.launch(channel ? { channel } : {});
  const results = [];
  for (const target of pages)
    for (const mode of modes) results.push(await measure(browser, base, target, mode));
  const report = {
    label,
    browser: browser.version(),
    minified: !profile,
    rate,
    seconds,
    results,
  };
  writeFileSync(resolve(out, `live-review-${label}.json`), `${JSON.stringify(report, null, 2)}\n`);
  for (const row of results) {
    if (row.shown === 0 || row.revealedAgain) process.exitCode = 1;
    console.log(
      `${row.page}/${row.mode}: ${row.blocks} blocks, ${row.writers} writers, ${row.updatesPerSecond} updates/s; update→frame median ${row.updateToFrameMs.median} ms, p95 ${row.updateToFrameMs.p95} ms, max ${row.updateToFrameMs.max} ms; frames ${row.frames}, late ${row.lateFrames} (idle ${row.idleFrameMs} ms, p95 ${row.frameMs.p95} ms, max ${row.frameMs.max} ms); per update: script ${row.browserPerUpdateMs.script}, style ${row.browserPerUpdateMs.style}, layout ${row.browserPerUpdateMs.layout} ms; shown ${row.shown}/${row.written}`,
    );
  }
} finally {
  await browser?.close();
  process.kill(-server.pid);
}
