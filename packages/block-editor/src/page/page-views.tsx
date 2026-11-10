import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { CodeBlock as CodeBlockUI } from "@gotipe/react";
import {
  type BlockViewProps,
  type BlockViews,
  FileBlock,
  ImageBlock,
  TableColumnResizeHandle,
  useGoTipeI18n,
} from "@gotipe/react";
import type React from "react";
import type { CodeHighlighter } from "../highlight/types";
import { useHighlightedCode } from "../highlight/use-highlighted-code";
import { HighlightedLines } from "../views/highlighted-lines";
import { PageIcon } from "./icons";
import { TableColumnButton } from "./table-column-menu";

function cx(...names: unknown[]): string | undefined {
  const out = names.filter((n): n is string => typeof n === "string" && n.length > 0).join(" ");
  return out || undefined;
}

function textOf(block: BlockView): string {
  if (Array.isArray(block.content)) return block.content.map((s) => s.text).join("");
  if (typeof block.content === "string") return block.content;
  return "";
}

// ---------------------------------------------------------------- title & headings

function HeadingView({ block, editor, rootProps, content, isSelected, readOnly }: BlockViewProps) {
  const i18n = useGoTipeI18n();
  const level = Math.min(Math.max(Number(block.attrs.level) || 1, 1), 6);
  const Tag = `h${level}` as "h1";
  const first = editor.getViewState().blocks[0];
  const isTitle = level === 1 && first?.id === block.id;
  const empty = textOf(block).length === 0;
  const placeholder =
    empty && !readOnly && (isTitle || isSelected)
      ? isTitle
        ? i18n.t("page.titlePlaceholder")
        : i18n.t("page.placeholder.heading")
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
}

// ---------------------------------------------------------------- callout & agent instructions

