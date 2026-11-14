import type { BlockView } from "@gotipe/core";
import type { BlockViewProps, BlockViews } from "@gotipe/react";
import type React from "react";
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

/**
 * Headings of a Markdown page: the file's leading `# heading` is the page's title (GoTipe Atlas,
 * frame 19); an empty title shows the host's name for the file. Other headings are as anywhere.
 */
function headingView(titlePlaceholder: string | undefined) {
  return function PageHeadingView({ block, editor, rootProps, content, readOnly }: BlockViewProps) {
    const i18n = useBlockEditorI18n();
    const level = Math.min(Math.max(Number(block.attrs.level) || 1, 1), 6);
    const Tag = `h${level}` as "h1";
    const isTitle = level === 1 && editor.getViewState().blocks[0]?.id === block.id;
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
        {content}
      </Tag>
    );
  };
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

/**
 * Block views of a Markdown page on top of the shared ones: the title and the raw Markdown
 * blocks, and highlighted code when a highlighter is given.
 */
export function createPageBlockViews(
  options: { highlight?: CodeHighlighter; titlePlaceholder?: string } = {},
): BlockViews {
  return {
    heading: headingView(options.titlePlaceholder),
    markdownRaw: MarkdownRawView,
    ...(options.highlight ? { codeBlock: codeBlockViewFor(options.highlight) } : {}),
  };
}
