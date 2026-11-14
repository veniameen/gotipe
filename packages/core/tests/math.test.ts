import { describe, expect, it } from "vitest";
import { type MathElement, type MathNode, parseTex } from "../src/math";

const TOKENS = new Set(["mi", "mn", "mo", "mtext"]);

/** Walks a tree into a compact structural form: tokens as `tag:text`, others as `tag(…)`. */
function shape(node: MathNode): string {
  if (typeof node === "string") return node;
  if (TOKENS.has(node.tag)) return `${node.tag}:${node.children.join("")}`;
  if (node.tag === "mspace") return `mspace[${node.attrs?.width}]`;
  return `${node.tag}(${node.children.map(shape).join(" ")})`;
}

function math(tex: string, display = false): MathElement {
  const result = parseTex(tex, { display });
  if (!result.ok) throw new Error(`${tex}: ${result.error.message}`);
  return result.math;
}

const tree = (tex: string, display = false) => shape(math(tex, display));

/** Finds the first element with a tag (depth-first). */
function find(node: MathNode, tag: string): MathElement | undefined {
  if (typeof node === "string") return undefined;
  if (node.tag === tag) return node;
  for (const child of node.children) {
    const hit = find(child, tag);
    if (hit) return hit;
  }
  return undefined;
}

describe("parseTex: atoms", () => {
  it("returns an empty math element for empty or blank input", () => {
    expect(math("")).toEqual({ tag: "math", children: [] });
    expect(math("  \n ")).toEqual({ tag: "math", children: [] });
    expect(math("", true)).toEqual({ tag: "math", attrs: { display: "block" }, children: [] });
  });

  it("joins digits with a decimal point into one mn", () => {
    expect(tree("3.14")).toBe("math(mn:3.14)");
    expect(tree("x = 1, 2")).toBe("math(mi:x mo:= mn:1 mo:, mn:2)");
    expect(tree(".5")).toBe("math(mn:.5)");
  });

  it("gives every Latin letter its own italic mi and ignores whitespace", () => {
    const m = math("a b\tc");
    expect(shape(m)).toBe("math(mi:a mi:b mi:c)");
    expect((m.children[0] as MathElement).attrs).toBeUndefined();
  });

  it("maps operator characters, using U+2212 for minus", () => {
    expect(tree("a-b+c*d/e")).toBe("math(mi:a mo:− mi:b mo:+ mi:c mo:∗ mi:d mo:/ mi:e)");
    expect(tree("x<y>z;!:|")).toBe("math(mi:x mo:< mi:y mo:> mi:z mo:; mo:! mo:: mo:|)");
  });

  it("keeps plain brackets non-stretchy", () => {
    const m = math("(a]");
    expect(shape(m)).toBe("math(mo:( mi:a mo:])");
    expect((m.children[0] as MathElement).attrs).toEqual({ stretchy: "false" });
  });

  it("renders the formula from the task brief", () => {
    expect(tree("p = \\frac{L}{N}")).toBe("math(mi:p mo:= mfrac(mi:L mi:N))");
  });

  it("treats % as a comment until the end of the line", () => {
    expect(tree("a % comment\n+ b")).toBe("math(mi:a mo:+ mi:b)");
  });
});

describe("parseTex: scripts", () => {
  it("builds msup with a grouped negative exponent", () => {
    expect(tree("10^{-3}")).toBe("math(msup(mn:10 mrow(mo:− mn:3)))");
  });

  it("takes a single token as a script argument", () => {
    expect(tree("x^2")).toBe("math(msup(mi:x mn:2))");
    expect(tree("x^23")).toBe("math(msup(mi:x mn:2) mn:3)");
    expect(tree("x_i")).toBe("math(msub(mi:x mi:i))");
  });

  it("combines sub and sup in either order into msubsup(base, sub, sup)", () => {
    expect(tree("x_i^2")).toBe("math(msubsup(mi:x mi:i mn:2))");
    expect(tree("x^2_i")).toBe("math(msubsup(mi:x mi:i mn:2))");
  });

  it("turns primes into a superscript", () => {
    expect(tree("f'")).toBe("math(msup(mi:f mo:′))");
    expect(tree("f''")).toBe("math(msup(mi:f mo:′′))");
    expect(tree("f'^2")).toBe("math(msup(mi:f mrow(mo:′ mn:2)))");
  });

  it("uses an empty mrow as base for a leading script and scripts a group", () => {
    expect(tree("^2")).toBe("math(msup(mrow() mn:2))");
    expect(tree("{a+b}^2")).toBe("math(msup(mrow(mi:a mo:+ mi:b) mn:2))");
  });
});

