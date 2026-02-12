export { createEditor } from "./editor";
export type { GoTipeEditor, CreateEditorOptions } from "./editor";
export { defineExtension } from "./types/extension";
export type {
  Extension,
  ExtensionConfig,
  NodeSpec,
  MarkSpec,
  AttrSpec,
  Keybinding,
  InputRule,
  PasteRule,
  SlashCommandDef,
  PluginFactory,
  Plugin,
  WhenCondition,
  ExtensionStorage,
} from "./types/extension";
export type {
  AttrValue,
  Mark,
  TextSpan,
  Block,
  BlockContent,
  Document,
} from "./types/block";
export type {
  EditorState,
  Transaction,
  Step,
  Selection,
  TransformError,
} from "./types/state";
export type {
  ViewState,
  BlockView,
  TextSpanView,
  MarkView,
  SelectionView,
  ToolbarState,
  Decoration,
} from "./types/view";
export type { EditorEvents } from "./types/events";
export { ChainableCommands } from "./chain";
export { GoTipeError } from "./error";
export type { GoTipeErrorCode } from "./error";
