// Everything @gotipe/core exports except `createEditor`, shared by the
// default entry (WASM with JS fallback) and `@gotipe/core/js` (JS only).
export { createEditorWithLoader, toSafeHref } from "./editor";
export type {
  GoTipeEditor,
  CreateEditorOptions,
  EditorHost,
  SetContentOptions,
  ImageSource,
  ImageSourceItem,
} from "./types/editor";
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
  TransactionContext,
  TransactionFilter,
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
export { decodeDocument } from "./document/decode";
export { saveAsset, encodeInlineAsset, INLINE_ASSET_LIMIT, IMAGE_MEDIA_TYPES } from "./assets";
export type { SavedAsset } from "./assets";
export type { GoTipeErrorCode } from "./error";
export { editTable } from "./tables";
export type { TableEdit } from "./tables";
export { copySelection } from "./clipboard/selection";
export type { ClipboardPayload } from "./clipboard/selection";

export { toSafeColor } from "./security/colors";
export {
  DOCUMENT_TEXT_COLORS,
  DOCUMENT_HIGHLIGHT_COLORS,
  documentColorStyle,
} from "./document-colors";
export type { DocumentColor } from "./document-colors";

export { blocksToHtml as serializeHtml } from "./serialization/html";
export type { HtmlSerializationOptions, HtmlBlock } from "./serialization/html";
