import assert from "node:assert/strict";
import test from "node:test";
import { sortProblems } from "./known.mjs";

const known = [{ finding: "D-0", problem: /^#f1\/a\/light: “x” / }];

test("a known problem is listed under its finding and does not fail the check", () => {
  assert.deepEqual(
    sortProblems(["#f1/a/light: “x” leaves", "#f2/b/light: “y” leaves"], { known }),
    {
      failing: ["#f2/b/light: “y” leaves"],
      known: ["D-0  #f1/a/light: “x” leaves"],
    },
  );
});

test("a known entry that is not found any more fails the check", () => {
  const { failing } = sortProblems(["#f2/b/light: “y” leaves"], { known });
  assert.equal(failing.length, 2);
  assert.match(failing[1], /^D-0 is not found any more: close the finding/);
});

test("without the frames audited a known entry is not judged", () => {
  assert.deepEqual(sortProblems(["atlas.html is missing"], { known, audited: false }), {
    failing: ["atlas.html is missing"],
    known: [],
  });
});