function CalloutView({ block, rootProps, content, isSelected, readOnly }: BlockViewProps) {
  const i18n = useGoTipeI18n();
  const variant = String(block.attrs.type || "note");
  const isAgent = variant === "agent";
  const empty = textOf(block).length === 0;
  return (
    <div
      {...(rootProps as React.HTMLAttributes<HTMLDivElement>)}
      data-block-type="callout"
      data-variant={variant}
      className={cx(
        rootProps.className,
        "gotipe-callout gotipe-page-callout",
        isAgent && "gotipe-page-callout-agent",
      )}
      role="note"
    >
      <span
        className="gotipe-callout-glyph"
        contentEditable={false}
        data-gotipe-widget=""
        aria-hidden="true"
      >
        <PageIcon
          name={
            isAgent
              ? "agent"
              : variant === "warning" || variant === "caution"
                ? "warning"
                : "callout"
          }
        />
      </span>
      <div className="gotipe-callout-body">
        {isAgent ? (
          <div className="gotipe-callout-label" contentEditable={false} data-gotipe-widget="">
            {i18n.t("block.agentInstructions")}
          </div>
        ) : null}
        <div
          className="gotipe-callout-content"
          data-placeholder={
            empty && isSelected && !readOnly ? i18n.t("page.placeholder.callout") : undefined
          }
        >
          {content}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- code

function makeCodeView(highlight: CodeHighlighter | undefined) {
  return function CodePageView({ block, editor, rootProps }: BlockViewProps) {
    const code = typeof block.content === "string" ? block.content : "";
    const language = String(block.attrs.language ?? "");
    const tokens = useHighlightedCode(highlight, code, language);
    return (
      <CodeBlockUI
        block={block}
        editor={editor}
        rootProps={{ ...rootProps, className: cx(rootProps.className, "gotipe-page-code") }}
      >
        {tokens ? <HighlightedLines lines={tokens} /> : undefined}
      </CodeBlockUI>
    );
  };
}

// ---------------------------------------------------------------- raw markdown (kept as is)

function MarkdownRawView({ block, rootProps }: BlockViewProps) {
  const i18n = useGoTipeI18n();
  const source = typeof block.content === "string" ? block.content : "";
  return (
    <div
      {...(rootProps as React.HTMLAttributes<HTMLDivElement>)}
      data-block-type="markdownRaw"
      data-kind={String(block.attrs.kind ?? "")}
      className={cx(rootProps.className, "gotipe-page-raw")}
      contentEditable={false}
      aria-label={i18n.t("block.markdown")}
    >
      <pre>{source}</pre>
    </div>
  );
}

// ---------------------------------------------------------------- table cells

type Align = "left" | "right" | "center" | null;

function cellPosition(
  editor: GoTipeEditor,
  cellId: string,
): { table: BlockView; column: number; row: number } | null {
  const visit = (blocks: BlockView[]): { table: BlockView; column: number; row: number } | null => {
    for (const b of blocks) {
      if (b.type === "table") {
        for (let r = 0; r < b.children.length; r++) {
          const c = b.children[r]!.children.findIndex((cell) => cell.id === cellId);
          if (c !== -1) return { table: b, column: c, row: r };
        }
      }
      if (b.children.length > 0 && b.type !== "table") {
        const inner = visit(b.children);
        if (inner) return inner;
      }
    }
    return null;
  };
  return visit(editor.getViewState().blocks);
}

function CellView({ block, editor, rootProps, content, readOnly, phantom }: BlockViewProps) {
  const pos = cellPosition(editor, block.id);
  const align = pos ? ((pos.table.attrs.align as Align[] | undefined)?.[pos.column] ?? null) : null;
  const isHeader = block.type === "tableHeader";
  const Tag = isHeader ? "th" : "td";
  const editable = !readOnly && !phantom;
  return (
    <Tag
      {...(rootProps as React.HTMLAttributes<HTMLTableCellElement>)}
      data-block-type={block.type}
      contentEditable={editable}
      suppressContentEditableWarning
      style={{
        ...((rootProps.style as React.CSSProperties | undefined) ?? {}),
        textAlign: align ?? undefined,
      }}
      data-align={align ?? undefined}
      className={cx(rootProps.className)}
    >
      {content}
      {editable && <TableColumnResizeHandle cellId={block.id} />}
      {isHeader && editable && pos ? (
        <TableColumnButton editor={editor} tableId={pos.table.id} column={pos.column} />
      ) : null}
    </Tag>
  );
}

// ---------------------------------------------------------------- todo item (checkbox follows read-only)

function TodoItemView({
  block,
  editor,
  rootProps,
  content,
  children,
  isSelected,
  readOnly,
  phantom,
}: BlockViewProps) {
  const i18n = useGoTipeI18n();
  const checked = !!block.attrs.checked;
  const empty = textOf(block).length === 0;
  return (
    <li
      {...(rootProps as React.HTMLAttributes<HTMLLIElement>)}
      data-block-type="todoItem"
      className={cx(rootProps.className, "gotipe-todo-item", checked && "is-checked")}
      data-checked={checked ? "" : undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={readOnly || phantom}
        contentEditable={false}
        aria-label={i18n.t("slash.todoList")}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onChange={(event) => {
          if (!readOnly && !phantom)
            editor.chain().setBlockAttrs(block.id, { checked: event.target.checked }).run();
        }}
      />
      <span
        className="gotipe-todo-item-content"
        data-gotipe-todo-content=""
        data-placeholder={
          empty && isSelected && !readOnly ? i18n.t("page.placeholder.todo") : undefined
        }
      >
        {content}
      </span>
      {children}
    </li>
  );
}

/** Block views of the page editor (v6 look). */
export function createPageBlockViews(options: { highlight?: CodeHighlighter } = {}): BlockViews {
  return {
    heading: HeadingView,
    callout: CalloutView,
    image: ({ block, editor, rootProps }) => (
      <ImageBlock
        block={block}
        editor={editor}
        rootProps={{ ...rootProps, className: cx(rootProps.className, "gotipe-page-image") }}
      />
    ),
    file: FileBlock,
    codeBlock: makeCodeView(options.highlight),
    markdownRaw: MarkdownRawView,
    tableHeader: CellView,
    tableCell: CellView,
    todoItem: TodoItemView,
  };
}

export { textOf };
