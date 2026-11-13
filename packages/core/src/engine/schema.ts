import type { AttrSpec, MarkSpec, NodeSpec } from "../types/extension";

interface PublicSchema {
  nodes: Record<string, Omit<NodeSpec, "name">>;
  marks: Record<string, Omit<MarkSpec, "name">>;
}

function attributes(specs: Record<string, AttrSpec>) {
  return Object.fromEntries(
    Object.entries(specs).map(([name, spec]) => [
      name,
      {
        attr_type:
          spec.type === "enum"
            ? { Enum: (spec.values ?? []).map(String) }
            : {
                string: "String",
                number: "Number",
                bool: "Bool",
                array: "Array",
                object: "Object",
              }[spec.type],
        default: spec.default ?? null,
        required: spec.required ?? false,
      },
    ]),
  );
}

/** The Rust wire schema is explicit: serde enums and field names differ from the public API. */
export function toWasmSchema(schema: PublicSchema) {
  return {
    nodes: Object.fromEntries(
      Object.entries(schema.nodes).map(([name, node]) => [
        name,
        {
          name,
          group: node.group,
          content: { richText: "RichText", rawText: "RawText", empty: "Empty" }[node.content],
          attrs: attributes(node.attrs),
          top_level: node.topLevel,
          marks_allowed: Array.isArray(node.marksAllowed)
            ? { Only: node.marksAllowed }
            : node.marksAllowed === "all"
              ? "All"
              : "None",
          leaf: node.leaf,
          allows_children: node.allowsChildren,
          child_types: node.childTypes ?? null,
        },
      ]),
    ),
    marks: Object.fromEntries(
      Object.entries(schema.marks).map(([name, mark]) => [
        name,
        {
          name,
          exclusive_group: mark.exclusiveGroup ?? null,
          attrs: attributes(mark.attrs),
          rank: mark.rank,
        },
      ]),
    ),
  };
}
