import { describe, expect, it } from "vitest";
import {
  DOCUMENT_HIGHLIGHT_COLORS,
  DOCUMENT_TEXT_COLORS,
  documentColorStyle,
} from "../src/document-colors";

describe("document colors", () => {
  it("renders a palette value through its theme token with the stored value as fallback", () => {
    expect(documentColorStyle("#2c62d4")).toBe("var(--gt-tc-blue, #2c62d4)");
    expect(documentColorStyle("#FBF0CE")).toBe("var(--gt-bg-yellow, #FBF0CE)");
  });

  it("follows the earlier palette's equivalents and keeps any other safe colour", () => {
    expect(documentColorStyle("#1d4ed8")).toBe("var(--gt-tc-blue, #1d4ed8)");
    expect(documentColorStyle("#f3e8ff")).toBe("#f3e8ff");
    expect(documentColorStyle("rgb(10 20 30 / 0.5)")).toBe("rgb(10 20 30 / 0.5)");
  });

  it("drops unsafe input", () => {
    expect(documentColorStyle("var(--gt-text)")).toBeNull();
    expect(documentColorStyle("red; background: url(x)")).toBeNull();
    expect(documentColorStyle(42)).toBeNull();
  });

  it("stores distinct light values and names per palette", () => {
    for (const palette of [DOCUMENT_TEXT_COLORS, DOCUMENT_HIGHLIGHT_COLORS]) {
      expect(new Set(palette.map((color) => color.value)).size).toBe(palette.length);
      expect(new Set(palette.map((color) => color.name)).size).toBe(palette.length);
    }
  });
});
