// Fixed TeX tables. Every lookup goes through a Map, so `\constructor` or `\toString` never
// reaches Object.prototype; every output attribute value comes from these tables.

export interface SymbolEntry {
  tag: "mi" | "mo";
  text: string;
  /** Upright single-letter identifier (`mathvariant="normal"`). */
  normal?: boolean;
  /** Large operator: limits under/over in display mode, or scripts at the side. */
  op?: "limits" | "nolimits";
}

/** Splits "name char name char …" into pairs. */
function pairs(table: string): [string, string][] {
  const parts = table.split(" ");
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) out.push([parts[i]!, parts[i + 1]!]);
  return out;
}

function entries(
  tag: SymbolEntry["tag"],
  table: string,
  extra?: Omit<SymbolEntry, "tag" | "text">,
): [string, SymbolEntry][] {
  return pairs(table).map(([name, text]) => [name, { tag, text, ...extra }]);
}

function names(table: string, op?: SymbolEntry["op"]): [string, SymbolEntry][] {
  return table.split(" ").map((name) => {
    const text = name.startsWith("lim") && name.length > 3 ? `lim ${name.slice(3)}` : name;
    return [name, op ? { tag: "mi", text, op } : { tag: "mi", text }];
  });
}

const LOWER =
  "alpha α beta β gamma γ delta δ epsilon ϵ varepsilon ε zeta ζ eta η theta θ vartheta ϑ " +
  "iota ι kappa κ varkappa ϰ lambda λ mu μ nu ν xi ξ omicron ο pi π varpi ϖ rho ρ varrho ϱ " +
  "sigma σ varsigma ς tau τ upsilon υ phi ϕ varphi φ chi χ psi ψ omega ω infty ∞ partial ∂ " +
  "emptyset ∅ varnothing ∅ hbar ℏ ell ℓ Re ℜ Im ℑ aleph ℵ wp ℘ imath ı jmath ȷ degree ° " +
  "prime ′ top ⊤ bot ⊥";

const UPRIGHT =
  "Gamma Γ Delta Δ Theta Θ Lambda Λ Xi Ξ Pi Π Sigma Σ Upsilon Υ Phi Φ Psi Ψ Omega Ω nabla ∇";

const OPERATORS =
  "cdot ⋅ times × div ÷ pm ± mp ∓ le ≤ leq ≤ ge ≥ geq ≥ ne ≠ neq ≠ approx ≈ equiv ≡ sim ∼ " +
  "simeq ≃ cong ≅ propto ∝ ll ≪ gg ≫ to → rightarrow → leftarrow ← gets ← leftrightarrow ↔ " +
  "Rightarrow ⇒ Leftarrow ⇐ Leftrightarrow ⇔ iff ⟺ implies ⟹ impliedby ⟸ mapsto ↦ " +
  "longrightarrow ⟶ longleftarrow ⟵ uparrow ↑ downarrow ↓ in ∈ notin ∉ ni ∋ subset ⊂ " +
  "subseteq ⊆ supset ⊃ supseteq ⊇ cup ∪ cap ∩ setminus ∖ forall ∀ exists ∃ nexists ∄ neg ¬ " +
  "lnot ¬ land ∧ wedge ∧ lor ∨ vee ∨ ldots … dots … cdots ⋯ vdots ⋮ ddots ⋱ circ ∘ ast ∗ " +
  "star ⋆ bullet ∙ perp ⊥ parallel ∥ mid ∣ angle ∠ oplus ⊕ ominus ⊖ otimes ⊗ odot ⊙ " +
  "langle ⟨ rangle ⟩ lfloor ⌊ rfloor ⌋ lceil ⌈ rceil ⌉ vert | Vert ‖ lvert | rvert | " +
  "lVert ‖ rVert ‖ lbrace { rbrace } colon : triangle △ backslash \\ " +
  // Escaped characters: \{ \} \| \% \$ \# \& \_
  "{ { } } | ‖ % % $ $ # # & & _ _";

const BIG_OPERATORS =
  "sum ∑ prod ∏ coprod ∐ bigcup ⋃ bigcap ⋂ bigvee ⋁ bigwedge ⋀ bigoplus ⨁ bigotimes ⨂ " +
  "bigodot ⨀ bigsqcup ⨆ biguplus ⨄";

const INTEGRALS = "int ∫ iint ∬ iiint ∭ oint ∮ oiint ∯";

const FUNCTIONS =
  "arcsin arccos arctan arg cos cosh cot coth csc deg dim exp hom ker lg ln log sec sin sinh " +
  "tan tanh";

const LIMIT_FUNCTIONS = "det gcd inf lim liminf limsup max min Pr sup";

export const SYMBOLS: ReadonlyMap<string, SymbolEntry> = new Map([
  ...entries("mi", LOWER),
  ...entries("mi", UPRIGHT, { normal: true }),
  ...entries("mo", OPERATORS),
  ...entries("mo", BIG_OPERATORS, { op: "limits" }),
  ...entries("mo", INTEGRALS, { op: "nolimits" }),
  ...names(FUNCTIONS),
  ...names(LIMIT_FUNCTIONS, "limits"),
]);

/** Spacing commands → `mspace width` (TeX mu converted to em). */
export const SPACES: ReadonlyMap<string, string> = new Map([
  [",", "0.1667em"],
  ["thinspace", "0.1667em"],
  [":", "0.2222em"],
  [">", "0.2222em"],
  ["medspace", "0.2222em"],
  [";", "0.2778em"],
  ["thickspace", "0.2778em"],
  ["!", "-0.1667em"],
  ["negthinspace", "-0.1667em"],
  [" ", "0.25em"],
  ["enspace", "0.5em"],
  ["quad", "1em"],
  ["qquad", "2em"],
]);

/** Accent placement: over a fixed mark, over a stretchy mark, under a stretchy mark. */
export type AccentKind = "over" | "wide" | "under";

const ACCENT_TABLE =
  "hat ^ over widehat ^ wide check ˇ over widecheck ˇ wide tilde ~ over widetilde ~ wide " +
  "bar ˉ over acute ´ over grave ` over dot ˙ over ddot ¨ over breve ˘ over mathring ˚ over " +
  "vec → over overline ‾ wide underline ‾ under overrightarrow → wide overleftarrow ← wide " +
  "overleftrightarrow ↔ wide overbrace ⏞ wide underbrace ⏟ under";

export const ACCENTS: ReadonlyMap<string, [string, AccentKind]> = new Map(
  ACCENT_TABLE.match(/\S+ \S+ \S+/g)?.map((triple) => {
    const [name, mark, kind] = triple.split(" ");
    return [name!, [mark!, kind as AccentKind]];
  }),
);

/** `\left`/`\right`/`\middle` delimiters by token text; "." means no delimiter. */
export const DELIMITERS: ReadonlyMap<string, string> = new Map([
  [".", ""],
  ...pairs(
    "( ( ) ) [ [ ] ] | | / / < ⟨ > ⟩ \\{ { \\} } \\| ‖ \\langle ⟨ \\rangle ⟩ \\lbrace { " +
      "\\rbrace } \\lbrack [ \\rbrack ] \\vert | \\Vert ‖ \\lvert | \\rvert | \\lVert ‖ " +
      "\\rVert ‖ \\lfloor ⌊ \\rfloor ⌋ \\lceil ⌈ \\rceil ⌉ \\uparrow ↑ \\downarrow ↓ \\backslash \\",
  ),
]);
