import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import ts from "typescript";

export function workspacePackages(root) {
  const packages = new Map();
  for (const entry of fs.readdirSync(path.join(root, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(root, "packages", entry.name);
    const manifestPath = path.join(directory, "package.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      packages.set(manifest.name, { directory, manifest });
    }
  }
  return packages;
}

function importTarget(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  for (const condition of ["browser", "import", "default"]) {
    const target = importTarget(value[condition]);
    if (target) return target;
  }
  return null;
}

export function measureClosure(root, entries, excluded, packages = workspacePackages(root)) {
  const seen = new Set();
  const externals = new Set();
  const assets = new Set();
  const exclusions = new Set(excluded);
  const matches = (set, specifier) =>
    [...set].some((name) => specifier === name || specifier.startsWith(`${name}/`));

  function dependency(specifier, importer) {
    if (specifier.startsWith(".")) {
      visit(path.resolve(path.dirname(importer), specifier));
      return;
    }
    if (matches(exclusions, specifier)) {
      externals.add(specifier);
      return;
    }
    const name = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0];
    const workspace = packages.get(name);
    if (!workspace)
      throw new Error(`Unmeasured dependency ${specifier} from ${path.relative(root, importer)}`);
    const subpath = specifier === name ? "." : `.${specifier.slice(name.length)}`;
    const target =
      importTarget(workspace.manifest.exports?.[subpath]) ??
      (subpath === "." ? workspace.manifest.module : null);
    if (!target) throw new Error(`Missing ESM export ${specifier}`);
    visit(path.resolve(workspace.directory, target));
  }

  function visit(file) {
    if (!fs.existsSync(file))
      throw new Error(`Missing build artifact ${path.relative(root, file)}`);
    if (!/\.(m?js)$/.test(file)) {
      assets.add(path.relative(root, file));
      return;
    }
    if (seen.has(file)) return;
    seen.add(file);
    const code = fs.readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function scan(node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        dependency(node.moduleSpecifier.text, file);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const value = node.arguments[0];
        if (!value || !ts.isStringLiteral(value))
          throw new Error(`Unmeasurable dynamic import in ${path.relative(root, file)}`);
        dependency(value.text, file);
      }
      ts.forEachChild(node, scan);
    }
    scan(source);
  }
  for (const entry of entries) visit(path.resolve(root, entry));
  const files = [...seen].sort().map((file) => {
    const bytes = fs.readFileSync(file);
    return {
      file: path.relative(root, file),
      bytes: bytes.length,
      gzip: gzipSync(bytes, { level: 9 }).length,
    };
  });
  return {
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    gzip: files.reduce((sum, file) => sum + file.gzip, 0),
    files,
    externals: [...externals].sort(),
    assets: [...assets].sort(),
  };
}
