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
  const sheets = [
    "base.css",
    "theme/review.css",
    "theme/panels.css",
    "theme/media.css",
    "theme/tables.css",
  ].map(read);
  const derived: Record<string, string> = {
    "--gt-comment-soft": "var(--gt-comment-tint)",
    "--gt-ai-ghost": "var(--gt-text-3)",
    "--gt-check-fill": "var(--gt-ink)",
    "--gt-check-line": "var(--gt-line-control)",
    "--gt-caption-color": "var(--gt-text-2)",
    "--gt-image-ring-color": "var(--gt-line)",
    "--gt-image-empty-bg": "var(--gt-sunken)",
    "--gt-table-line": "var(--gt-line)",
    "--gt-table-head-line": "var(--gt-line-strong)",
    "--gt-table-head-color": "var(--gt-text-2)",
    "--gt-table-head-fill": "transparent",
    "--gt-table-code-fill": "var(--gt-fill-2)",
    "--gt-sug-block-ins-tint": "var(--gt-track-tint)",
    "--gt-sug-stale-color": "var(--gt-text-2)",
    "--gt-sug-stale-line": "var(--gt-line-control)",
    "--gt-sug-stale-check-line": "var(--gt-line-control)",
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
    const line =
      "color-mix(in srgb, var(--gt-track, var(--gt-add)) var(--gt-sug-ins-line-mix), transparent)";
    expect(insert["box-shadow"]).toBe(`inset 0 calc(-1 * var(--gt-sug-ins-bar)) 0\n    ${line}`);
    expect(insert["text-decoration-line"]).toBe("var(--gt-sug-ins-underline)");
    expect(tokens.view["--gt-sug-ins-bar"]).toBe("var(--gt-rule)");
    expect(tokens.view["--gt-sug-ins-underline"]).toBe("none");
    // all of the lane's colour by default: the line is the lane's colour, as before
    expect(tokens.view["--gt-sug-ins-line-mix"]).toBe("100%");
  });
  it("draws a new block's fill and underline by tokens, today's by default", () => {
    const block = review.slice(review.indexOf("/* a whole new block"));
    const rule = block.slice(0, block.indexOf("}"));
    expect(rule).toContain("var(--gt-sug-block-ins-tint, var(--gt-track-tint))");
    expect(rule).toContain("text-decoration: var(--gt-sug-block-ins-underline);");
    expect(rule).toContain("var(--gt-sug-ins-line-mix)");
    expect(rule).toContain(
      "text-decoration-thickness: var(--gt-sug-block-ins-underline-thickness);",
    );
    expect(tokens.view["--gt-sug-block-ins-underline"]).toBe("underline");
    expect(tokens.view["--gt-sug-block-ins-underline-thickness"]).toBe("var(--gt-underline)");
  });
  it("can tint a new block's text alone, none by default", () => {
    const text = declarations(review, ".gotipe-sug-block-ins-text");
    expect(text.background.replace(/\s+/g, " ")).toBe(
      "color-mix( in srgb, var(--gt-track, var(--gt-add)) var(--gt-sug-block-ins-text-tint), transparent )",
    );
    expect(text["box-decoration-break"]).toBe("clone");
    expect(tokens.view["--gt-sug-block-ins-text-tint"]).toBe("0%");
    expect(declarations(review, ".gotipe-sug-stale .gotipe-sug-block-ins-text").background).toBe(
      "transparent",
    );
  });
  it("draws a stale proposal by tokens: today's quiet text and dashed line by default", () => {
    const stale = declarations(review, ".gotipe-sug-stale");
    expect(stale.color).toBe("var(--gt-sug-stale-color, var(--gt-text-2))");
    expect(stale["text-decoration"]).toBe(
      "underline var(--gt-sug-stale-underline-style)\n    var(--gt-sug-stale-line, var(--gt-line-control))",
    );
    expect(stale["text-decoration-thickness"]).toBe("var(--gt-sug-stale-underline-thickness)");
    expect(tokens.view["--gt-sug-stale-underline-style"]).toBe("dashed");
    expect(tokens.view["--gt-sug-stale-underline-thickness"]).toBe("var(--gt-underline)");
    // its card open: the active tint unless a host sets its own fill
    expect(declarations(review, ".gotipe-sug.is-active.gotipe-sug-stale").background).toBe(
      "var(\n    --gt-sug-stale-active-fill,\n    color-mix(in srgb, var(--gt-track, var(--gt-add)) var(--gt-track-tint-active), transparent)\n  )",
    );
    expect(
      declarations(review, 'li.gotipe-sug-block-ins.gotipe-sug-stale > input[type="checkbox"]'),
    ).toEqual({ "border-color": "var(--gt-sug-stale-check-line, var(--gt-line-control))" });
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
  it("fills an open deletion and spaces a replacement by tokens, today's by default", () => {
    expect(declarations(review, ".gotipe-sug.is-active.gotipe-sug-del").background).toBe(
      "var(\n    --gt-sug-del-active-fill,\n    color-mix(in srgb, var(--gt-track, var(--gt-add)) var(--gt-track-tint-active), transparent)\n  )",
    );
    // before the stale rule: a stale deletion keeps the stale fill
    expect(review.indexOf(".gotipe-sug.is-active.gotipe-sug-del {")).toBeLessThan(
      review.indexOf(".gotipe-sug.is-active.gotipe-sug-stale {"),
    );
    expect(declarations(review, ".gotipe-sug-del + .gotipe-sug-ins")).toEqual({
      "margin-inline-start": "var(--gt-sug-replace-gap)",
    });
    expect(tokens.view["--gt-sug-replace-gap"]).toBe("0px");
    expect(read("tokens/palette.css")).not.toContain("--gt-sug-del-active-fill:");
  });
  it("draws a lane's cursor as a pointer by tokens, in the lane's colour", () => {
    const flat = (rule: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(rule).map(([k, v]) => [
          k,
          v.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")"),
        ]),
      );
    // the tip at the row's top, 3/16 and 1.75/16 into the built-in arrow's box, as in 0.1.4
    expect(flat(declarations(review, ".gotipe-lane-cursor > .gotipe-lane-pointer"))).toEqual({
      position: "absolute",
      top: "calc(var(--gt-lane-pointer-at) - var(--gt-lane-pointer-tip-y, calc(var(--gt-lane-pointer-size) * 1.75 / 16)))",
      left: "calc(var(--gt-lane-pointer-tip-x, calc(var(--gt-lane-pointer-size) * 3 / 16)) * -1)",
      width: "var(--gt-lane-pointer-size)",
      height: "var(--gt-lane-pointer-size)",
      color: "var(--gt-track)",
    });
    expect(declarations(review, ".gotipe-lane-cursor > svg.gotipe-lane-pointer")).toEqual({
      stroke: "var(--gt-lane-pointer-outline)",
      "stroke-width": "var(--gt-lane-pointer-outline-width, var(--gt-icon-stroke))",
    });
    expect(
      declarations(review, '.gotipe-lane-cursor[data-variant="pointer"] > .gotipe-lane-chip'),
    ).toEqual({
      top: "calc(var(--gt-lane-pointer-at) + var(--gt-lane-pointer-chip-y))",
      left: "var(--gt-lane-pointer-chip-x)",
      "border-radius": "var(--gt-lane-pointer-chip-radius)",
    });
    expect(tokens.view["--gt-lane-pointer-at"]).toBe("0px");
    // the built-in arrow is outlined in its own colour, as the glyph's stroke was
    expect(tokens.view["--gt-lane-pointer-outline"]).toBe("currentColor");
    // derived from the size where they are used, so a host's size on any container holds
    for (const unset of ["tip-x", "tip-y", "outline-width"]) {
      expect(tokens.view[`--gt-lane-pointer-${unset}`]).toBeUndefined();
    }
    expect(tokens.view["--gt-lane-pointer-size"]).toBe("16px");
    expect(tokens.view["--gt-lane-pointer-chip-x"]).toBe("10px");
    expect(tokens.view["--gt-lane-pointer-chip-y"]).toBe("14px");
    expect(tokens.view["--gt-lane-pointer-chip-radius"]).toBe("var(--gt-radius-inline)");
    // the caret with its flag stays as it is
    expect(declarations(review, ".gotipe-lane-chip").top).toBe(
      "calc(100% + var(--gt-toolbar-gap))",
    );
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

describe("tables have tokens for their grid, head, first column and code, today's by default", () => {
  const tables = read("theme/tables.css");
  const cells = read("theme/table-cells.css");
  it("draws row lines, column lines and a frame by tokens; no columns and no frame by default", () => {
    expect(declarations(tables, ".gotipe-table-wrapper :where(th, td)")).toMatchObject({
      "border-bottom": "var(--gt-table-row-rule) solid var(--gt-table-line, var(--gt-line))",
      "border-left":
        "var(--gt-table-col-rule) var(--gt-table-col-rule-style, none)\n    var(--gt-table-line, var(--gt-line))",
    });
    expect(declarations(tables, ".gotipe-table-wrapper table").border).toBe(
      "var(--gt-table-frame) var(--gt-table-frame-style, none)\n    var(--gt-table-line, var(--gt-line))",
    );
    expect(
      declarations(tables, ".gotipe-table-wrapper :where(tr:not(.is-continued) > :first-child)"),
    ).toEqual({ "border-left-width": "0" });
    expect(tokens.view["--gt-table-row-rule"]).toBe("var(--gt-hairline)");
    expect(tokens.view["--gt-table-col-rule"]).toBe("0px");
    expect(tokens.view["--gt-table-frame"]).toBe("0px");
  });
  it("weighs the last row's reset as the cell rule, so a host's rule on the cells wins", () => {
    expect(tables).not.toContain("tbody > tr:last-child > td {");
    expect(
      declarations(tables, ".gotipe-table-wrapper :where(tbody > tr:last-child > td)"),
    ).toEqual({ "border-bottom": "0" });
    expect(
      declarations(cells, ".gotipe-table-wrapper :where(tbody > tr > td[data-last-row])"),
    ).toEqual({ "border-bottom": "0" });
  });
  it("styles header cells by tokens", () => {
    expect(declarations(tables, ".gotipe-table-wrapper th")).toMatchObject({
      "border-bottom-color": "var(--gt-table-head-line, var(--gt-line-strong))",
      color: "var(--gt-table-head-color, var(--gt-text-2))",
      "font-size": "var(--gt-table-head-size)",
      "font-weight": "var(--gt-table-head-weight)",
      "line-height": "var(--gt-table-head-leading)",
      "letter-spacing": "var(--gt-table-head-tracking)",
    });
    expect(declarations(tables, ".gotipe-table-wrapper :where(th)")).toEqual({
      background: "var(--gt-table-head-fill, transparent)",
    });
    expect(tokens.view["--gt-table-head-size"]).toBe("var(--gt-small-size)");
    expect(tokens.view["--gt-table-head-leading"]).toBe("var(--gt-small-leading)");
    expect(tokens.view["--gt-table-head-weight"]).toBe("var(--gt-weight-medium)");
    expect(tokens.view["--gt-table-head-tracking"]).toBe("normal");
  });
  it("pads the first column and sizes rows by tokens", () => {
    expect(
      declarations(tables, ".gotipe-table-wrapper tr > :where(th, td):first-child")["padding-left"],
    ).toBe("var(--gt-cell-first-pad)");
    expect(
      declarations(
        tables,
        ".gotipe-table-wrapper:has(.gotipe-row-handle) tr > :where(th, td):first-child",
      )["padding-left"],
    ).toBe("max(var(--gt-cell-first-pad), var(--gt-row-handle-full) - var(--gt-row-handle-room))");
    expect(declarations(tables, ".gotipe-table-wrapper :where(td)")).toEqual({
      height: "var(--gt-table-row-height)",
    });
    expect(tokens.view["--gt-cell-first-pad"]).toBe("0px");
    expect(tokens.view["--gt-table-row-height"]).toBe("auto");
  });
  it("lays shared columns out as the token says, fixed by default", () => {
    expect(
      declarations(tables, ".gotipe-table-wrapper table.gotipe-table-shared")["table-layout"],
    ).toBe("var(--gt-table-shared-layout)");
    expect(tokens.view["--gt-table-shared-layout"]).toBe("fixed");
  });
  it("sizes inline code in a cell and its plate by tokens, as in the text by default", () => {
    expect(declarations(tables, ".gotipe-table-wrapper :is(th, td) code:not(pre > code)")).toEqual({
      padding: "var(--gt-table-code-pad)",
      background: "var(--gt-table-code-fill, var(--gt-fill-2))",
      "font-size": "var(--gt-table-code-size)",
    });
    expect(tokens.view["--gt-table-code-size"]).toBe("var(--gt-inline-code-size)");
    expect(tokens.view["--gt-table-code-pad"]).toBe("var(--gt-inline-pad)");
  });
});

describe("flow tokens for tables under headings, lists and list items", () => {
  const base = read("base.css");
  it("spaces a table under a heading by its own token, the heading's gap by default", () => {
    for (const [selector, level] of [
      [".gotipe-content > :where(h2) + :where(.gotipe-table-wrapper)", "h2"],
      [".gotipe-content > :where(h3, h4, h5, h6) + :where(.gotipe-table-wrapper)", "h3"],
      [".gotipe-content > :where(h1, .gotipe-page-title) + :where(.gotipe-table-wrapper)", "h1"],
    ] as const) {
      expect(declarations(base, selector)).toEqual({
        "margin-top": `var(--gt-flow-after-${level}-table)`,
      });
      expect(tokens.view[`--gt-flow-after-${level}-table`]).toBe(`var(--gt-flow-after-${level})`);
    }
    // after the heading rules, so the table's own gap wins under a heading
    expect(base.indexOf("+ :where(.gotipe-table-wrapper)")).toBeGreaterThan(
      base.indexOf(".gotipe-content > :where(.gotipe-page-title) + * {"),
    );
  });
  it("spaces a list after a list and the items of a list by their own tokens", () => {
    const lists = [
      ".gotipe-content > :where(ul, ol) + :where(ul, ol),",
      ".gotipe-content",
      "  :where(.gotipe-callout-content, .gotipe-toggle-content, .gotipe-column, blockquote)",
      "  > :where(ul, ol)",
      "  + :where(ul, ol)",
    ].join("\n");
    expect(declarations(base, lists)).toEqual({ "margin-top": "var(--gt-flow-between-lists)" });
    expect(declarations(base, ".gotipe-content :where(ul, ol) > li + li")).toEqual({
      "margin-top": "var(--gt-list-item-gap)",
    });
    expect(tokens.view["--gt-flow-between-lists"]).toBe("var(--gt-flow)");
    expect(tokens.view["--gt-list-item-gap"]).toBe("var(--gt-flow-list)");
  });
  it("insets list items from the list's edge by a token, none by default", () => {
    expect(declarations(base, ".gotipe-content :where(ul, ol) > li")).toEqual({
      "margin-inline-start": "var(--gt-list-item-inset)",
      "padding-inline-start": "var(--gt-list-item-text-inset)",
    });
    expect(tokens.view["--gt-list-item-inset"]).toBe("0px");
  });
  it("insets a list item's text alone by a token, its dot and number staying, none by default", () => {
    expect(tokens.view["--gt-list-item-text-inset"]).toBe("0px");
    // a bullet item's text after the dot's room; the dot itself is placed from the item's edge
    expect(declarations(base, ".gotipe-content ul:not(.gotipe-todo-list) > li")).toEqual({
      "padding-left": "calc(var(--gt-indent) + var(--gt-list-item-text-inset))",
    });
    expect(
      declarations(base, ".gotipe-content ul:not(.gotipe-todo-list) > li[data-placeholder]::after")
        .left,
    ).toBe("calc(var(--gt-indent) + var(--gt-list-item-text-inset))");
    expect(declarations(base, ".gotipe-content ol > li[data-placeholder]::after").left).toBe(
      "var(--gt-list-item-text-inset)",
    );
  });
});

describe("the empty media block as a row has tokens for its text and button", () => {
  const media = read("theme/media.css");
  it("sizes the label and the button by tokens, today's sizes by default", () => {
    expect(
      declarations(
        media,
        '.gotipe-media-placeholder[data-layout="row"] .gotipe-media-placeholder-label',
      ),
    ).toEqual({ flex: "1", "font-size": "var(--gt-media-row-label-size)" });
    expect(
      declarations(media, '.gotipe-media-placeholder[data-layout="row"] .gotipe-media-button'),
    ).toEqual({
      "min-width": "var(--gt-media-row-button-min-w)",
      height: "var(--gt-media-row-button-h)",
      padding: "var(--gt-media-row-button-pad)",
      "font-size": "var(--gt-media-row-button-size)",
    });
    // the placeholder and every media button: 13 px text and the button's padding, as before
    expect(declarations(media, ".gotipe-media-button")).toMatchObject({
      padding: "var(--gt-button-pad)",
      "font-size": "var(--gt-ui-size)",
    });
    expect(tokens.view["--gt-media-row-label-size"]).toBe("var(--gt-ui-size)");
    expect(tokens.view["--gt-media-row-button-size"]).toBe("var(--gt-ui-size)");
    expect(tokens.view["--gt-media-row-button-pad"]).toBe("var(--gt-button-pad)");
    expect(tokens.view["--gt-media-row-button-min-w"]).toBe("auto");
  });
});
