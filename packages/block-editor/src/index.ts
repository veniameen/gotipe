export { BlockEditor } from "./components/block-editor";
export type { BlockEditorProps } from "./components/block-editor";
export { SlashMenu } from "./components/slash-menu";
export type { SlashMenuProps } from "./components/slash-menu";
export { BlockToolbar } from "./components/block-toolbar";
export type { BlockToolbarProps } from "./components/block-toolbar";
export { DragHandle } from "./components/drag-handle";
export {
  COLLABORATION_LAYER,
  CollaborationCursors,
  peersFromDecorations,
} from "./components/collaboration-cursors";
export type { CollaborationCursorsProps, RemotePeer } from "./components/collaboration-cursors";
export { CommentSidebar } from "./components/comment-sidebar";
export type { CommentSidebarProps, CommentData, ReplyData } from "./components/comment-sidebar";
export { BlockEditorBubbleMenu } from "./components/bubble-menu";
export type { BlockEditorBubbleMenuProps } from "./components/bubble-menu";
export { BlockTypeDropdown } from "./components/block-type-dropdown";
export type { BlockTypeDropdownProps } from "./components/block-type-dropdown";
export { TextColorPicker } from "./components/text-color-picker";
export type { TextColorPickerProps } from "./components/text-color-picker";
export { BlockContextMenu } from "./components/block-context-menu";
export type { BlockContextMenuProps } from "./components/block-context-menu";
export { AiCommandBar } from "./components/ai-command-bar";
export type { AiCommandBarProps } from "./components/ai-command-bar";
export { SuggestionToolbar } from "./components/suggestion-toolbar";
export type { SuggestionToolbarProps, Suggestion } from "./components/suggestion-toolbar";
export { AiStatusIndicator } from "./components/ai-status-indicator";
export type { AiStatusIndicatorProps } from "./components/ai-status-indicator";
export { GhostText } from "./components/ghost-text";
export type { GhostTextProps } from "./components/ghost-text";
export { ThemeToggle } from "./components/theme-toggle";
export { PageHead } from "./components/page-head";
export type { PageHeadProps } from "./components/page-head";
export { EditorSkeleton, EditorErrorToast, EditorStarters } from "./components/editor-states";
// Inline atoms: mentions, emoji, formulas (Atlas frames 22–24)
export {
  atomExtensions,
  EmojiCommand,
  InlineMathCommands,
  EmojiSuggestion,
  MentionSuggestion,
  insertEmoji,
} from "./atoms/extensions";
export type { EmojiChoice } from "./atoms/extensions";
export { AtomProvider, AtomUI } from "./atoms/atom-ui";
export type { AtomUIProps } from "./atoms/atom-ui";
export { EmojiPicker } from "./atoms/emoji-picker";
export { MathPopover } from "./atoms/math-popover";
export { EmojiMenu, MentionMenu } from "./atoms/suggestion-menus";
export { requestAtomUI } from "./atoms/host";
export type {
  AtomRequest,
  CustomEmojiItem,
  EmojiOptions,
  MentionItem,
  MentionOptions,
} from "./atoms/host";
// Block views
export { ParagraphView } from "./views/paragraph-view";
export { HeadingView } from "./views/heading-view";
export { CodeBlockView } from "./views/code-block-view";
export { HighlightedLines } from "./views/highlighted-lines";
export { useHighlightedCode } from "./highlight/use-highlighted-code";
export type { CodeHighlighter, HighlightToken } from "./highlight/types";
export { ImageView } from "./views/image-view";
export { TableView } from "./views/table-view";
export { CalloutView } from "./views/callout-view";
export { ToggleView } from "./views/toggle-view";
export { DividerView } from "./views/divider-view";
// Markdown page editor on the shared views (Markdown in/out, model suggestions)
export {
  PageEditor,
  pageExtensions,
  MarkdownRawExtension,
  MarkdownRawMark,
} from "./page/page-editor";
export type { PageEditorProps, PageEditorHandle } from "./page/page-editor";
export { pageBlockCommands, pageSlashGroups, insertPageBlock } from "./page/page-commands";
export type { PageBlockCommand, PageBlockKind } from "./page/page-commands";
export { createPageBlockViews } from "./page/page-views";
export type { PageTitleLevel } from "./page/page-views";
export { PageIcon } from "./page/icons";
export type { PageIconName } from "./page/icons";
export { MarkdownSession } from "./page/markdown-session";
export type { SerializedPage } from "./page/markdown-session";
export {
  columnTypeOf,
  setColumnType,
  addRow,
  insertRow,
  deleteRow,
  addColumn,
  deleteColumn,
} from "./table/column-types";
export type { ColumnType } from "./table/column-types";
export { TableColumnButton, TableRowButton } from "./components/table-column-menu";
export { ReviewLayer, acceptAllInOrder } from "./review/review-layer";
export type { PageReviewProps, ReviewApi, ReviewAction, ReviewResult } from "./review/review-layer";
export { ReviewBar, LaneAvatars } from "./review/review-bar";
// Version history panel (Atlas frame 30)
export { VersionHistory } from "./history/version-history";
export type {
  RestoreContext,
  VersionHistoryProps,
  VersionHistorySource,
} from "./history/version-history";
export type { HistoryVersion } from "./history/history-model";
// Find, counter, alignment, font, invisibles (Atlas frames 25–28)
export { FindBar } from "./text/find-bar";
export type { FindBarProps } from "./text/find-bar";
export { FIND_KEYS } from "./text/find-keys";
export { StatusLine } from "./text/status-line";
export type { StatusLineOptions } from "./text/status-line";
export { AlignPicker } from "./text/align";
export { FontFamilyPicker, FontSizeStepper } from "./text/font";
export type { FontSizeStepperProps } from "./text/font";
export { InvisiblesToggle } from "./text/invisibles";
export { OVER_LIMIT_LAYER } from "./text/over-limit";
// The block editor's own interface strings (English and Russian) and their layering
export {
  BlockEditorStrings,
  blockEditorEn,
  blockEditorRu,
  useBlockEditorI18n,
  withBlockEditorStrings,
} from "./i18n";
export type { BlockEditorLocale } from "./i18n";
