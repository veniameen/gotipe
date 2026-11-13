import type { GoTipeEditor } from "./editor";
import type { EditorState, Transaction } from "./state";
import type { BlockView, Decoration } from "./view";

export interface NodeSpec {
  name: string;
  group: string[];
  content: "richText" | "rawText" | "empty";
  attrs: Record<string, AttrSpec>;
  topLevel: boolean;
  marksAllowed: "all" | "none" | string[];
  leaf: boolean;
  allowsChildren: boolean;
  childTypes?: string[];
}

export interface AttrSpec {
  type: "string" | "number" | "bool" | "enum" | "array" | "object";
  /**
   * `enum`: the values a document may hold. Any other type: the values commands create,
   * such as `Heading` levels; documents may hold others.
   */
  values?: string[] | number[];
  /** Commands write it into a new block or mark that leaves the attribute out. */
  default?: unknown;
  required?: boolean;
}

export interface MarkSpec {
  name: string;
  exclusiveGroup?: string;
  attrs: Record<string, AttrSpec>;
  rank: number;
}

export interface Keybinding {
  key: string;
  command: (editor: GoTipeEditor) => boolean | undefined;
  when?: WhenCondition;
}

export type WhenCondition = "inTable" | "inCodeBlock" | "inList" | "inBlockquote" | string;

export interface InputRule {
  pattern: RegExp;
  /** Return `false` when the rule does not apply after all; the next rule is tried. */
  // biome-ignore lint/suspicious/noConfusingVoidType: handlers written before `false` existed return void.
  handler: (editor: GoTipeEditor, match: RegExpMatchArray) => boolean | void;
}

export interface PasteRule {
  match: RegExp;
  handler: (editor: GoTipeEditor, data: File | string, options: unknown) => void | Promise<void>;
}

export interface SlashCommandDef {
  name: string;
  aliases: string[];
  description?: string;
  icon: string;
  /** Built-in groups or any custom group id (see the SlashMenu `groups` prop). */
  group: "ai" | "style" | "insert" | "upload" | (string & {});
  execute: (editor: GoTipeEditor) => void;
  shouldShow?: (editor: GoTipeEditor) => boolean;
}

export type PluginFactory = (options: unknown) => Plugin;

export interface Plugin {
  /** Called once after the document and initial selection exist. */
  init?(state: EditorState): void;
  apply?(tr: Transaction, state: EditorState): void;
  decorations?(state: EditorState): Decoration[];
  /** Releases resources when editor creation fails or the editor is destroyed. */
  destroy?(): void;
}

export interface BlockA11yConfig {
  role: string;
  label: string | ((block: BlockView) => string);
  description?: string | ((block: BlockView) => string);
  landmark?: boolean;
}

export interface ExtensionStorage {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

export interface ExtensionConfig<Options = unknown> {
  name: string;
  dependencies?: string[];
  nodes?: NodeSpec[];
  marks?: MarkSpec[];
  keybindings?: Keybinding[];
  inputRules?: InputRule[];
  pasteRules?: PasteRule[];
  slashCommands?: SlashCommandDef[];
  onCreate?: (editor: GoTipeEditor) => void;
  onUpdate?: (editor: GoTipeEditor) => void;
  onDestroy?: (editor: GoTipeEditor) => void;
  plugin?: PluginFactory;
  options?: Options;
  accessibility?: BlockA11yConfig;
  storageKey?: string;
}

export interface Extension<Options = unknown> extends ExtensionConfig<Options> {
  configure(options: Partial<Options>): Extension<Options>;
}

export function defineExtension<Options = unknown>(
  config: ExtensionConfig<Options>,
): Extension<Options> {
  return {
    ...config,
    configure(options: Partial<Options>) {
      return defineExtension({
        ...config,
        options: { ...config.options, ...options } as Options,
      });
    },
  };
}
