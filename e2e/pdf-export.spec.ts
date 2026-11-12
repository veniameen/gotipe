import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

type Fixture = {
  id: string;
  document: { version: number; blocks: unknown[] };
  options: Record<string, unknown>;
  expect: { error?: boolean; errorPattern?: string };
};
const root = resolve(__dirname, "..");
const corpus = JSON.parse(
  readFileSync(resolve(root, "crates/gotipe-export/tests/fixtures/pdf-corpus.json"), "utf8"),
) as { version: number; cases: Fixture[] };
const wasmSha256 = createHash("sha256")
  .update(readFileSync(resolve(root, "packages/export-wasm/pkg/gotipe_export_wasm_bg.wasm")))
  .digest("hex");
const modules = {
  core: `/@fs/${root}/packages/core/dist/js.js`,
  exporter: `/@fs/${root}/packages/export/dist/index.js`,
};

for (const fixture of corpus.cases) {
  test(`PDF public browser exporter: ${fixture.id}`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?view=page#basic");
    const result = await page.evaluate(
      async ({ fixture, modules }) => {
        const { createEditor } = await import(/* @vite-ignore */ modules.core);
        const { exportToPdf } = await import(/* @vite-ignore */ modules.exporter);
        const editor = await createEditor({ extensions: [], content: fixture.document });
        const before = JSON.stringify(editor.getJSON());
        try {
          const bytes = await exportToPdf(editor, fixture.options);
          return {
            bytes: Array.from(bytes),
            unchanged: before === JSON.stringify(editor.getJSON()),
            error: "",
          };
        } catch (error) {
          return {
            bytes: [],
            unchanged: before === JSON.stringify(editor.getJSON()),
            error: String(error),
          };
        } finally {
          editor.destroy();
        }
      },
      { fixture, modules },
    );
    expect(result.unchanged).toBe(true);
    expect(errors).toEqual([]);
    if (fixture.expect.error) {
      expect(result.error).toMatch(new RegExp(fixture.expect.errorPattern!, "i"));
      expect(result.bytes).toEqual([]);
      return;
    }
    expect(result.error).toBe("");
    const file = `${fixture.id}.browser.pdf`;
    await writeFile(testInfo.outputPath(file), new Uint8Array(result.bytes));
    await writeFile(
      testInfo.outputPath("corpus.json"),
      JSON.stringify({ version: 1, cases: [fixture] }),
    );
    await writeFile(
      testInfo.outputPath("exports.json"),
      JSON.stringify([{ id: fixture.id, engine: "browser", file, passed: true }]),
    );
    await writeFile(
      testInfo.outputPath("runtime.json"),
      JSON.stringify(
        {
          browser: testInfo.project.name,
          wasmSha256,
          pdfSha256: createHash("sha256").update(new Uint8Array(result.bytes)).digest("hex"),
        },
        null,
        2,
      ),
    );
    const check = spawnSync(
      "python3",
      [
        resolve(root, "scripts/validate-pdf-regression.py"),
        testInfo.outputDir,
        "--require-producer",
        "GoTipe",
      ],
      { encoding: "utf8" },
    );
    expect(check.status, check.stdout + check.stderr).toBe(0);
  });
}
