// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import tokens from "./design-tokens.json";

/** Node's process and file reader of the test runner; the package has no Node types. */
declare const process: { cwd(): string };
type FileReader = { readFileSync(path: string, encoding: "utf8"): string };
const fs = "node:fs";
// Vitest gives CSS modules no text, `?raw` included: the stylesheets are read from disk.
const { readFileSync } = (await import(/* @vite-ignore */ fs)) as FileReader;
const read = (path: string) => readFileSync(`${process.cwd()}/src/${path}`, "utf8");

/** The declarations of the first rule whose selector list is exactly `selector`. */
function declarations(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no rule ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries(
    body
      .split(";")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => [
        line.slice(0, line.indexOf(":")).trim(),
        line.slice(line.indexOf(":") + 1).trim(),
      ]),
  );
}

describe("host colours on a container reach the derived tokens", () => {
  const palette = read("tokens/palette.css");
  const sheets = ["base.css", "theme/review.css", "theme/panels.css", "theme/media.css"].map(read);
  const derived: Record<string, string> = {
    "--gt-comment-soft": "var(--gt-comment-tint)",
    "--gt-ai-ghost": "var(--gt-text-3)",
    "--gt-check-fill": "var(--gt-ink)",
    "--gt-check-line": "var(--gt-line-control)",
    "--gt-caption-color": "var(--gt-text-2)",
    "--gt-image-ring-color": "var(--gt-line)",
    "--gt-image-empty-bg": "var(--gt-sunken)",
  };
  it("leaves a derived token unset: its rule falls back to the base at the element", () => {
    for (const [name, base] of Object.entries(derived)) {
      expect(palette).not.toContain(`${name}:`);
      expect(sheets.join("\n")).toContain(`var(${name}, ${base})`);
      expect(sheets.join("\n")).not.toContain(`var(${name})`);
    }
  });
  it("does not declare the palette's aliases again below the root: a host's own alias wins", () => {
    expect(palette).not.toContain("[data-gt-view]");
  });
});

