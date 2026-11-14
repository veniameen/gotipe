import { describe, expect, it } from "vitest";
import {
  MATH_ATTRS,
  MATH_NAMESPACE,
  MATH_TAGS,
  type MathElement,
  type MathNode,
  isMathElement,
  mathToDOM,
  mathToString,
  parseTex,
} from "../src/math";

function math(tex: string, display = false): MathElement {
  const result = parseTex(tex, { display });
  if (!result.ok) throw new Error(`${tex}: ${result.error.message}`);
  return result.math;
}

function walk(node: MathNode, visit: (element: MathElement) => void): void {
  if (typeof node === "string") return;
  visit(node);
  for (const child of node.children) walk(child, visit);
}

const PAYLOAD = "<img src=x onerror=alert(1)>";

describe("mathToDOM", () => {
  it("builds MathML-namespaced elements with only allowed tags and attributes", () => {
    const root = mathToDOM(math("p = \\frac{L}{N} + \\left( x \\right)", true));
    expect(root.namespaceURI).toBe(MATH_NAMESPACE);
    expect(root.localName).toBe("math");
    expect(root.getAttribute("display")).toBe("block");
    const all = [root, ...root.querySelectorAll("*")];
    for (const element of all) {
      expect(element.namespaceURI).toBe(MATH_NAMESPACE);
      expect(MATH_TAGS.has(element.localName)).toBe(true);
      for (const attr of element.attributes) expect(MATH_ATTRS.has(attr.name)).toBe(true);
    }
    expect([...root.children].map((c) => c.localName)).toEqual(["mi", "mo", "mfrac", "mo", "mrow"]);
    const frac = root.children[2]!;
    expect([...frac.children].map((c) => c.textContent)).toEqual(["L", "N"]);
    expect(root.querySelector("mo[fence]")?.getAttribute("stretchy")).toBe("true");
  });

  it("uses the given document", () => {
    const doc = document.implementation.createHTMLDocument("x");
    expect(mathToDOM(math("x")).ownerDocument).toBe(document);
    expect(mathToDOM(math("x"), doc).ownerDocument).toBe(doc);
  });

  it("keeps Cyrillic and emoji text intact", () => {
    const root = mathToDOM(math("\\text{скорость 🚀} = v"));
    expect(root.firstElementChild?.localName).toBe("mtext");
    expect(root.firstElementChild?.textContent).toBe("скорость 🚀");
  });
});

describe("mathToString", () => {
  it("serializes with xmlns on the root and attributes in order", () => {
    expect(mathToString(math("x^2", true))).toBe(
      `<math xmlns="${MATH_NAMESPACE}" display="block"><msup><mi>x</mi><mn>2</mn></msup></math>`,
    );
    expect(mathToString(math("a<b"))).toBe(
      `<math xmlns="${MATH_NAMESPACE}"><mi>a</mi><mo>&lt;</mo><mi>b</mi></math>`,
    );
  });

  it("escapes every text character that could form markup", () => {
    const html = mathToString(math("\\text{a & b \"q\" 'x' </math>}"));
    expect(html).toContain("<mtext>a &amp; b &quot;q&quot; &#39;x&#39; &lt;/math&gt;</mtext>");
  });

  it("parses back in the browser without creating HTML elements", () => {
    const host = document.createElement("div");
    host.innerHTML = mathToString(math(`\\text{${PAYLOAD}} + \\frac{1}{2}`));
    expect(host.querySelector("img")).toBeNull();
    const root = host.firstElementChild!;
    expect(root.namespaceURI).toBe(MATH_NAMESPACE);
    expect(root.querySelector("mtext")?.textContent).toBe(PAYLOAD);
  });
});

