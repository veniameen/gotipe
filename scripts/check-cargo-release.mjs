import { execFileSync } from "node:child_process";

// The crates are published to crates.io (publish-crates.yml) and the Rust graph is compiled
// into @gotipe/wasm, @gotipe/export-wasm and the Cloud converter. Every source must be a
// registry release: a Git checkout is mutable, outside yanking and registry
// advisories, and its notices describe no published version. A security fix that
// exists only in Git waits for a registry release (docs/development/dependencies.md).
const metadata = JSON.parse(
  execFileSync("cargo", ["metadata", "--locked", "--format-version", "1"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  }),
);
const unpublished = metadata.packages.filter((pkg) => pkg.source?.startsWith("git+"));
if (unpublished.length) {
  for (const pkg of unpublished) {
    console.error(`${pkg.name}@${pkg.version} uses ${pkg.source}`);
  }
  console.error(
    "Release is blocked: the Rust graph built into the npm packages must use registry versions instead of Git sources.",
  );
  process.exitCode = 1;
} else {
  console.log("Cargo dependency sources are registry releases.");
}
