import { expect, test } from "@playwright/test";
import {
  type Configuration,
  type Theme,
  type View,
  auditConfiguration,
} from "./helpers/visual-audit/audit";
import type { Mode } from "./helpers/visual-audit/document";

// The geometry of the editor's interface in the playground (AGENTS.md, “Interface”): the block
// handle never covers text, a box, a marker or an icon, stands at the block's first line inside
// the editor and the screen; the table's handles keep their own margins, columns keep theirs;
// the bubble menu, the slash menu and the block menu stay on the screen; the page never scrolls
// sideways.
// Page is PageEditor, Block is BlockEditor alone, Views is BlockEditor with the page head.
// The full matrix runs in Chrome; Firefox and WebKit take a sample of it. Every violation leaves
// a snapshot in output/editor-visual-audit/<browser>/<configuration>/.

const MODES: Mode[] = ["page", "block", "views"];
const VIEWS: View[] = ["notion", "docs", "modern", "minimal"];
const THEMES: Theme[] = ["light", "dark"];
const WIDTHS = [320, 375, 768, 1024, 1440];
/** Every mode, view, theme and width at least once; the task row at 375 among them (D-260). */
const SAMPLE = new Set([
  "page-notion-light-375",
  "page-docs-dark-768",
  "block-docs-light-320",
  "block-modern-dark-1440",
  "views-notion-dark-1024",
  "views-minimal-light-375",
]);

const key = ({ mode, view, theme, width }: Configuration) => `${mode}-${view}-${theme}-${width}`;

test.describe("Editor visual audit", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const mode of MODES)
    for (const view of VIEWS)
      for (const theme of THEMES)
        for (const width of WIDTHS) {
          const configuration = { mode, view, theme, width };
          const name = key(configuration);
          test(name, async ({ page, browserName }, info) => {
            test.skip(
              browserName !== "chromium" && !SAMPLE.has(name),
              "the full matrix runs in Chrome; Firefox and WebKit check the sample",
            );
            const result = await auditConfiguration(page, configuration, info);
            expect(result.cases).toBeGreaterThan(20);
            expect(
              result.violations,
              result.violations.map((v) => `${v.check} ${v.target}: ${v.detail}`).join("\n"),
            ).toEqual([]);
          });
        }
});
