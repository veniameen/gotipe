import { execFileSync } from "node:child_process";

// Cargo patches do not propagate into downstream registry consumers. A local
// security fix must have a published version before any source crate is released.
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
    "Cargo source release is blocked: publishable registry versions must replace Git patches before publishing any package.",
  );
  process.exitCode = 1;
} else {
  console.log("Cargo dependency sources are registry-publishable.");
}