describe("security", () => {
  it("keeps HTML inside \\text as a text node (DOM)", () => {
    const root = mathToDOM(math(`\\text{${PAYLOAD}}`));
    const mtext = root.firstElementChild!;
    expect(root.children).toHaveLength(1);
    expect(mtext.localName).toBe("mtext");
    expect(mtext.children).toHaveLength(0);
    expect(mtext.childNodes).toHaveLength(1);
    expect(mtext.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(mtext.textContent).toBe(PAYLOAD);
    expect(root.querySelector("img")).toBeNull();
  });

  it("escapes HTML inside \\text (string)", () => {
    const html = mathToString(math(`\\text{${PAYLOAD}}`));
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img");
  });

  it("rejects commands that could link, style or include content", () => {
    for (const tex of [
      "\\href{javascript:alert(1)}{x}",
      "\\url{https://example.com}",
      "\\html{<b>x</b>}",
      "\\htmlClass{a}{x}",
      "\\htmlId{a}{x}",
      "\\htmlStyle{color:red}{x}",
      "\\htmlData{a=b}{x}",
      "\\style{color:red}{x}",
      "\\class{a}{x}",
      "\\includegraphics{x.png}",
      "\\def\\x{y}",
      "\\newcommand{\\x}{y}",
      "\\input{file}",
    ]) {
      const result = parseTex(tex);
      expect(result.ok, tex).toBe(false);
      if (!result.ok) {
        expect(result.error.code, tex).toBe("unknownCommand");
        expect(result.error.from).toBe(0);
        expect(result.error.detail).toBe(tex.slice(0, result.error.to));
      }
    }
  });

  it("does not resolve Object.prototype names as commands", () => {
    for (const name of ["constructor", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf"]) {
      const result = parseTex(`\\${name}`);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "unknownCommand", detail: `\\${name}` },
      });
    }
    // In TeX `\_` is the escaped underscore, so `\__proto__` lexes as `\_` `_proto__`.
    expect(parseTex("\\__proto__").ok).toBe(false);
    expect(parseTex("\\mathbb{\\constructor}").ok).toBe(false);
    expect(parseTex("\\left\\toString x \\right)")).toMatchObject({
      ok: false,
      error: { code: "badDelimiter", detail: "\\toString" },
    });
    expect(math("\\text{__proto__ constructor}").children[0]).toEqual({
      tag: "mtext",
      children: ["__proto__ constructor"],
    });
  });

  it("takes attribute values only from fixed tables", () => {
    const allowed = new Set([
      "block",
      "true",
      "false",
      "normal",
      "bold",
      "italic",
      "bold-italic",
      "double-struck",
      "script",
      "fraktur",
      "sans-serif",
      "monospace",
      "0.1667em",
      "0.2222em",
      "0.2778em",
      "-0.1667em",
      "0.25em",
      "0.5em",
      "1em",
      "2em",
    ]);
    const tex = [
      "\\mathbf{x}",
      `\\textbf{${PAYLOAD}}`,
      "\\hat{a}\\,\\left( \\frac{\\Gamma}{\\mathbb{R}} \\right)",
      "\\sum_{i}^{n} \\quad \\overline{z} \\operatorname{x}",
    ].join(" ");
    const tree = math(tex, true);
    walk(tree, (element) => {
      for (const value of Object.values(element.attrs ?? {}))
        expect(allowed.has(value!)).toBe(true);
    });
  });

  it("rejects hand-made trees with forbidden tags", () => {
    for (const tag of ["script", "foreignObject", "annotation-xml", "semantics", "img", "a"]) {
      const bad = { tag: "math", children: [{ tag: "mrow", children: [{ tag, children: [] }] }] };
      expect(isMathElement(bad)).toBe(false);
      expect(() => mathToDOM(bad as unknown as MathElement)).toThrow(TypeError);
      expect(() => mathToString(bad as unknown as MathElement)).toThrow(TypeError);
    }
  });

  it("rejects hand-made trees with forbidden attributes", () => {
    for (const attrs of [
      { href: "javascript:alert(1)" },
      { onclick: "alert(1)" },
      { style: "color:red" },
      { mathvariant: 1 },
      JSON.parse('{"__proto__": "x"}'),
      ["display"],
    ]) {
      const bad = { tag: "mi", attrs, children: ["x"] };
      expect(isMathElement(bad)).toBe(false);
      expect(() => mathToDOM(bad as unknown as MathElement)).toThrow(TypeError);
      expect(() => mathToString(bad as unknown as MathElement)).toThrow(TypeError);
    }
  });

  it("validates structure: text only in tokens, no nested math, no cycles", () => {
    expect(isMathElement(math("\\frac{a}{\\sqrt{b}} + \\text{t}"))).toBe(true);
    expect(isMathElement({ tag: "mrow", children: ["raw"] })).toBe(false);
    expect(isMathElement({ tag: "mi", children: [{ tag: "mi", children: ["x"] }] })).toBe(false);
    expect(isMathElement({ tag: "mrow", children: [{ tag: "math", children: [] }] })).toBe(false);
    expect(isMathElement({ tag: "mrow" })).toBe(false);
    expect(isMathElement("mi")).toBe(false);
    expect(isMathElement(null)).toBe(false);
    const cyclic: { tag: string; children: unknown[] } = { tag: "mrow", children: [] };
    cyclic.children.push(cyclic);
    expect(isMathElement(cyclic)).toBe(false);
  });
});
