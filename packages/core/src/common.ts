// Everything @gotipe/core exports except `createEditor`, shared by the
// default entry (WASM with JS fallback) and `@gotipe/core/js` (JS only).
export { createEditorWithLoader, toSafeHref } from "./editor";
export type { GoTipeEditor, CreateEditorOptions, EditorHost, SetContentOptions } from "./editor";
export type { EngineMode, WasmModuleLoader, WasmModuleLike } from "./wasm-bridge";
export { WIDGET_ATTR, createTextWalker, documentTextOf, isInsideWidget } from "./dom/text-walker";
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
  DecorationSpec,
  InlineDecoration,
  WidgetDecoration,
  NodeDecoration,
  BlocksDecoration,
} from "./types/view";
export type { EditorEvents } from "./types/events";
export { ChainableCommands } from "./chain";
export { GoTipeError } from "./error";
export type { GoTipeErrorCode } from "./error";
