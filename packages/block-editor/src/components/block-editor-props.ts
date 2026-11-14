import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import type { BlockViews } from "@gotipe/react";
import type { ThemePreset } from "@gotipe/theme";
import type React from "react";
import type { CodeHighlighter } from "../highlight/types";
import type { RemotePeer } from "./collaboration-cursors";
import type { Suggestion } from "./suggestion-toolbar";

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
  showCollaborationCursors?: boolean;
  /**
   * Other people to draw besides those of the editor's `collaboration` decoration layer,
   * which the collaboration provider fills. Each peer ID is drawn once.
   */
  remotePeers?: RemotePeer[];
  showAiCommandBar?: boolean;
  showThemeToggle?: boolean;
  suggestions?: Suggestion[];
  onAiCommand?: (prompt: string) => void;
  onSuggestionAccept?: (suggestion: Suggestion) => void;
  onSuggestionReject?: (suggestion: Suggestion) => void;
  onSuggestionAcceptAll?: () => void;
  onSuggestionRejectAll?: () => void;
  /**
   * Block views that take the place of the editor's own for their types, e.g. a Markdown
   * session's raw blocks or a host's own embed. They win over the shared views.
   */
  blockViews?: BlockViews;
  /** Commands of the «/» menu. Default: the editor's own (`editor.getSlashCommands()`). */
  slashCommands?: SlashCommandDef[];
  /** The accessible name of the document. */
  ariaLabel?: string;
  /**
   * Show the editor's errors as a toast at the top (GoTipe Atlas, frame 17). Default: on. Turn it
   * off when the host shows them itself (`host.onError`).
   */
  errorToast?: boolean;
  children?: React.ReactNode;
}
