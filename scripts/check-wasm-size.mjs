import { appendFileSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const { coreGzipBytes: budget } = JSON.parse(
  readFileSync(new URL("../config/wasm-budget.json", import.meta.url), "utf8"),
);
const bytes = readFileSync(process.argv[2] ?? "packages/wasm/pkg/gotipe_wasm_bg.wasm");
const raw = bytes.length;
const gzip = gzipSync(bytes, { level: 9 }).length;
console.log(
  `Core WASM: ${raw} raw bytes; ${gzip} gzip bytes / ${budget} budget (${budget / 1024} KiB).`,
);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `raw=${raw}\ngzip=${gzip}\nbudget=${budget}\n`);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Core WASM size\n\n| Metric | Bytes |\n|---|---:|\n| Raw | ${raw} |\n| Gzip (level 9) | ${gzip} |\n| Budget | ${budget} |\n`,
  );
if (gzip > budget) {
  console.error(`WASM gzip size exceeds the checked budget by ${gzip - budget} bytes.`);
  process.exitCode = 1;
}
