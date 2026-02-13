import type { BlockView, GoTipeEditor } from "@gotipe/core";
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BlockRendererProps } from "./block-renderer";
import { TextRenderer } from "./text-renderer";

function useViewState(editor: GoTipeEditor | null) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!editor) return () => {};
      return editor.on("viewStateChange", onStoreChange as never);
    },
    [editor],
  );

  const getSnapshot = useCallback(() => {
    if (!editor) return null;
    return editor.getViewState();
  }, [editor]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function BlockContent({ block }: { block: BlockView }) {
  if (block.content === null) return null;
  if (typeof block.content === "string") return <>{block.content}</>;
  if (Array.isArray(block.content)) {
    const hasVisibleText = block.content.some((span) => span.text.length > 0);
    if (hasVisibleText) {
      return <TextRenderer spans={block.content} />;
    }
    // Keep empty editable blocks caret-addressable in the DOM.
    return <br data-gotipe-trailing-break="" />;
  }
  return null;
}

function BlockChildren({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
  if (!block.children || block.children.length === 0) return null;
  return (
    <>
      {block.children.map((child) => (
        <BlockComponent key={child.id} block={child} editor={editor} />
      ))}
    </>
  );
}

/* ---- Image Block ---- */

function ImageBlock({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
  const src = block.attrs.src as string;
  const alt = (block.attrs.alt as string) || "";
  const width = block.attrs.width as number | undefined;
  const [dragOver, setDragOver] = useState(false);

  const triggerFilePicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        editor.chain().setBlockAttrs(block.id, { src: url, alt: file.name }).run();
      }
    };
    input.click();
  }, [editor, block.id]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        editor.chain().setBlockAttrs(block.id, { src: url, alt: file.name }).run();
      }
    },
    [editor, block.id],
  );

  return (
    <figure
      data-block-id={block.id}
      data-block-type={block.type}
      className="gotipe-image-block"
      contentEditable={false}
    >
      {src ? (
        <img src={src} alt={alt} width={width} style={width ? { maxWidth: "100%" } : undefined} />
      ) : (
        <div
          className={`gotipe-image-placeholder${dragOver ? " dragover" : ""}`}
          role="button"
          tabIndex={0}
          aria-label="Upload image — click or drag a file here"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            triggerFilePicker();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              triggerFilePicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          Click or drag an image here
        </div>
      )}
      {block.attrs.caption ? (
        <figcaption>{String(block.attrs.caption)}</figcaption>
      ) : null}
    </figure>
  );
}

/* ---- Toggle Block ---- */

function ToggleBlock({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
  const content = <BlockContent block={block} />;
  const children = <BlockChildren block={block} editor={editor} />;
  const isOpen = !!block.attrs.open;

  return (
    <details
      data-block-id={block.id}
      data-block-type={block.type}
      className="gotipe-toggle"
      open={isOpen}
    >
      <summary
        onMouseDown={(e) => {
          // Only handle clicks on the summary marker area (not the text content)
          const target = e.target as HTMLElement;
          if (target.tagName === "SUMMARY" || target.closest("summary") === e.currentTarget) {
            e.preventDefault();
            e.stopPropagation();
            editor.chain().setBlockAttrs(block.id, { open: !isOpen }).run();
          }
        }}
      >
        {content}
      </summary>
      <div className="gotipe-toggle-content">{children}</div>
    </details>
  );
}

/* ---- Callout Block ---- */

function CalloutBlock({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
  const content = <BlockContent block={block} />;
  const children = <BlockChildren block={block} editor={editor} />;
  const variant = (block.attrs.type as string) || "info";
  const emoji = block.attrs.emoji ? String(block.attrs.emoji) : null;

  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      data-variant={variant}
      className="gotipe-callout"
      role="note"
    >
      {emoji ? (
        <span
          className="gotipe-callout-emoji"
          contentEditable={false}
          role="img"
          aria-label="callout icon"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const newEmoji = prompt("Enter emoji:", emoji);
            if (newEmoji) {
              editor.chain().setBlockAttrs(block.id, { emoji: newEmoji }).run();
            }
          }}
        >
          {emoji}
        </span>
      ) : null}
      <div className="gotipe-callout-content">
        {content}
        {children}
      </div>
    </div>
  );
}

/* ---- Table Block ---- */

