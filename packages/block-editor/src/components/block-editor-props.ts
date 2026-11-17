import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import type { BlockViews } from "@gotipe/react";
import type { ThemePreset } from "@gotipe/theme";
import type React from "react";
import type { EmojiOptions, MentionOptions } from "../atoms/host";
import type { CodeHighlighter } from "../highlight/types";
import type { StatusLineOptions } from "../text/status-line";
import type { RemotePeer } from "./collaboration-cursors";
import type { ToolbarSuggestion } from "./suggestion-toolbar";

export interface BlockEditorProps {
  editor: GoTipeEditor | null;
  className?: string;
  style?: React.CSSProperties;
  /**
   * The view drawn in the GoTipe Atlas: `notion` (default), `docs`, `modern` or `minimal`.
   * A view is a set of `--gt-*` tokens over the same markup (`data-gt-view` on the root).
   */
  view?: ThemePreset;
  /** The page's head above the document, e.g. `<PageHead>` (icon, title, byline). */
  header?: React.ReactNode;
  /** Quick blocks under an empty page. Default: on for a page with a `header` in notion and docs. */
  starters?: boolean;
  /** Optional code highlighter, e.g. Shiki with `gotipeCodeTheme` from `@gotipe/block-editor/shiki`. */
  highlight?: CodeHighlighter;
  showSlashMenu?: boolean;
  showBlockToolbar?: boolean;
  showBubbleMenu?: boolean;
  /**
   * Other people's carets and selections, from `remotePeers` and the editor's `collaboration`
   * decoration layer. Default: `true`; `false` draws nobody.
   */
  showCollaborationCursors?: boolean;
  /**
   * Other people to draw besides those of the editor's `collaboration` decoration layer,
   * which the collaboration provider fills. Each peer ID is drawn once.
   */
  remotePeers?: RemotePeer[];
  /**
   * The AI controls: Improve in the bubble, the ⌘J command bar, ghost text and the status line.
   * Default: on, and each shows only when an extension of `@gotipe/ai` answers it — without
   * `defineAi` none of them appears. `false` hides them all.
   */
  showAiCommandBar?: boolean;
  showThemeToggle?: boolean;
  suggestions?: ToolbarSuggestion[];
  onAiCommand?: (prompt: string) => void;
  onSuggestionAccept?: (suggestion: ToolbarSuggestion) => void;
  onSuggestionReject?: (suggestion: ToolbarSuggestion) => void;
  onSuggestionAcceptAll?: () => void;
  onSuggestionRejectAll?: () => void;
  /**
   * Block views that take the place of the editor's own for their types, e.g. a Markdown
   * session's raw blocks or a host's own embed. They win over the shared views.
   */
  blockViews?: BlockViews;
  /** Commands of the slash menu. Default: the editor's own (`editor.getSlashCommands()`). */
  slashCommands?: SlashCommandDef[];
  /**
   * People and pages of the “@” list (GoTipe Atlas, frame 22), e.g.
   * `{ items: (query) => directory.search(query) }`. The editor needs `atomExtensions()`.
   */
  mentions?: MentionOptions;
  /** The team's own emoji and the recent list of the “:” list and the emoji picker (frame 23). */
  emoji?: EmojiOptions;
  /**
   * The accessible name of the document. By default `a11y.editorLabel` of the interface
   * language: "Document content" in English, “Содержимое документа” in Russian.
   */
  ariaLabel?: string;
  /**
   * Show the editor's errors as a toast at the top (GoTipe Atlas, frame 17). Default: on. Turn it
   * off when the host shows them itself (`host.onError`).
   */
  errorToast?: boolean;
  /**
   * The find and replace bar (Atlas frame 25): `Mod+F`, or `Mod+Alt+F` with replace, while the
   * editor has focus. Default: on when the editor has the `FindReplace` extension.
   */
  find?: boolean;
  /**
   * The words and characters line under the document (Atlas frame 26), with an optional limit,
   * the warning share and the reason shown past it. Needs `CharacterCount`. Default: off.
   */
  status?: boolean | StatusLineOptions;
  children?: React.ReactNode;
}
