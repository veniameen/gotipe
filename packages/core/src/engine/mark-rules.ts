import type { FallbackMark } from "./types";

/**
 * How a mark joins the marks of a text span. `crates/gotipe-core/src/transform/marks.rs`
 * is the Rust engine's copy; both engines must produce the same spans.
 */

/**
 * The exclusive group of a mark type, or null. `atomic` lists the mark types the schema
 * declares atomic (docs/development/inline-atoms.md); without it there are none.
 */
export type MarkGroups = ((markType: string) => string | null) & {
  atomic?: ReadonlySet<string>;
};

export const NO_MARK_GROUPS: MarkGroups = () => null;

/** Exclusive groups and atomic marks declared by the wire schema; an empty name is no group. */
export function markGroups(
  schema: {
    marks: Record<string, { exclusive_group?: string | null; atomic?: boolean }>;
  } | null,
): MarkGroups {
  const groups = new Map<string, string>();
  const atomic = new Set<string>();
  for (const [name, spec] of Object.entries(schema?.marks ?? {})) {
    if (spec.exclusive_group) groups.set(name, spec.exclusive_group);
    if (spec.atomic === true) atomic.add(name);
  }
  if (!groups.size && !atomic.size) return NO_MARK_GROUPS;
  const rules: MarkGroups = (markType) => groups.get(markType) ?? null;
  if (atomic.size) rules.atomic = atomic;
  return rules;
}

const cloneMark = (mark: FallbackMark): FallbackMark => ({
  mark_type: mark.mark_type,
  attrs: structuredClone(mark.attrs ?? {}),
});

/**
 * Apply `mark` to the marks of one span. A mark of the same type is replaced in place, so the
 * new attributes win; other marks of its exclusive group are removed; otherwise it is appended.
 */
export function applyMark(
  marks: FallbackMark[],
  mark: FallbackMark,
  groups: MarkGroups,
): FallbackMark[] {
  const group = groups(mark.mark_type);
  const result: FallbackMark[] = [];
  let placed = false;
  for (const existing of marks) {
    if (existing.mark_type === mark.mark_type) {
      if (!placed) result.push(cloneMark(mark));
      placed = true;
    } else if (group === null || groups(existing.mark_type) !== group) result.push(existing);
  }
  if (!placed) result.push(cloneMark(mark));
  return result;
}

/** Marks of inserted text, applied in order: the last of a type or of an exclusive group wins. */
export function normalizeMarks(marks: FallbackMark[], groups: MarkGroups): FallbackMark[] {
  return marks.reduce<FallbackMark[]>((result, mark) => applyMark(result, mark, groups), []);
}

/** JSON equality without regard to key order, as Rust compares attribute maps. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => sameValue(item, b[index]))
    );
  }
  const left = Object.entries(a);
  const right = b as Record<string, unknown>;
  return (
    left.length === Object.keys(right).length &&
    left.every(
      ([key, value]) =>
        Object.prototype.hasOwnProperty.call(right, key) && sameValue(value, right[key]),
    )
  );
}
