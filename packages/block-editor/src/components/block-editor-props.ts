import type { GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import type { BlockSlot, BlockViews, MediaOptions } from "@gotipe/react";
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
  /** Group order and labels of the slash menu (see `SlashMenu`'s `groups`). */
  slashGroups?: { id: string; label: string }[];
  /** Show a slash command's `description` under its name. Default: false. */
  slashDescriptions?: boolean;
  /** A slash menu row's icon (see `SlashMenu`'s `renderIcon`). */
  slashRenderIcon?: (command: SlashCommandDef) => React.ReactNode;
  /** The right-hand side of a slash menu row (see `SlashMenu`'s `renderMeta`). */
  slashRenderMeta?: (command: SlashCommandDef) => React.ReactNode;
  /**
   * The view's sizes for a narrow container (≤ 640 px). Default true; `false` keeps the wide
   * sizes, or the host's own, at any width (`data-gt-narrow="off"` on the editor).
   */
  narrow?: boolean;
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
   * A host's element in the flow of the document after the top-level block that is or holds
   * `blockId` (`.gotipe-block-slot`): the text below moves down for it. Not part of the text or
   * the file; its keys and input stay the host's (the editor and its menus take none of them, the
   * keys go on to the host's listeners on `document` and `window`). None when null or when no
   * block has that id (ids can change when the document is replaced: the element is drawn anew
   * then).
   */
  afterBlock?: BlockSlot | null;
  /**
   * What empty image and file blocks offer and how they fail, e.g. `{ links: false }` under a CSP
   * that blocks images from the web, or `{ inlineErrors: false }` when the host shows failures
   * itself (`host.onError`). Default: links and the reasons in the block, both on.
   */
  media?: MediaOptions;
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
