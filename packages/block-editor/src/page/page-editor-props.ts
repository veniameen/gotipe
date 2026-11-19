import type { EditorHost, GoTipeEditor, SlashCommandDef } from "@gotipe/core";
import type { I18n } from "@gotipe/i18n";
import type { BlockViews, MediaOptions } from "@gotipe/react";
import type { ThemePreset } from "@gotipe/theme";
import type React from "react";
import type { BlockEditorProps } from "../components/block-editor-props";
import type {
  PageReviewProps,
  ReviewApi,
  ReviewCardPlacement,
  ReviewLaneCursor,
  ReviewLayout,
} from "../review/review-layer";
import type { PageBlockKind } from "./page-commands";
import type { PageTitleLevel } from "./page-views";

export interface PageEditorHandle {
  readonly editor: GoTipeEditor | null;
  /** The current document as Markdown (untouched blocks byte-for-byte). */
  getMarkdown(): string;
  /**
   * Sends a draft not yet emitted to `onChange` right now (it is otherwise emitted on the next
   * frame) and returns the current Markdown. Call it before saving.
   */
  flush(): string;
  /**
   * Replaces the document with `text` as an external edit (focus, caret and scroll kept, the
   * change goes into undo), even when `text` equals the last value of `markdown`. A draft not yet
   * emitted is dropped: call `flush()` first to keep it. `onChange` is not called for `text`.
   * `addToHistory: false` clears the undo history instead (default: `undoableReplace`).
   */
  setMarkdown(text: string, options?: { addToHistory?: boolean }): void;
  focus(position?: "start" | "end"): void;
  /** Inserts a block at the caret (the toolbar's “blocks” and “image” buttons). */
  insertBlock(kind: PageBlockKind): void;
  /** The page title: text of the leading `# heading`, or null when the file has none. */
  getTitle(): string | null;
  /** Focuses the title and selects its text (“Rename”). */
  selectTitle(): void;
  /** Review actions (null without `review`). */
  readonly review: ReviewApi | null;
}

/** The commands and groups of the page's “/” menu. */
export interface PageSlashMenu {
  /**
   * Commands of the menu. A list replaces the page's own (its blocks and “Emoji”); a function
   * gets them and returns the list to show: reordered, filtered or with the host's commands.
   * A command's `group` places it in one of `groups`.
   */
  commands?: SlashCommandDef[] | ((defaults: SlashCommandDef[]) => SlashCommandDef[]);
  /**
   * Group order and labels; a group not listed is hidden. Default: the shared menu's AI, Style,
   * Insert and Upload (`pageSlashGroups` gives the page's three in its language); a command of a
   * group of the host's own needs it listed here.
   */
  groups?: { id: string; label: string }[];
  /** Show a command's `description` under its name. Default: false. */
  descriptions?: boolean;
  /** A row's icon, e.g. the host's own for its commands. Default: the built-in icons. */
  renderIcon?: (command: SlashCommandDef) => React.ReactNode;
  /** The right-hand side of a row. Default: the block's Markdown shortcut. */
  renderMeta?: (command: SlashCommandDef) => React.ReactNode;
}

