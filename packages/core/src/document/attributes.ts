import { GoTipeError } from "../error";
import type { AttrValue } from "../types/block";

/** Code point order, as Rust compares strings: UTF-16 units put U+10000 and above too early. */
function byCodePoint([a]: [string, unknown], [b]: [string, unknown]): number {
  for (let i = 0; ; i++) {
    const x = a.codePointAt(i) ?? -1;
    const y = b.codePointAt(i) ?? -1;
    if (x !== y || x < 0) return x - y;
  }
}

/**
 * Preserve JSON-valued extension attributes while rejecting nonserializable data. Object keys
 * come out sorted at every level, as the Rust engine writes them (D-82, D-175): one document is
 * one JSON string on both engines.
 */
export function cloneAttributes(attrs: Record<string, unknown>): Record<string, AttrValue> {
  const visiting = new Set<object>();
  const copy = (value: unknown, depth: number): AttrValue => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "object" || !value || depth > 64 || visiting.has(value))
      throw new GoTipeError(
        "TRANSFORM_ERROR",
        "Attributes must contain finite JSON values without cycles",
      );
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new GoTipeError("TRANSFORM_ERROR", "Attributes must use plain JSON objects");
    visiting.add(value);
    const result: AttrValue = Array.isArray(value)
      ? value.map((entry) => copy(entry, depth + 1))
      : Object.fromEntries(
          Object.entries(value)
            .sort(byCodePoint)
            .map(([key, entry]) => [key, copy(entry, depth + 1)]),
        );
    visiting.delete(value);
    return result;
  };
  return Object.fromEntries(
    Object.entries(attrs)
      .sort(byCodePoint)
      .map(([key, value]) => [key, copy(value, 0)]),
  );
}
