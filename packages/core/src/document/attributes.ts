import { GoTipeError } from "../error";
import type { AttrValue } from "../types/block";

/** Preserve JSON-valued extension attributes while rejecting nonserializable data. */
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
          Object.entries(value).map(([key, entry]) => [key, copy(entry, depth + 1)]),
        );
    visiting.delete(value);
    return result;
  };
  return Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, copy(value, 0)]));
}
