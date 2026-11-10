import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measureClosure, workspacePackages } from "./quality/bundle-graph.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const configuration = JSON.parse(
  fs.readFileSync(path.join(root, "config/bundle-budgets.json"), "utf8"),
);
const packages = workspacePackages(root);
const results = [];
for (const budget of configuration.budgets) {
  const measured = measureClosure(root, budget.entries, budget.exclude, packages);
  results.push({ name: budget.name, budget: budget.gzipBytes, ...measured });
  console.log(
    `${budget.name}: ${measured.gzip} gzip9 bytes / ${budget.gzipBytes}, ${measured.files.length} JS files`,
  );
  if (measured.gzip > budget.gzipBytes) {
    console.error(
      `${budget.name} exceeds its complete import-graph budget by ${measured.gzip - budget.gzipBytes} bytes`,
    );
    process.exitCode = 1;
  }
}
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `\n### JavaScript import graph sizes\n\n| Graph | gzip9 | Budget |\n|---|---:|---:|\n${results.map((row) => `| ${row.name} | ${row.gzip} | ${row.budget} |`).join("\n")}\n`,
  );
}
const output = path.join(root, "output/bundle-sizes.json");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  `${JSON.stringify({ definition: configuration.definition, results }, null, 2)}\n`,
);
