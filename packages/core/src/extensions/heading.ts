import { findBlockInTree } from "../document/tree";
import { givesWay } from "../input/block-rule";
import { type Extension, defineExtension } from "../types/extension";

export interface HeadingOptions {
  /** Levels the editor creates: input rules, shortcuts, the "/" menu and commands. */
  levels: number[];
}

const allowedLevels = (levels: readonly number[]): number[] =>
  [...new Set(levels)]
    .filter((level) => Number.isInteger(level) && level >= 1 && level <= 6)
    .sort((a, b) => a - b);

/**
 * `levels` limits what the editor creates. Documents may still hold other levels: content
 * you load or paste keeps them, and they render and export as before.
 */
function heading(options: HeadingOptions): Extension<HeadingOptions> {
  const levels = allowedLevels(options.levels);
  const marker = levels.map((level) => "#".repeat(level)).join("|");
  const extension = defineExtension<HeadingOptions>({
    name: "heading",
    options: { levels },
    nodes: [
      {
        name: "heading",
        group: ["block"],
        content: "richText",
        attrs: {
          // `values` keeps commands to the configured levels; validation accepts any number.
          level: { type: "number", default: levels[0] ?? 1, required: true, values: levels },
          // `TextAlign` sets it; any heading may hold it.
          align: { type: "enum", values: ["left", "center", "right", "justify"] },
          // `TextDirection` sets it.
          dir: { type: "enum", values: ["ltr", "rtl", "auto"] },
        },
        topLevel: true,
        marksAllowed: "all",
        leaf: false,
        allowsChildren: false,
      },
    ],
    inputRules: levels.length
      ? [
          {
            pattern: new RegExp(`^(${marker})\\s$`),
            handler: (editor, match) => {
              const { selection, blocks } = editor.getViewState();
              const blockId = selection.anchor.blockId;
              const level = match[1]!.length;
              // The typed block keeps its alignment and direction as a heading.
              const typed = findBlockInTree(blocks, blockId)?.attrs ?? {};
              const attrs: Record<string, string | number> = { level };
              for (const key of ["align", "dir"]) {
                const value = typed[key];
                if (typeof value === "string") attrs[key] = value;
              }
              return givesWay(() =>
                editor.dispatch({
                  steps: [
                    { type: "deleteText", blockId, from: 0, to: match[0].length },
                    { type: "setBlockType", blockId, newType: "heading", attrs },
                  ],
                }),
              );
            },
          },
        ]
      : [],
    slashCommands: levels
      .filter((level) => level <= 3)
      .map((level) => ({
        name: `Heading ${level}`,
        aliases: [`h${level}`, `heading${level}`],
        description: `${["Large", "Medium", "Small"][level - 1]} section heading`,
        icon: `heading-${level}`,
        group: "style" as const,
        execute: (editor) => editor.chain().setBlockType("heading", { level }).run(),
      })),
    keybindings: levels.map((level) => ({
      key: `mod-alt-${level}`,
      command: (editor) => editor.chain().setBlockType("heading", { level }).run(),
    })),
  });
  return { ...extension, configure: (next) => heading({ ...options, ...next }) };
}

export const Heading = heading({ levels: [1, 2, 3, 4, 5, 6] });
