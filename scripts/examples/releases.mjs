/**
 * The starters install GoTipe from npm, as their users do, and the registry items install the
 * latest release. Each `@gotipe/*` range of a starter has to take that latest release, so the
 * starter's checks run what a new project gets today. A new minor 0.x or major release fails
 * this until the range moves.
 */
export async function rangeProblems(starters, latestVersion = fetchLatestVersion) {
  const problems = [];
  for (const { name, manifest } of starters) {
    for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
      if (!dependency.startsWith("@gotipe/")) continue;
      const latest = await latestVersion(dependency);
      if (!caretAccepts(range, latest)) {
        problems.push(
          `examples/${name}: ${dependency} ${range} does not take the latest ${latest}`,
        );
      }
    }
  }
  return problems;
}

/** Whether a caret range `^MAJOR.MINOR.PATCH` takes a release version, as npm reads it. */
export function caretAccepts(range, version) {
  const wanted = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range)?.slice(1).map(Number);
  const actual = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)?.slice(1).map(Number);
  if (!wanted || !actual) return false;
  const [major, minor, patch] = wanted;
  if (major > 0) {
    return (
      actual[0] === major && (actual[1] > minor || (actual[1] === minor && actual[2] >= patch))
    );
  }
  if (minor > 0) return actual[0] === 0 && actual[1] === minor && actual[2] >= patch;
  return actual[0] === 0 && actual[1] === 0 && actual[2] === patch;
}

async function fetchLatestVersion(name) {
  const response = await fetch(`https://registry.npmjs.org/-/package/${name}/dist-tags`);
  if (!response.ok) throw new Error(`npm answered ${response.status} for ${name}`);
  const tags = await response.json();
  if (typeof tags.latest !== "string") throw new Error(`npm has no latest release of ${name}`);
  return tags.latest;
}
