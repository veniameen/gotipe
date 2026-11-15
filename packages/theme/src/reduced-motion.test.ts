// @vitest-environment jsdom
import { expect, it } from "vitest";

/** Node's process and file reader of the test runner; the package has no Node types. */
declare const process: { cwd(): string };
type FileReader = { readFileSync(path: string, encoding: "utf8"): string };
const fs = "node:fs";
// Vitest gives CSS modules no text, `?raw` included: base.css is read from disk.
const BASE = ((await import(/* @vite-ignore */ fs)) as FileReader).readFileSync(
  `${process.cwd()}/src/base.css`,
  "utf8",
);

/** The selector list and declarations of base.css's reduced-motion block. */
function reducedMotion(): { selectors: string[]; body: string } {
  const block = BASE.slice(BASE.indexOf("@media (prefers-reduced-motion: reduce)"));
  const rule = block.slice(block.indexOf("{") + 1);
  const head = rule.slice(0, rule.indexOf("{"));
  const body = rule.slice(rule.indexOf("{") + 1, rule.indexOf("}"));
  const selectors = head
    .split(",")
    .map((selector) => selector.trim())
    .filter((selector) => !selector.includes("::"));
  return { selectors, body };
}

it("stops the motion of GoTipe's panels, spinners and drop line, not only of the document (D-35)", () => {
  const { selectors, body } = reducedMotion();
  const covered = (element: Element) => selectors.some((selector) => element.matches(selector));
  const make = (className: string) => {
    const element = document.createElement("div");
    element.className = className;
    document.body.append(element);
    return element;
  };
  for (const name of [
    "gotipe-ai-command-bar",
    "gotipe-ai-status",
    "gotipe-ai-status-spinner",
    "gotipe-drop-indicator",
    "gotipe-ghost-text",
    "gotipe-toast",
    "gotipe-editor",
  ])
    expect(covered(make(name)), name).toBe(true);
  // a host's own element inside a GoTipe panel is covered too; one outside GoTipe is not
  const inner = document.createElement("span");
  make("gotipe-menu").append(inner);
  expect(covered(inner)).toBe(true);
  expect(covered(make("host-panel"))).toBe(false);
  expect(body).toContain("animation-iteration-count: 1 !important");
  expect(body).toContain("transition-duration: 0.01ms !important");
});
