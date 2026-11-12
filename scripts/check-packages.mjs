import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Inspect the files npm would actually receive, then load every JS entry in a
// fresh Node process. This deliberately does not publish or run package scripts.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = readdirSync(path.join(root, "packages"))
  .map((name) => path.join(root, "packages", name))
  .filter((dir) => existsSync(path.join(dir, "package.json")))
  .map((dir) => ({
    dir,
    manifest: JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")),
  }))
  .filter(({ manifest }) => !manifest.private);
const failures = [];

function targets(value, condition = "") {
  if (typeof value === "string") return [{ target: value, condition }];
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    targets(entry, key.startsWith(".") ? condition : key),
  );
}

for (const { dir, manifest } of packages) {
  const fail = (message) => failures.push(`${manifest.name}: ${message}`);
  try {
    if (!Array.isArray(manifest.files) || !manifest.files.length) fail("missing files allowlist");
    const [packed] = JSON.parse(
      execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    const files = new Set(packed.files.map((file) => file.path));
    const license = manifest.license?.startsWith("SEE LICENSE IN ")
      ? manifest.license.slice("SEE LICENSE IN ".length)
      : "LICENSE";
    if (!files.has(license)) fail(`license file is absent from tarball: ${license}`);
    // a commercial package ships the repository's own license text, byte for byte
    if (
      license === "LICENSE-COMMERCIAL" &&
      readFileSync(path.join(dir, license), "utf8") !==
        readFileSync(path.join(root, "LICENSE-COMMERCIAL"), "utf8")
    ) {
      fail("LICENSE-COMMERCIAL differs from the repository's");
    }
    for (const file of files) {
      if (
        file.startsWith(".turbo/") ||
        /(?:^|\/)(?:tests?|test-results)\//.test(file) ||
        /\.(?:test|spec)\.[^/]+$/.test(file)
      ) {
        fail(`development artifact in tarball: ${file}`);
      }
    }

    const entries = targets(manifest.exports);
    for (const field of ["main", "module", "types"]) {
      if (manifest[field]) entries.push({ target: manifest[field], condition: field });
    }
    const imported = new Set();
    for (const { target, condition } of entries) {
      const relative = target.replace(/^\.\//, "");
      if (relative.includes("..") || path.isAbsolute(relative)) {
        fail(`export escapes package: ${target}`);
        continue;
      }
      if (relative.includes("*")) {
        const [prefix, suffix] = relative.split("*");
        if (![...files].some((file) => file.startsWith(prefix) && file.endsWith(suffix))) {
          fail(`wildcard export has no packaged files: ${target}`);
        }
        continue;
      }
      if (!files.has(relative)) {
        fail(`export is absent from tarball: ${target}`);
        continue;
      }
      if (!/\.(?:js|mjs|cjs)$/.test(relative) || imported.has(relative)) continue;
      imported.add(relative);
      const absolute = path.join(dir, relative);
      const load =
        condition === "require" || relative.endsWith(".cjs")
          ? "const {createRequire}=await import('node:module'); createRequire(import.meta.url)(process.argv[1]);"
          : "const {pathToFileURL}=await import('node:url'); await import(pathToFileURL(process.argv[1]).href);";
      try {
        execFileSync(process.execPath, ["--input-type=module", "-e", load, absolute], {
          cwd: dir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 15_000,
        });
      } catch (error) {
        fail(`cannot load ${target}: ${String(error.stderr ?? error.message).trim()}`);
      }
    }
    process.stdout.write(
      `${manifest.name}: ${files.size} packaged files, ${imported.size} JS entries checked\n`,
    );
  } catch (error) {
    fail(String(error.stderr ?? error.message).trim());
  }
}

if (failures.length) {
  process.stderr.write(
    `\nPackage checks failed:\n${failures.map((message) => `- ${message}`).join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`\nAll ${packages.length} package archives and entrypoints passed.\n`);
}
