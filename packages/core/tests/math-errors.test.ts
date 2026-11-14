import { describe, expect, it } from "vitest";
import { type TexError, parseTex } from "../src/math";

function error(tex: string): TexError {
  const result = parseTex(tex);
  if (result.ok) throw new Error(`${tex}: expected an error`);
  return result.error;
}

describe("parseTex errors", () => {
  it("reports an unknown command with its offsets", () => {
    expect(error("a + \\foo")).toEqual({
      code: "unknownCommand",
      detail: "\\foo",
      from: 4,
      to: 8,
      message: "Unknown command \\foo",
    });
    expect(error("x\\")).toMatchObject({ code: "unknownCommand", detail: "\\", from: 1, to: 2 });
  });

  it("reports a missing closing brace at the opening brace", () => {
    expect(error("\\frac{a")).toEqual({
      code: "unclosedGroup",
      detail: "}",
      from: 5,
      to: 6,
      message: 'Missing closing "}"',
    });
    expect(error("\\text{abc")).toMatchObject({
      code: "unclosedGroup",
      detail: "}",
      from: 5,
      to: 6,
    });
    expect(error("\\sqrt[3")).toMatchObject({ code: "unclosedGroup", detail: "]", from: 5, to: 6 });
  });

  it("reports a stray closing brace", () => {
    expect(error("a}")).toEqual({
      code: "unexpectedClose",
      detail: "}",
      from: 1,
      to: 2,
      message: 'Unexpected "}"',
    });
  });

  it("reports a missing argument at the command or script", () => {
    expect(error("\\frac{a}")).toEqual({
      code: "missingArgument",
      detail: "\\frac",
      from: 0,
      to: 5,
      message: "Missing argument for \\frac",
    });
    expect(error("x^")).toMatchObject({ code: "missingArgument", detail: "^", from: 1, to: 2 });
    expect(error("{x_}")).toMatchObject({ code: "missingArgument", detail: "_", from: 2, to: 3 });
    expect(error("\\sqrt")).toMatchObject({ code: "missingArgument", detail: "\\sqrt" });
    expect(error("\\text x")).toMatchObject({ code: "missingArgument", detail: "\\text" });
    expect(error("\\left")).toMatchObject({ code: "missingArgument", detail: "\\left" });
  });

  it("reports unmatched \\left and \\right", () => {
    expect(error("\\left( x")).toEqual({
      code: "unmatchedLeft",
      detail: "\\left",
      from: 0,
      to: 5,
      message: "\\left without matching \\right",
    });
    expect(error("{\\left( x}")).toMatchObject({ code: "unmatchedLeft", from: 1, to: 6 });
    expect(error("x \\right)")).toEqual({
      code: "unmatchedRight",
      detail: "\\right",
      from: 2,
      to: 8,
      message: "\\right without matching \\left",
    });
    expect(error("{x \\right)}")).toMatchObject({ code: "unmatchedRight", from: 3, to: 9 });
    expect(error("a \\middle| b")).toMatchObject({
      code: "unmatchedRight",
      detail: "\\middle",
      from: 2,
      to: 9,
    });
  });

  it("reports an unknown delimiter", () => {
    expect(error("\\left a \\right)")).toEqual({
      code: "badDelimiter",
      detail: "a",
      from: 6,
      to: 7,
      message: 'Invalid delimiter "a"',
    });
    expect(error("\\left( x \\right\\alpha")).toMatchObject({
      code: "badDelimiter",
      detail: "\\alpha",
      from: 15,
      to: 21,
    });
  });

  it("reports double scripts at the second script", () => {
    expect(error("x^2^3")).toEqual({
      code: "doubleScript",
      detail: "^",
      from: 3,
      to: 4,
      message: "Double superscript",
    });
    expect(error("x_1_2")).toMatchObject({ code: "doubleScript", detail: "_", from: 3, to: 4 });
    expect(error("x_1_2").message).toBe("Double subscript");
    expect(error("x^2'")).toMatchObject({ code: "doubleScript", detail: "^", from: 3, to: 4 });
    expect(error("x^^")).toMatchObject({ code: "missingArgument", detail: "^" });
  });

  it("rejects input longer than 2000 characters", () => {
    expect(parseTex("a".repeat(2000)).ok).toBe(true);
    expect(error("a".repeat(2001))).toEqual({
      code: "tooLong",
      detail: "2000",
      from: 2000,
      to: 2001,
      message: "Formula is longer than 2000 characters",
    });
  });

  it("rejects nesting deeper than 64 levels at the offending token", () => {
    expect(parseTex(`${"{".repeat(64)}x${"}".repeat(64)}`).ok).toBe(true);
    expect(error(`${"{".repeat(65)}x${"}".repeat(65)}`)).toEqual({
      code: "tooDeep",
      detail: "64",
      from: 64,
      to: 65,
      message: "Formula is nested deeper than 64 levels",
    });
  });
});

describe("parseTex limits stay fast and stack-safe", () => {
  const hostile = [
    "{".repeat(10000),
    "^{".repeat(1000),
    "x^{".repeat(666),
    "\\sqrt".repeat(400),
    "\\frac".repeat(400),
    "\\left(".repeat(333),
    "\\sqrt[".repeat(333),
    "\\mathbf".repeat(250),
    "\\hat".repeat(500),
  ];

  for (const tex of hostile) {
    it(`fails cleanly on ${tex.slice(0, 12)}… (${tex.length} chars)`, () => {
      const started = performance.now();
      const result = parseTex(tex);
      expect(performance.now() - started).toBeLessThan(200);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(["tooDeep", "tooLong"]).toContain(result.error.code);
    });
  }

  it("parses a long flat formula quickly", () => {
    const tex = "x_i^2 + \\frac{a}{b} - ".repeat(80);
    const started = performance.now();
    expect(parseTex(tex.slice(0, 2000)).ok).toBeDefined();
    expect(performance.now() - started).toBeLessThan(200);
  });
});
