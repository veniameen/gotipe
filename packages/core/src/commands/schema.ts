import { cloneAttributes } from "../document/attributes";
import type { AttrValue } from "../types/block";
import type { AttrSpec, MarkSpec, NodeSpec } from "../types/extension";

interface AssembledSchema {
  nodes: Record<string, Omit<NodeSpec, "name">>;
  marks: Record<string, Omit<MarkSpec, "name">>;
}

/** The schema questions commands ask; built once per editor from its assembled schema. */
export interface CommandSchema {
  /** Whether a `parentType` block takes a `childType` child. */
  allowsChild(parentType: string, childType: string): boolean;
  /** False when the block type declares that its text never carries this mark. */
  acceptsMark(nodeType: string, markType: string): boolean;
  /** The other marks of `markType`'s exclusive group. */
  exclusiveWith(markType: string): string[];
  /** A copy of `attrs` with the declared default of every attribute it leaves out. */
  withDefaults(
    kind: "node" | "mark",
    type: string,
    attrs?: Record<string, unknown>,
  ): Record<string, AttrValue>;
  /** False when a value lies outside the `values` a non-enum attribute declares. */
  acceptsAttrs(nodeType: string, attrs: Record<string, unknown>): boolean;
}

export function commandSchema(schema: AssembledSchema): CommandSchema {
  const specs = (kind: "node" | "mark", type: string): Record<string, AttrSpec> =>
    (kind === "node" ? schema.nodes[type] : schema.marks[type])?.attrs ?? {};
  const group = (markType: string) => schema.marks[markType]?.exclusiveGroup || null;
  return {
    allowsChild(parentType, childType) {
      const parent = schema.nodes[parentType];
      return (
        !parent ||
        (!parent.leaf &&
          parent.allowsChildren &&
          (!parent.childTypes || parent.childTypes.includes(childType)))
      );
    },
    acceptsMark(nodeType, markType) {
      const allowed = schema.nodes[nodeType]?.marksAllowed ?? "all";
      return allowed === "all" || (Array.isArray(allowed) && allowed.includes(markType));
    },
    exclusiveWith(markType) {
      const name = group(markType);
      if (!name) return [];
      return Object.keys(schema.marks).filter((type) => type !== markType && group(type) === name);
    },
    withDefaults(kind, type, attrs = {}) {
      const result = cloneAttributes(attrs);
      for (const [name, spec] of Object.entries(specs(kind, type)))
        if (!(name in result) && spec.default !== undefined && spec.default !== null)
          result[name] = cloneAttributes({ value: spec.default }).value!;
      return result;
    },
    acceptsAttrs(nodeType, attrs) {
      const declared = specs("node", nodeType);
      return Object.entries(attrs).every(([name, value]) => {
        const spec = declared[name];
        if (!spec?.values || spec.type === "enum" || value === null) return true;
        return (spec.values as unknown[]).includes(value);
      });
    },
  };
}

/** A chain without an editor schema: anything goes and nothing is filled in. */
export const SCHEMA_FREE: CommandSchema = commandSchema({ nodes: {}, marks: {} });

/** The earlier second argument of `ChainableCommands`: only which children a parent takes. */
export type AllowsChild = (parentType: string, childType: string) => boolean;

export function chainSchema(schema?: CommandSchema | AllowsChild): CommandSchema {
  return typeof schema === "function"
    ? { ...SCHEMA_FREE, allowsChild: schema }
    : (schema ?? SCHEMA_FREE);
}
