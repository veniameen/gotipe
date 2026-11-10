import { GoTipeError } from "../error";
import type { Extension, MarkSpec, NodeSpec } from "../types/extension";

export function resolveExtensions(extensions: (Extension | Extension[])[]): Extension[] {
  // Flatten nested arrays so presets (which are Extension[]) work with [DefaultPreset, MyExt]
  const flat: Extension[] = extensions.flat(Number.POSITIVE_INFINITY) as Extension[];

  const resolved: Extension[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const extMap = new Map<string, Extension>();

  for (const ext of flat) {
    extMap.set(ext.name, ext);
  }

  function visit(ext: Extension): void {
    if (visited.has(ext.name)) return;
    if (visiting.has(ext.name)) {
      throw new GoTipeError(
        "EXTENSION_DEPENDENCY_CYCLE",
        `Circular dependency detected: ${ext.name}`,
        { extension: ext.name },
      );
    }

    visiting.add(ext.name);

    if (ext.dependencies) {
      for (const depName of ext.dependencies) {
        const dep = extMap.get(depName);
        if (dep) visit(dep);
      }
    }

    visiting.delete(ext.name);
    visited.add(ext.name);
    resolved.push(ext);
  }

  for (const ext of extMap.values()) {
    visit(ext);
  }

  return resolved;
}

export function buildSchema(extensions: Extension[]): {
  nodes: Record<string, Omit<NodeSpec, "name">>;
  marks: Record<string, Omit<MarkSpec, "name">>;
} {
  const nodes: Record<string, Omit<NodeSpec, "name">> = {};
  const marks: Record<string, Omit<MarkSpec, "name">> = {};

  for (const ext of extensions) {
    if (ext.nodes) {
      for (const node of ext.nodes) {
        const { name, ...spec } = node;
        nodes[name] = {
          ...spec,
          attrs: {
            style: { type: "string" },
            marker: { type: "string" },
            delimiter: { type: "string" },
            spread: { type: "bool" },
            breaks: { type: "string" },
            ...spec.attrs,
          },
        };
      }
    }
    if (ext.marks) {
      for (const mark of ext.marks) {
        const { name, ...spec } = mark;
        marks[name] = spec;
      }
    }
  }

  return { nodes, marks };
}
