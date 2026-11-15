import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "output/package-consumer");
mkdirSync(output, { recursive: true });
const runRoot = mkdtempSync(path.join(output, "run-"));
const archives = path.join(runRoot, "archives");
const consumer = path.join(runRoot, "consumer");
mkdirSync(archives, { recursive: true });
mkdirSync(consumer, { recursive: true });
const packages = readdirSync(path.join(root, "packages"))
  .map((name) => {
    const dir = path.join(root, "packages", name);
    const manifest = path.join(dir, "package.json");
    return existsSync(manifest)
      ? { dir, manifest: JSON.parse(readFileSync(manifest, "utf8")) }
      : null;
  })
  .filter((entry) => entry && !entry.manifest.private);
const dependencies = {};
const specifiers = [];
const cjsSpecifiers = [];
const externalPeers = new Set();
function hasJavaScript(value) {
  return typeof value === "string"
    ? /\.(?:mjs|cjs|js)$/.test(value)
    : value && typeof value === "object" && Object.values(value).some(hasJavaScript);
}
function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    process.stderr.write(String(error.stdout ?? "") + String(error.stderr ?? error.message));
    throw new Error(`${command} failed in ${cwd}`, { cause: error });
  }
}
for (const { dir, manifest } of packages) {
  const archive = path.join(
    archives,
    `${manifest.name.replace(/^@/, "").replaceAll("/", "-")}-${manifest.version}.tgz`,
  );
  // pnpm rewrites workspace ranges exactly as its publish command does.
  run("pnpm", ["pack", "--out", archive, "--json"], dir);
  dependencies[manifest.name] = `file:${archive}`;
  for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
    if (!peer.startsWith("@gotipe/")) externalPeers.add(peer);
  }
  for (const [entry, target] of Object.entries(manifest.exports ?? {})) {
    if (!entry.startsWith(".") || entry.includes("*") || !hasJavaScript(target)) continue;
    const specifier = manifest.name + (entry === "." ? "" : entry.slice(1));
    specifiers.push(specifier);
    if (target && typeof target === "object" && "require" in target) cjsSpecifiers.push(specifier);
  }
}
for (const peer of [...externalPeers, "@types/react", "@types/react-dom"]) {
  const candidate = packages
    .map(({ dir }) => path.join(dir, "node_modules", peer, "package.json"))
    .find(existsSync);
  if (!candidate)
    throw new Error(`Peer must be installed in the workspace before packaging: ${peer}`);
  dependencies[peer] = JSON.parse(readFileSync(candidate, "utf8")).version;
}
writeFileSync(
  path.join(consumer, "package.json"),
  JSON.stringify(
    {
      name: "gotipe-packed-consumer",
      private: true,
      type: "module",
      dependencies,
      pnpm: {
        overrides: Object.fromEntries(
          Object.entries(dependencies).filter(([name]) => name.startsWith("@gotipe/")),
        ),
      },
    },
    null,
    2,
  ),
);
run(
  "pnpm",
  ["install", "--ignore-workspace", "--offline", "--ignore-scripts", "--strict-peer-dependencies"],
  consumer,
);
writeFileSync(
  path.join(consumer, "types.ts"),
  specifiers
    .map(
      (specifier, i) =>
        `import * as Package${i} from ${JSON.stringify(specifier)};\nexport type Entry${i} = typeof Package${i};`,
    )
    .join("\n"),
);
writeFileSync(
  path.join(consumer, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
      lib: ["ESNext", "DOM", "DOM.Iterable"],
      skipLibCheck: false,
      types: [],
    },
    include: ["types.ts"],
  }),
);
run(
  process.execPath,
  [path.join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"],
  consumer,
);
const smoke = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const required = createRequire(import.meta.url);
for (const specifier of ${JSON.stringify(specifiers)}) await import(specifier);
for (const specifier of ${JSON.stringify(cjsSpecifiers)}) required(specifier);
// One GoTipeError class per package in CJS as in ESM: an error raised by one entry is an
// instance of the class that another entry exports (D-166).
for (const [format, load] of [['CJS', async (specifier) => required(specifier)], ['ESM', (specifier) => import(specifier)]]) {
  const { GoTipeError } = await load('@gotipe/core');
  const { defineSuggestion } = await load('@gotipe/core/extensions');
  const raised = {
    '@gotipe/core/js': await (await load('@gotipe/core/js')).createEditor({ extensions: [], engine: 'wasm' }).catch((error) => error),
    '@gotipe/core/server': await (await load('@gotipe/core/server')).renderToHtml({ blocks: 5 }).catch((error) => error),
    '@gotipe/core/extensions': (() => { try { defineSuggestion({}); } catch (error) { return error; } })(),
  };
  for (const [entry, error] of Object.entries(raised))
    assert.ok(error instanceof GoTipeError, format + ': ' + entry + ' raised ' + (error?.code ?? error) + ', not the GoTipeError of @gotipe/core');
}
const { createHeadlessEditor, renderToHtml } = await import('@gotipe/core/server');
const exports = await import('@gotipe/export');
const document = { version: 1, blocks: [{ id: 'p', type: 'paragraph', attrs: {}, children: [], content: [{ text: 'Tarball Привет 😀', marks: [] }] }] };
assert.match(await renderToHtml(document, { classPrefix: 'article-', inlineStyles: true }), /article-paragraph/);
const editor = await createHeadlessEditor({ extensions: [] });
try {
  editor.setContent(document);
  assert.match(exports.exportToHtml(editor, { includeStyles: true }), /line-height/);
  assert.match(exports.exportToMarkdown(editor), /Привет/);
  const pdf = await exports.exportToPdf(editor);
  const docx = await exports.exportToDocx(editor, { title: 'Packed consumer' });
  assert.equal(new TextDecoder().decode(pdf.subarray(0,5)), '%PDF-');
  assert.deepEqual([...docx.subarray(0,2)], [80,75]);
} finally { editor.destroy(); }
// The default loader reads the binary through the node condition of @gotipe/wasm (D-12).
const { createEditor } = await import('@gotipe/core');
const { DefaultPreset } = await import('@gotipe/core/presets');
const wasmEditor = await createEditor({ extensions: [DefaultPreset], engine: 'wasm', content: document });
try {
  assert.equal(wasmEditor.engine, 'wasm');
  assert.ok(wasmEditor.dispatch({ steps: [{ type: 'insertText', blockId: 'p', offset: 0, text: 'Node ', marks: [] }] }));
  assert.equal(wasmEditor.getText(), 'Node Tarball Привет 😀');
  assert.match(exports.exportToMarkdown(wasmEditor), /^Node Tarball Привет/);
} finally { wasmEditor.destroy(); }
console.log('Clean tarball consumer: ESM, CJS, types, headless SSR, Markdown, PDF, DOCX and the WASM engine in Node passed.');
`;
writeFileSync(path.join(consumer, "smoke.mjs"), smoke);
process.stdout.write(run(process.execPath, ["smoke.mjs"], consumer));
writeFileSync(
  path.join(output, "result.json"),
  JSON.stringify(
    {
      packages: packages.length,
      esmEntries: specifiers.length,
      cjsEntries: cjsSpecifiers.length,
      strictPeerDependencies: true,
      declarationCheck: "skipLibCheck=false",
      at: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  `Verified ${packages.length} actual archives in an isolated consumer (${specifiers.length} ESM / ${cjsSpecifiers.length} CJS entries).`,
);