function TableBlock({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
  const children = <BlockChildren block={block} editor={editor} />;
  const hasHeader =
    block.children.length > 0 &&
    block.children[0]!.children.some((c) => c.type === "tableHeader");

  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      className="gotipe-table-wrapper"
      contentEditable={false}
    >
      <table className="gotipe-table">
        {hasHeader ? (
          <>
            <thead>
              <BlockComponent block={block.children[0]!} editor={editor} />
            </thead>
            <tbody>
              {block.children.slice(1).map((child) => (
                <BlockComponent key={child.id} block={child} editor={editor} />
              ))}
            </tbody>
          </>
        ) : (
          <tbody>{children}</tbody>
        )}
      </table>
    </div>
  );
}

function BlockComponent({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
  const content = <BlockContent block={block} />;
  const children = <BlockChildren block={block} editor={editor} />;

  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max((block.attrs.level as number) || 1, 1), 6);
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag data-block-id={block.id} data-block-type={block.type}>
          {content}
        </Tag>
      );
    }

    case "bulletList":
      return (
        <ul data-block-id={block.id} data-block-type={block.type}>
          {children}
        </ul>
      );

    case "orderedList":
      return (
        <ol data-block-id={block.id} data-block-type={block.type}>
          {children}
        </ol>
      );

    case "listItem":
      return (
        <li data-block-id={block.id} data-block-type={block.type}>
          {content}
          {children}
        </li>
      );

    case "todoList":
      return (
        <ul data-block-id={block.id} data-block-type={block.type} className="gotipe-todo-list">
          {children}
        </ul>
      );

    case "todoItem": {
      const checked = !!block.attrs.checked;
      return (
        <li data-block-id={block.id} data-block-type={block.type} className="gotipe-todo-item">
          <input
            type="checkbox"
            checked={checked}
            aria-label={checked ? "Mark as incomplete" : "Mark as complete"}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().setBlockAttrs(block.id, { checked: !checked }).run();
            }}
            onChange={() => {}}
          />
          <span>{content}</span>
        </li>
      );
    }

    case "codeBlock":
      return (
        <pre data-block-id={block.id} data-block-type={block.type} className="gotipe-code-block" aria-label={`Code block${block.attrs.language ? `, ${block.attrs.language}` : ""}`}>
          <code className={block.attrs.language ? `language-${block.attrs.language}` : undefined}>
            {typeof block.content === "string" ? block.content : content}
          </code>
        </pre>
      );

    case "blockquote":
      return (
        <blockquote data-block-id={block.id} data-block-type={block.type}>
          {content}
          {children}
        </blockquote>
      );

    case "divider":
      return <hr data-block-id={block.id} data-block-type={block.type} />;

    case "image":
      return <ImageBlock block={block} editor={editor} />;

    case "table":
      return <TableBlock block={block} editor={editor} />;

    case "tableRow":
      return (
        <tr data-block-id={block.id} data-block-type={block.type}>
          {children}
        </tr>
      );

    case "tableHeader":
      return (
        <th data-block-id={block.id} data-block-type={block.type} contentEditable>
          {content}
        </th>
      );

    case "tableCell":
      return (
        <td data-block-id={block.id} data-block-type={block.type} contentEditable>
          {content}
        </td>
      );

    case "callout":
      return <CalloutBlock block={block} editor={editor} />;

    case "toggle":
      return <ToggleBlock block={block} editor={editor} />;

    case "columns":
      return (
        <div
          data-block-id={block.id}
          data-block-type={block.type}
          className="gotipe-columns"
          data-columns-count={block.attrs.count ?? block.children.length}
        >
          {children}
        </div>
      );

    case "column":
      return (
        <div data-block-id={block.id} data-block-type={block.type} className="gotipe-column">
          {content}
          {children}
        </div>
      );

    case "paragraph":
    default:
      return (
        <p data-block-id={block.id} data-block-type={block.type || "paragraph"}>
          {content}
        </p>
      );
  }
}

export function EditorContent({
  editor,
  blockRenderer: _blockRenderer,
}: {
  editor: GoTipeEditor | null;
  blockRenderer?: (props: BlockRendererProps) => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewState = useViewState(editor);

  useEffect(() => {
    if (containerRef.current && editor) {
      editor.mount(containerRef.current);
      return () => editor.unmount();
    }
  }, [editor]);

  const blocks = viewState?.blocks ?? [];

  return (
    <>
      <div
        ref={containerRef}
        role="textbox"
        aria-multiline={true}
        aria-label="Document content"
        tabIndex={0}
        className="gotipe-content"
        data-gotipe-content=""
        contentEditable={!!editor}
        suppressContentEditableWarning
      >
        {editor &&
          blocks.map((block) => <BlockComponent key={block.id} block={block} editor={editor} />)}
      </div>
      {/* Screen reader live region for status updates */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="gotipe-sr-only"
        data-gotipe-live-region=""
      />
    </>
  );
}
