/** Exercise a fixed public PDF corpus through the optional WASM API and native CLI. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const value = (key, fallback) => {
  const index = args.indexOf(key);
  return index < 0 ? fallback : args[index + 1];
};
const output = resolve(value("--out", "output/pdf-regression"));
const corpusPath = resolve(
  value("--corpus", "crates/gotipe-export/tests/fixtures/pdf-corpus.json"),
);
const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
const wasmPath = value("--wasm");
const converter = value("--native");
const nativeDirectory = value("--native-dir");
const nativeOnly = args.includes("--native-only");
if (nativeOnly && !nativeDirectory) throw new Error("--native-only requires --native-dir");
let exportPdf;
if (!nativeOnly && wasmPath) {
  const module = await import(pathToFileURL(resolve(wasmPath, "gotipe_export_wasm.js")).href);
  module.initSync({ module: await readFile(resolve(wasmPath, "gotipe_export_wasm_bg.wasm")) });
  exportPdf = (document, options) =>
    module.exportPdf(JSON.stringify(document), JSON.stringify(options));
} else if (!nativeOnly) {
  const { exportToPdf } = await import("../packages/export/dist/index.js");
  exportPdf = (document, options) => exportToPdf({ getJSON: () => document }, options);
}
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "corpus.json"), JSON.stringify(corpus, null, 2));
const results = [];
for (const fixture of corpus.cases) {
  const engines = nativeOnly
    ? ["native"]
    : nativeDirectory || (converter && !Object.keys(fixture.options).length)
      ? ["wasm", "native"]
      : ["wasm"];
  for (const engine of engines) {
    const result = { id: fixture.id, engine, expectedError: !!fixture.expect.error };
    const original = JSON.stringify(fixture.document);
    try {
      let bytes;
      if (engine === "wasm") bytes = await exportPdf(fixture.document, fixture.options);
      else if (nativeDirectory) {
        if (fixture.expect.error)
          throw new Error(
            await readFile(resolve(nativeDirectory, `${fixture.id}.native.error.txt`), "utf8"),
          );
        bytes = await readFile(resolve(nativeDirectory, `${fixture.id}.native.pdf`));
      } else {
        const child = spawnSync(resolve(converter), ["pdf"], {
          input: original,
          maxBuffer: 64 * 1024 * 1024,
        });
        if (child.error) throw child.error;
        if (child.status !== 0) throw new Error(child.stderr.toString());
        bytes = child.stdout;
      }
      assert.equal(JSON.stringify(fixture.document), original, "Export mutated public input");
      assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), "%PDF-");
      result.file = `${fixture.id}.${engine}.pdf`;
      result.bytes = bytes.length;
      result.sha256 = createHash("sha256").update(bytes).digest("hex");
      await writeFile(resolve(output, result.file), bytes);
      result.passed = !result.expectedError;
    } catch (error) {
      result.error = String(error);
      result.passed =
        result.expectedError && new RegExp(fixture.expect.errorPattern, "i").test(result.error);
    }
    results.push(result);
    console.log(JSON.stringify(result));
  }
}
await writeFile(resolve(output, "exports.json"), JSON.stringify(results, null, 2));
const producer = value("--producer", wasmPath ? "" : "GoTipe");
const validationArgs = [
  "scripts/validate-pdf-regression.py",
  output,
  ...(producer ? ["--require-producer", producer] : []),
];
const validation = spawnSync("python3", validationArgs, {
  stdio: "inherit",
});
if (results.some((result) => !result.passed) || validation.status !== 0) process.exitCode = 1;