describe('data-gt-narrow="off" switches the narrow sizes off, not the layout', () => {
  const views = read("tokens/views.css");
  const narrow = views.slice(views.indexOf("@container (max-width: 640px)"));
  const selectors = [...narrow.matchAll(/^ {2}([^\s@}][^{]*)\{/gm)].map((match) =>
    (match[1] ?? "").replace(/\s+/g, " ").trim(),
  );
  const layout = selectors.find((selector) => !selector.includes("data-gt-narrow")) ?? "";
  const sizes = selectors.find((selector) => selector.includes("data-gt-narrow")) ?? "";
  const child = (outer: string, editor: string) => {
    document.body.innerHTML = `<div ${outer}><div class="gotipe-block-editor" ${editor}><div class="gotipe-editor"><div id="child"></div></div></div></div>`;
    return document.getElementById("child") as HTMLElement;
  };
  it("keeps today's sizes without the attribute", () => {
    expect(child("", "").matches(sizes)).toBe(true);
    expect(child("", "").matches(layout)).toBe(true);
  });
  it("drops the sizes for the attribute on the editor root or any ancestor", () => {
    for (const element of [child("", 'data-gt-narrow="off"'), child('data-gt-narrow="off"', "")]) {
      expect(element.matches(sizes)).toBe(false);
      expect(element.matches(layout)).toBe(true);
    }
  });
  it("keeps the find bar, history and outline layout in the rule that always applies", () => {
    const [step] = tokens.narrow;
    expect(Object.keys(step?.layout ?? {})).toContain("--gt-history-columns");
    const sizeNames = Object.keys(step?.tokens ?? {});
    expect(sizeNames).toContain("--gt-page-pad-x");
    expect(sizeNames.some((name) => /history|find|outline/.test(name))).toBe(false);
  });
});

describe("the document follows the Atlas and names its parts", () => {
  const base = read("base.css");
  it("lets the heading flow reach a list: the list reset weighs nothing (Atlas frame 1)", () => {
    const rule = base.slice(0, base.indexOf("{\n  margin: 0;\n}", base.indexOf("---- lists")));
    expect(rule.slice(rule.lastIndexOf("\n") + 1)).toBe(
      ":where(.gotipe-content ul, .gotipe-content ol) ",
    );
  });
  it("draws the task box with its own tokens, today's colours by default", () => {
    expect(base).toContain(
      "border: var(--gt-check-ring) solid var(--gt-check-line, var(--gt-line-control));",
    );
    expect(base).toContain("background: var(--gt-check-fill, var(--gt-ink)) var(--gt-check-mark)");
  });
});

describe("review parts have tokens with today's values", () => {
  const review = read("theme/review.css");
  it("sizes the card's name and buttons by tokens", () => {
    expect(declarations(review, ".gotipe-review-card-head b")).toMatchObject({
      "font-size": "var(--gt-card-name-size)",
      "font-weight": "var(--gt-card-name-weight)",
    });
    expect(declarations(review, ".gotipe-review-card-actions > .gotipe-btn")).toEqual({
      "font-size": "var(--gt-card-button-size)",
    });
    expect(tokens.view["--gt-card-name-size"]).toBe("var(--gt-ui-size)");
    expect(tokens.view["--gt-card-name-weight"]).toBe("var(--gt-weight-medium)");
    expect(tokens.view["--gt-card-button-size"]).toBe("var(--gt-ui-size)");
  });
  it("keeps the insertion's flush 2 px bar by default and offers an underline", () => {
    const insert = declarations(review, ".gotipe-sug-ins");
    expect(insert["box-shadow"]).toBe(
      "inset 0 calc(-1 * var(--gt-sug-ins-bar)) 0 var(--gt-track, var(--gt-add))",
    );
    expect(insert["text-decoration-line"]).toBe("var(--gt-sug-ins-underline)");
    expect(tokens.view["--gt-sug-ins-bar"]).toBe("var(--gt-rule)");
    expect(tokens.view["--gt-sug-ins-underline"]).toBe("none");
  });
  it("draws a changed block's bar by tokens, the lane's colour unless a host sets one", () => {
    expect(declarations(review, ".gotipe-sug-block-changed")["box-shadow"]).toBe(
      "inset var(--gt-sug-changed-bar-width) 0 0\n    var(--gt-sug-changed-bar, var(--gt-track, var(--gt-add)))",
    );
    expect(tokens.view["--gt-sug-changed-bar-width"]).toBe("var(--gt-rule)");
    expect(Object.keys({ ...tokens.shared, ...tokens.light })).not.toContain(
      "--gt-sug-changed-bar",
    );
  });
  it("gives the secondary button a rule: quiet beside the primary, a fill alone (Atlas frame 14)", () => {
    expect(declarations(review, ".gotipe-btn-secondary")).toEqual({
      background: "transparent",
      color: "var(--gt-text-2)",
    });
    expect(declarations(review, ".gotipe-btn-secondary:only-child")).toEqual({
      background: "var(--gt-fill-2)",
      color: "var(--gt-text)",
    });
  });
  it("puts a card's delete at the end of its head", () => {
    expect(declarations(review, ".gotipe-review-card-delete")["margin-inline-start"]).toBe("auto");
  });
});

describe("page head and slash descriptions", () => {
  it("lets a page's content follow its head at the head's gap", () => {
    const states = read("theme/states.css");
    expect(declarations(states, ".gotipe-page .gotipe-page-head ~ .gotipe-content")).toEqual({
      "padding-top": "var(--gt-head-gap)",
    });
    expect(
      declarations(states, ".gotipe-page-head ~ .gotipe-content:where(:not(.gotipe-page *))"),
    ).toEqual({
      "padding-top": "var(--gt-head-after)",
    });
  });
  it("shows a slash row's description as one quiet line", () => {
    const menus = read("theme/menus.css");
    expect(declarations(menus, ".gotipe-slash-menu-item-description")).toMatchObject({
      color: "var(--gt-text-2)",
      "font-size": "var(--gt-ui-small)",
      "text-overflow": "ellipsis",
      "white-space": "nowrap",
    });
  });
});