describe("parseTex: fractions and roots", () => {
  it("parses \\frac, \\dfrac, \\tfrac and single-token arguments", () => {
    expect(tree("\\frac{a+b}{c}")).toBe("math(mfrac(mrow(mi:a mo:+ mi:b) mi:c))");
    expect(tree("\\dfrac12")).toBe("math(mfrac(mn:1 mn:2))");
    expect(tree("\\tfrac\\alpha\\beta")).toBe("math(mfrac(mi:α mi:β))");
    expect(tree("\\frac{\\frac{1}{x}}{y}")).toBe("math(mfrac(mfrac(mn:1 mi:x) mi:y))");
  });

  it("parses \\sqrt and \\sqrt[n] as mroot(base, index)", () => {
    expect(tree("\\sqrt{x}")).toBe("math(msqrt(mi:x))");
    expect(tree("\\sqrt[3]{x}")).toBe("math(mroot(mi:x mn:3))");
    expect(tree("\\sqrt[n+1]{x^2}")).toBe("math(mroot(msup(mi:x mn:2) mrow(mi:n mo:+ mn:1)))");
  });
});

describe("parseTex: symbols", () => {
  it("maps lowercase Greek to italic mi and uppercase Greek to upright mi", () => {
    expect(tree("\\alpha\\varepsilon\\vartheta\\varphi\\varrho\\varsigma\\omega")).toBe(
      "math(mi:α mi:ε mi:ϑ mi:φ mi:ϱ mi:ς mi:ω)",
    );
    const upper = math("\\Gamma\\Delta\\Theta\\Lambda\\Xi\\Pi\\Sigma\\Upsilon\\Phi\\Psi\\Omega");
    expect(shape(upper)).toBe("math(mi:Γ mi:Δ mi:Θ mi:Λ mi:Ξ mi:Π mi:Σ mi:Υ mi:Φ mi:Ψ mi:Ω)");
    for (const child of upper.children) {
      expect((child as MathElement).attrs).toEqual({ mathvariant: "normal" });
    }
  });

  it("maps operators and relations to mo", () => {
    expect(tree("a \\cdot b \\times c \\le d \\neq e \\to f \\in g \\iff h")).toBe(
      "math(mi:a mo:⋅ mi:b mo:× mi:c mo:≤ mi:d mo:≠ mi:e mo:→ mi:f mo:∈ mi:g mo:⟺ mi:h)",
    );
    expect(tree("\\infty \\partial \\nabla \\emptyset")).toBe("math(mi:∞ mi:∂ mi:∇ mi:∅)");
    expect(tree("\\ldots\\cdots\\forall\\exists")).toBe("math(mo:… mo:⋯ mo:∀ mo:∃)");
  });

  it("maps escaped characters", () => {
    expect(tree("\\{ \\} \\| \\% \\$ \\# \\& \\_")).toBe(
      "math(mo:{ mo:} mo:‖ mo:% mo:$ mo:# mo:& mo:_)",
    );
  });

  it("maps spacing commands to mspace widths from the fixed table", () => {
    expect(tree("a\\,b\\;c\\:d\\!e\\quad f\\qquad g\\ h~i")).toBe(
      "math(mi:a mspace[0.1667em] mi:b mspace[0.2778em] mi:c mspace[0.2222em] mi:d " +
        "mspace[-0.1667em] mi:e mspace[1em] mi:f mspace[2em] mi:g mspace[0.25em] mi:h " +
        "mspace[0.25em] mi:i)",
    );
  });

  it("renders function names as one upright mi", () => {
    const m = math("\\sin x + \\log y");
    expect(shape(m)).toBe("math(mi:sin mi:x mo:+ mi:log mi:y)");
    expect((m.children[0] as MathElement).attrs).toBeUndefined();
    expect(tree("\\sin^2 x")).toBe("math(msup(mi:sin mn:2) mi:x)");
  });

  it("joins \\operatorname into one mi, upright when it is a single letter", () => {
    expect(tree("\\operatorname{sgn} x")).toBe("math(mi:sgn mi:x)");
    expect(math("\\operatorname{d}").children[0]).toEqual({
      tag: "mi",
      attrs: { mathvariant: "normal" },
      children: ["d"],
    });
  });
});

describe("parseTex: large operators", () => {
  it("puts \\sum limits under/over in display mode", () => {
    expect(tree("\\sum_{i=1}^n i", true)).toBe(
      "math(munderover(mo:∑ mrow(mi:i mo:= mn:1) mi:n) mi:i)",
    );
    expect(tree("\\prod_{k} a_k", true)).toBe("math(munder(mo:∏ mi:k) msub(mi:a mi:k))");
  });

  it("puts \\sum limits at the side inline", () => {
    expect(tree("\\sum_{i=1}^n i")).toBe("math(msubsup(mo:∑ mrow(mi:i mo:= mn:1) mi:n) mi:i)");
  });

  it("puts \\lim limits under in display mode", () => {
    expect(tree("\\lim_{x\\to 0} f", true)).toBe("math(munder(mi:lim mrow(mi:x mo:→ mn:0)) mi:f)");
    expect(tree("\\lim_{x\\to 0} f")).toBe("math(msub(mi:lim mrow(mi:x mo:→ mn:0)) mi:f)");
  });

  it("keeps integral limits at the side unless \\limits is given", () => {
    expect(tree("\\int_0^1 x", true)).toBe("math(msubsup(mo:∫ mn:0 mn:1) mi:x)");
    expect(tree("\\int\\limits_0^1 x")).toBe("math(munderover(mo:∫ mn:0 mn:1) mi:x)");
    expect(tree("\\sum\\nolimits_i x", true)).toBe("math(msub(mo:∑ mi:i) mi:x)");
    expect(tree("\\iint \\oint")).toBe("math(mo:∬ mo:∮)");
  });
});

