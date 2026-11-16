import { describe, expect, it } from "vitest";
import tokens from "../../../styles/tokens-site.css?raw";
import header from "../../site/site-header.tsx?raw";
import hero from "../hero.tsx?raw";
import { HERO_CALM } from "./hero-background";
import { NEBULA } from "./nebula";
import { STAGE_COLOURS, STAGE_HEADER, approach, hexColour } from "./shader-stage";

/** The declarations of a theme's block in the site's tokens: `[data-theme="…"] { … }`. */
function themeBlock(css: string, theme: "light" | "dark"): string {
  const start = css.indexOf(`[data-theme="${theme}"] {`);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("\n}", start));
}

describe("the stage shader", () => {
  it("reads a hex colour as three channels, and nothing else", () => {
    expect(hexColour(" #2f6bff ")).toEqual([47 / 255, 107 / 255, 1]);
    expect(hexColour("#fff")).toEqual([1, 1, 1]);
    expect(hexColour("rgb(0 0 0)")).toBeNull();
    expect(hexColour("")).toBeNull();
  });

  it("eases toward a target without passing it", () => {
    expect(approach(0, 1, 0, 5)).toBe(0);
    const next = approach(0, 1, 0.1, 5);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  it("gives the nebula every uniform it reads", () => {
    const declared = new Set(
      [...STAGE_HEADER.matchAll(/uniform \w+ (u_\w+)/g)].map((match) => match[1]),
    );
    const used = new Set([...NEBULA.matchAll(/\bu_\w+/g)].map((match) => match[0]));
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(declared, name).toContain(name);
  });

  it("finds each of its colours as a hex token in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const block = themeBlock(tokens, theme);
      for (const token of Object.values(STAGE_COLOURS)) {
        const value = new RegExp(`${token}:\\s*([^;]+);`).exec(block)?.[1] ?? "";
        expect(hexColour(value), `${token} in ${theme}`).not.toBeNull();
      }
    }
  });

  it("calms under boxes the page has: the hero's copy and the head", () => {
    for (const selector of HERO_CALM)
      expect(hero + header).toContain(`className="${selector.slice(1)}"`);
  });
});
