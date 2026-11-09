import type { BlockView, GoTipeEditor } from "@gotipe/core";
import {
  type BlockViewProps,
  type BlockViews,
  saveAssetWithHost,
  useGoTipeI18n,
  useResolvedAsset,
} from "@gotipe/react";
import type React from "react";
import { useCallback, useState } from "react";
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

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

const IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";

/** Uploads an image/file through the host and sets the block attrs. */
async function uploadInto(
  editor: GoTipeEditor,
  blockId: string,
  file: File,
  kind: "image" | "file",
) {
  const saved = await saveAssetWithHost(editor, file, kind);
  if (!saved) return;
  if (kind === "image") {
    editor
      .chain()
      .setBlockAttrs(blockId, { src: saved.src, alt: saved.name.replace(/\.[^.]+$/, "") })
      .run();
  } else {
    editor.chain().setBlockAttrs(blockId, { url: saved.src, name: saved.name }).run();
  }
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

// ---------------------------------------------------------------- image

function ImagePageView({ block, editor, rootProps, readOnly, phantom }: BlockViewProps) {
  const i18n = useGoTipeI18n();
  const src = String(block.attrs.src ?? "");
  const alt = String(block.attrs.alt ?? "");
  const caption = String(block.attrs.caption ?? "");
  const { url } = useResolvedAsset(editor, src);
  const [dragOver, setDragOver] = useState(false);

  const choose = useCallback(async () => {
    if (readOnly || phantom) return;
    const file = await pickFile(IMAGE_TYPES);
    if (file) await uploadInto(editor, block.id, file, "image");
  }, [editor, block.id, readOnly, phantom]);

  if (!src) {
    return (
      <div
        {...(rootProps as React.HTMLAttributes<HTMLDivElement>)}
        data-block-type="image"
        className={cx(
          rootProps.className,
          "gotipe-page-media gotipe-page-image-empty",
          dragOver && "is-drag",
        )}
        contentEditable={false}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void choose()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void choose();
          }
        }}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file && !readOnly) void uploadInto(editor, block.id, file, "image");
        }}
        role="button"
        tabIndex={readOnly ? -1 : 0}
        aria-label={i18n.t("block.image")}
      >
        <PageIcon name="image" />
        <span className="gotipe-page-media-label">{i18n.t("block.image")}</span>
      </div>
    );
  }

  return (
    <figure
      {...(rootProps as React.HTMLAttributes<HTMLElement>)}
      data-block-type="image"
      className={cx(rootProps.className, "gotipe-page-image")}
      contentEditable={false}
    >
      {url ? (
        <img src={url} alt={alt} draggable={false} />
      ) : (
        <div className="gotipe-page-image-missing" aria-label={alt || src}>
          <PageIcon name="image" />
        </div>
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

// ---------------------------------------------------------------- file

function formatSize(bytes: unknown): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilePageView({ block, editor, rootProps, readOnly, phantom }: BlockViewProps) {
  const i18n = useGoTipeI18n();
  const url = String(block.attrs.url ?? "");
  const name = String(block.attrs.name ?? "") || url.split("/").pop() || "";
  const size = formatSize(block.attrs.size);

  const activate = useCallback(async () => {
    if (phantom) return;
    if (url) {
      editor.openLink(url, { blockId: block.id, newTab: true });
      return;
    }
    if (readOnly) return;
    const file = await pickFile("");
    if (file) await uploadInto(editor, block.id, file, "file");
  }, [editor, block.id, url, readOnly, phantom]);

  return (
    <div
      {...(rootProps as React.HTMLAttributes<HTMLDivElement>)}
      data-block-type="file"
      className={cx(rootProps.className, "gotipe-page-file", !url && "gotipe-page-file-empty")}
      contentEditable={false}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => void activate()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void activate();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={name || i18n.t("block.file")}
      title={url || undefined}
    >
      <PageIcon name="file" />
      <span className="gotipe-page-file-name">{name || i18n.t("block.file")}</span>
      {size ? <span className="gotipe-page-file-meta">{size}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------- code

function makeCodeView(highlight: CodeHighlighter | undefined) {
  return function CodePageView({ block, rootProps }: BlockViewProps) {
    const i18n = useGoTipeI18n();
    const code = typeof block.content === "string" ? block.content : "";
    const language = String(block.attrs.language ?? "");
    const tokens = useHighlightedCode(highlight, code, language);
    return (
      <div
        {...(rootProps as React.HTMLAttributes<HTMLDivElement>)}
        data-block-type="codeBlock"
        className={cx(rootProps.className, "gotipe-code-block gotipe-page-code")}
        spellCheck={false}
        aria-label={language ? `${i18n.t("slash.code")}, ${language}` : i18n.t("slash.code")}
      >
        {language ? (
          <span className="gotipe-page-code-lang" contentEditable={false} data-gotipe-widget="">
            {language}
          </span>
        ) : null}
        <pre>
          <code>
            {tokens ? (
              <HighlightedLines lines={tokens} />
            ) : (
              code || <br data-gotipe-trailing-break="" />
            )}
          </code>
        </pre>
      </div>
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
          if (readOnly || phantom) return;
          editor.chain().setBlockAttrs(block.id, { checked: !checked }).run();
        }}
        onChange={() => {}}
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
    </li>
  );
}

/** Block views of the page editor (v6 look). */
export function createPageBlockViews(options: { highlight?: CodeHighlighter } = {}): BlockViews {
  return {
    heading: HeadingView,
    callout: CalloutView,
    image: ImagePageView,
    file: FilePageView,
    codeBlock: makeCodeView(options.highlight),
    markdownRaw: MarkdownRawView,
    tableHeader: CellView,
    tableCell: CellView,
    todoItem: TodoItemView,
  };
}

export { pickFile, IMAGE_TYPES, uploadInto, textOf };
