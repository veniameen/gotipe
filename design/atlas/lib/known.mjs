// Problems the check already knows: each is a finding in docs/24 that waits for the owner's
// decision on its frame. The check prints it under its finding and passes. Once the frame is
// fixed, the entry fails the check until it is removed here and the finding is closed in docs/24.

export const KNOWN = [];

/** Known problems, each under its finding, and the ones that fail the check: the rest, and — when
    the frames were audited at all — a known entry that is no longer found. */
export function sortProblems(problems, { audited = true, known = KNOWN } = {}) {
  const found = new Map(known.map((entry) => [entry, 0]));
  const failing = [];
  const listed = [];
  for (const problem of problems) {
    const entry = known.find((k) => k.problem.test(problem));
    if (!entry) {
      failing.push(problem);
      continue;
    }
    found.set(entry, found.get(entry) + 1);
    listed.push(`${entry.finding}  ${problem}`);
  }
  for (const [entry, count] of found) {
    if (audited && !count)
      failing.push(
        `${entry.finding} is not found any more: close it in docs/24 and remove it from lib/known.mjs`,
      );
  }
  return { failing, known: listed };
}