export interface PageEditorProps {
  /** The file's text. A new value that differs from the last emitted draft replaces the document, keeping focus, caret and scroll. */
  markdown: string;
  /**
   * Whether replacing the document (a new `markdown`, `setMarkdown`) can be undone. Default true;
   * false clears the undo history instead, e.g. while the host shows an earlier version of the file.
   */
  undoableReplace?: boolean;
  /**
   * The draft changed: called once a frame after edits (debounce the save in the host); call
   * `flush()` on the handle to get a pending draft at once.
   */
  onChange?: (markdown: string) => void;
  readOnly?: boolean;
  /** Assets, links, errors. */
  host?: EditorHost;
  /** Locale of the UI strings (`en` by default, `ru` built in) or a ready `I18n`. */
  locale?: string;
  i18n?: I18n;
  /** Shown in the title when the file has no `# heading` (the file name). */
  titlePlaceholder?: string;
  /**
   * The HTML level of the page title, the file's leading `# heading` (default 1: an `h1`). It looks
   * the same at any level; pass 2 when the host page has its own `h1`. Other headings keep theirs.
   */
  titleLevel?: PageTitleLevel;
  /**
   * The page's glyph, shown above the title in the text column, as `PageHead`'s icon
   * (`.gotipe-page-head-icon`). Not part of the Markdown.
   */
  icon?: React.ReactNode;
  /**
   * Where `icon` stands: `"above"` the title (default, as `PageHead`), or `"inline"` in the
   * title's row before its text (`.gotipe-page-title-icon`, sizes `--gt-page-icon-inline`,
   * `--gt-page-icon-inline-gap`); inline, it stays accessible and its clicks and keys do not
   * reach the editor.
   */
  iconPlacement?: "above" | "inline";
  /** The host's own content above the title in the text column (after `icon`). */
  header?: React.ReactNode;
  /** Suggestions, comments and collaborator cursors supplied by the host. */
  review?: PageReviewProps;
  /**
   * Where review cards stand: `auto` (default) — in a column in the margin when the page is wide
   * enough (`--gt-card-w` + `--gt-margin-gap` + `--gt-margin-page-min`), otherwise one by the
   * text; `inline` — always by the text; `margin` — always in the margin column.
   */
  reviewLayout?: ReviewLayout;
  /**
   * Where a card by the text opens when there is no room beside it (a narrow page): `below` the
   * row (default; above it when the window has no room below), or `above` the row (below it when
   * there is no room above).
   */
  reviewCardPlacement?: ReviewCardPlacement;
  /**
   * How a lane's cursor looks: `caret` (default), a line with a flag that names the lane, or
   * `pointer`, an arrow pointer at the same place with the name below right of its tip
   * (`.gotipe-lane-cursor[data-variant="pointer"]`, sizes `--gt-lane-pointer-size`,
   * `--gt-lane-pointer-chip-x`, `--gt-lane-pointer-chip-y`), in the lane's colour.
   */
  reviewLaneCursor?: ReviewLaneCursor;
  /** Show the edit bar above the page. */
  reviewBar?: { title?: React.ReactNode; extra?: React.ReactNode[] } | false;
  /**
   * One of the shared views (GoTipe Atlas, frames 1–4 and 19): `notion` (default), `docs`,
   * `modern` or `minimal`. The page has no theme of its own.
   */
  view?: ThemePreset;
  /**
   * The view's sizes for a narrow container (≤ 640 px: smaller title, headings and page
   * margins). Default true; `false` keeps the wide sizes, or the host's own on
   * `.gotipe-page .gotipe-block-editor`, at any width (`data-gt-narrow="off"`).
   */
  narrow?: boolean;
  /** Optional code highlighter (`@gotipe/block-editor/shiki`). */
  highlight?: CodeHighlighter;
  /**
   * The host's own block views; they win over the page's and the shared ones. E.g. a quote that
   * starts with a bold label the host gives a look of its own.
   */
  blockViews?: BlockViews;
  /** Blocks offered by “/” (default: all). */
  blocks?: PageBlockKind[];
  /** The host's commands, groups and order of the “/” menu. */
  slashMenu?: PageSlashMenu;
  /**
   * The image and file placeholders: `links: false` hides “By link”, `inlineErrors: false` shows
   * no failure text in the block (the error still reaches `onError`). Both default to true.
   */
  media?: MediaOptions;
  autoFocus?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Called once the editor exists. */
  onReady?: (editor: GoTipeEditor) => void;
  /** Called when the editor reports an error and when it cannot be created (as `host.onError`). */
  onError?: EditorHost["onError"];
  /**
   * People and pages of the “@” list (Atlas frame 22), as `BlockEditor`'s `mentions`. Read when
   * the page opens: with it the page reads and writes `[@name](mention:user-id)` as mentions.
   */
  mentions?: BlockEditorProps["mentions"];
  /** The team's emoji and the recent list (Atlas frame 23), as `BlockEditor`'s `emoji`. */
  emoji?: BlockEditorProps["emoji"];
  /** Words and characters under the page (Atlas frame 26), as `BlockEditor`'s `status`. */
  status?: BlockEditorProps["status"];
}

type CodeHighlighter = NonNullable<BlockEditorProps["highlight"]>;