describe("parseTex: fences", () => {
  it("wraps \\left…\\right into an mrow with stretchy fences", () => {
    const m = math("\\left( \\frac{a}{b} \\right)");
    expect(shape(m)).toBe("math(mrow(mo:( mfrac(mi:a mi:b) mo:)))");
    const fences = (m.children[0] as MathElement).children as MathElement[];
    expect(fences[0]!.attrs).toEqual({ fence: "true", stretchy: "true" });
    expect(fences[2]!.attrs).toEqual({ fence: "true", stretchy: "true" });
  });

  it("supports command delimiters, the empty delimiter and \\middle", () => {
    expect(tree("\\left\\{ x \\right.")).toBe("math(mrow(mo:{ mi:x))");
    expect(tree("\\left\\langle a \\middle| b \\right\\rangle")).toBe(
      "math(mrow(mo:⟨ mi:a mo:| mi:b mo:⟩))",
    );
    expect(tree("\\left\\| v \\right\\|")).toBe("math(mrow(mo:‖ mi:v mo:‖))");
    expect(tree("\\left[ \\left( x \\right) \\right]")).toBe(
      "math(mrow(mo:[ mrow(mo:( mi:x mo:)) mo:]))",
    );
  });
});

describe("parseTex: text and fonts", () => {
  it("keeps \\text content literally, including spaces, Cyrillic and emoji", () => {
    expect(math("\\text{если } x").children).toEqual([
      { tag: "mtext", children: ["если "] },
      { tag: "mi", children: ["x"] },
    ]);
    expect(math("\\text{ok 👍🏽 \\frac{a}{b} $5}").children[0]).toEqual({
      tag: "mtext",
      children: ["ok 👍🏽 \\fracab $5"],
    });
    expect(math("\\text{50\\% {braces} \\{x\\}}").children[0]).toEqual({
      tag: "mtext",
      children: ["50% braces {x}"],
    });
  });

  it("maps text commands to mtext variants", () => {
    expect(math("\\textbf{Итого}").children[0]).toEqual({
      tag: "mtext",
      attrs: { mathvariant: "bold" },
      children: ["Итого"],
    });
    expect(math("\\text{}").children[0]).toEqual({ tag: "mtext", children: [] });
  });

  it("applies math alphabets with mathvariant and Unicode letters", () => {
    expect(math("\\mathbb{R}").children[0]).toEqual({
      tag: "mi",
      attrs: { mathvariant: "double-struck" },
      children: ["ℝ"],
    });
    expect(math("\\mathbf{v}").children[0]).toEqual({
      tag: "mi",
      attrs: { mathvariant: "bold" },
      children: ["𝐯"],
    });
    expect(math("\\mathcal{L}").children[0]).toEqual({
      tag: "mi",
      attrs: { mathvariant: "script" },
      children: ["ℒ"],
    });
    expect(math("\\mathit{x}").children[0]).toMatchObject({ attrs: { mathvariant: "italic" } });
    expect(tree("\\mathbf{x+1}")).toBe("math(mrow(mi:𝐱 mo:+ mn:𝟏))");
  });

  it("makes \\mathrm upright", () => {
    expect(math("\\mathrm{d}x").children).toEqual([
      { tag: "mi", attrs: { mathvariant: "normal" }, children: ["d"] },
      { tag: "mi", children: ["x"] },
    ]);
    expect(math("\\mathrm{max}").children[0]).toEqual({ tag: "mi", children: ["max"] });
  });
});

describe("parseTex: accents", () => {
  it("builds mover with accent=true and a fixed or stretchy mark", () => {
    const hat = math("\\hat{x}").children[0] as MathElement;
    expect(shape(hat)).toBe("mover(mi:x mo:^)");
    expect(hat.attrs).toEqual({ accent: "true" });
    expect((hat.children[1] as MathElement).attrs).toEqual({ stretchy: "false" });
    expect(tree("\\bar x \\vec v \\tilde a \\dot b \\ddot c")).toBe(
      "math(mover(mi:x mo:ˉ) mover(mi:v mo:→) mover(mi:a mo:~) mover(mi:b mo:˙) mover(mi:c mo:¨))",
    );
    const line = math("\\overline{AB}").children[0] as MathElement;
    expect(shape(line)).toBe("mover(mrow(mi:A mi:B) mo:‾)");
    expect((line.children[1] as MathElement).attrs).toEqual({ stretchy: "true" });
  });

  it("builds munder for \\underline", () => {
    const under = math("\\underline{x}").children[0] as MathElement;
    expect(shape(under)).toBe("munder(mi:x mo:‾)");
    expect((under.children[1] as MathElement).attrs).toEqual({ stretchy: "true" });
  });

  it("finds accents nested in other constructs", () => {
    expect(find(math("\\frac{\\hat{p}}{2}"), "mover")?.attrs).toEqual({ accent: "true" });
  });
});
