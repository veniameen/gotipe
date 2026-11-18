import type { BlockView, ViewState } from "@gotipe/core";
import {
  type BlockViewComponent,
  type BlockViewProps,
  type BlockViews,
  useEditorState,
} from "@gotipe/react";
import type React from "react";
import { createContext, useContext } from "react";
import { Tip } from "../components/formatting/tip";
import type { CodeHighlighter } from "../highlight/types";
import { useBlockEditorI18n } from "../i18n/strings";
import { codeBlockViewFor } from "../views/code-block-view";
import { PageIcon } from "./icons";

function cx(...names: unknown[]): string | undefined {
  const out = names.filter((n): n is string => typeof n === "string" && n.length > 0).join(" ");
  return out || undefined;
}

function textOf(block: BlockView): string {
  if (Array.isArray(block.content)) return block.content.map((s) => s.text).join("");
  if (typeof block.content === "string") return block.content;
  return "";
}

/** The HTML level of a page title: `h1`…`h6`. */
export type PageTitleLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** The id of the document's first block: a page title is a level-1 heading standing first. */
const firstBlockId = (state: ViewState): string | undefined => state.blocks[0]?.id;

/**
 * Headings of a Markdown page: the file's leading `# heading` is the page's title (GoTipe Atlas,
 * frame 19); an empty title shows the host's name for the file. Other headings are as anywhere.
 * The title is an `h${titleLevel}` that looks the same at any level: a host page with its own
 * `h1` passes 2 (D-84).
 */
/**
 * The page's glyph in the title's row (`iconPlacement="inline"`), drawn as a widget outside the
 * title's text: no offset, no Markdown, no caret. A context, not an argument of
 * the view: a new icon element on every render of the host must not make a new heading view,
 * which would draw every heading anew and lose the caret.
 */
export const PageTitleIconContext = createContext<React.ReactNode>(null);

function headingView(titlePlaceholder: string | undefined, titleLevel: PageTitleLevel) {
  const view: BlockViewComponent = function PageHeadingView({
    block,
    editor,
    rootProps,
    content,
    readOnly,
  }: BlockViewProps) {
    const i18n = useBlockEditorI18n();
    const titleIcon = useContext(PageTitleIconContext);
    const level = Math.min(Math.max(Number(block.attrs.level) || 1, 1), 6);
    // subscribed: the heading is drawn again when another block becomes the first
    const first = useEditorState(editor, firstBlockId);
    const isTitle = level === 1 && first === block.id;
    const Tag = `h${isTitle ? titleLevel : level}` as "h1";
    const empty = textOf(block).length === 0;
    const placeholder =
      empty && !readOnly
        ? isTitle
          ? (titlePlaceholder ?? i18n.t("page.titlePlaceholder"))
          : i18n.t("placeholder.heading", { level })
        : undefined;
    return (
      <Tag
        {...(rootProps as React.HTMLAttributes<HTMLHeadingElement>)}
        data-block-type="heading"
        className={cx(rootProps.className, isTitle && "gotipe-page-title")}
        data-placeholder={placeholder}
      >
        {isTitle && titleIcon ? (
          <span
            className="gotipe-page-title-icon"
            data-gotipe-widget=""
            contentEditable={false}
            aria-hidden="true"
          >
            {titleIcon}
          </span>
        ) : null}
        {content}
      </Tag>
    );
  };
  view.pure = true;
  return view;
}

/** Markdown the editor keeps as it is (HTML, footnotes, definitions): read-only, Atlas frame 17. */
function MarkdownRawView({ block, rootProps }: BlockViewProps) {
  const i18n = useBlockEditorI18n();
  const source = typeof block.content === "string" ? block.content : "";
  const kept = i18n.t("block.markdownKept");
  return (
    <div
      {...(rootProps as React.HTMLAttributes<HTMLDivElement>)}
      data-block-type="markdownRaw"
      data-kind={String(block.attrs.kind ?? "")}
      className={cx(rootProps.className, "gotipe-raw")}
      contentEditable={false}
      aria-label={i18n.t("block.markdown")}
    >
      <pre>{source}</pre>
      <button type="button" className="gotipe-raw-mark" aria-label={kept} tabIndex={-1}>
        <PageIcon name="lock" />
        <Tip label={kept} />
      </button>
    </div>
  );
}

MarkdownRawView.pure = true;

/**
 * Block views of a Markdown page on top of the shared ones: the title and the raw Markdown
 * blocks, and highlighted code when a highlighter is given.
 */
export function createPageBlockViews(
  options: {
    highlight?: CodeHighlighter;
    titlePlaceholder?: string;
    titleLevel?: PageTitleLevel;
  } = {},
): BlockViews {
  return {
    heading: headingView(options.titlePlaceholder, options.titleLevel ?? 1),
    markdownRaw: MarkdownRawView,
    ...(options.highlight ? { codeBlock: codeBlockViewFor(options.highlight) } : {}),
  };
}
