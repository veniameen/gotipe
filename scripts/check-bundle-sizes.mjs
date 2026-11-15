import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkComments, packageComments } from "./quality/bundle-comments.mjs";
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
// Budgets measure unminified output, so a comment esbuild keeps is paid for (D-167).
const known = JSON.parse(fs.readFileSync(path.join(root, "config/bundle-comments.json"), "utf8"));
const comments = packageComments(packages);
const commentErrors = checkComments(comments, known.known);
for (const error of commentErrors) console.error(error);
if (commentErrors.length) process.exitCode = 1;
else
  console.log(
    `Comments inside expressions and class bodies: ${[...comments.values()].reduce((sum, list) => sum + list.length, 0)}, all known (config/bundle-comments.json)`,
  );
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
