import type { BlockView, GoTipeEditor } from "@gotipe/core";
import React, { useContext } from "react";
import { useGoTipeI18n } from "../i18n-context";
import { FileBlock } from "../media/file-block";
import { ImageBlock } from "../media/image-block";
import { CodeBlock } from "./code-block";
import {
  BlockViewsContext,
  LegacyRendererContext,
  PhantomContext,
  PlaceholderContext,
} from "./context";
import { EmbedBlock } from "./embed-block";
import { CalloutBlock, ToggleBlock } from "./interactive-blocks";
import { MathBlock } from "./math-block";
import {
  BlockContent,
  blockKey,
  getEmptyBlockPlaceholder,
  isBlockContentEmpty,
  nodeDecorationClass,
  phantomBlocksOf,
  rootPropsOf,
} from "./presentation";
import {
  TableColumnResizeHandle,
  TableColumns,
  TableLayoutProvider,
  TableScroll,
  TableToolbar,
} from "./table-layout";

/** Suggested blocks around `block` (a `blocks` decoration). */
export function PhantomBlocks({
  block,
  editor,
  position,
  parentType,
}: {
  block: BlockView;
  editor: GoTipeEditor;
  position: "before" | "after";
  parentType?: string;
}) {
  const groups = phantomBlocksOf(block, position);
  if (groups.length === 0) return null;
  return (
    <PhantomContext.Provider value={true}>
      {groups.map((group) =>
        group.blocks.map((phantom) => (
          <BlockComponent
            key={`${group.key}:${phantom.id}`}
            block={{
              ...phantom,
              decorations: [
                ...(phantom.decorations ?? []),
                {
                  type: "node",
                  key: group.key,
                  blockId: phantom.id,
                  className: group.className,
                  attrs: group.attrs,
                  style: group.style,
                },
              ],
            }}
            editor={editor}
            selectedBlockId=""
            parentType={parentType}
          />
        )),
      )}
    </PhantomContext.Provider>
  );
}

function BlockChildren({
  block,
  editor,
  selectedBlockId,
}: {
  block: BlockView;
  editor: GoTipeEditor;
  selectedBlockId: string;
}) {
  if (!block.children || block.children.length === 0) return null;
  return (
    <>
      {block.children.map((child) => (
        <React.Fragment key={blockKey(child)}>
          <PhantomBlocks block={child} editor={editor} position="before" parentType={block.type} />
          <BlockComponent
            block={child}
            editor={editor}
            selectedBlockId={selectedBlockId}
            parentType={block.type}
          />
          <PhantomBlocks block={child} editor={editor} position="after" parentType={block.type} />
        </React.Fragment>
      ))}
    </>
  );
}

/* ---- Table Block ---- */

export function TableBlock({
  block,
  editor,
  selectedBlockId = editor.getViewState().selection.anchor.blockId,
  rootProps = { "data-block-id": block.id },
}: {
  block: BlockView;
  editor: GoTipeEditor;
  selectedBlockId?: string;
  rootProps?: Record<string, unknown>;
}) {
  const children = (
    <BlockChildren block={block} editor={editor} selectedBlockId={selectedBlockId} />
  );
  const hasHeader =
    block.children.length > 0 && block.children[0]!.children.some((c) => c.type === "tableHeader");

  return (
    <TableLayoutProvider block={block} editor={editor}>
      <div
        {...rootProps}
        data-block-type={block.type}
        className={["gotipe-table-wrapper", rootProps.className].filter(Boolean).join(" ")}
        contentEditable={false}
      >
        <TableScroll>
          <table className="gotipe-table">
            <TableColumns />
            {hasHeader ? (
              <>
                <thead>
                  <BlockComponent
                    block={block.children[0]!}
                    editor={editor}
                    selectedBlockId={selectedBlockId}
                    parentType={block.type}
                  />
                </thead>
                <tbody>
                  {block.children.slice(1).map((child) => (
                    <BlockComponent
                      key={child.id}
                      block={child}
                      editor={editor}
                      selectedBlockId={selectedBlockId}
                      parentType={block.type}
                    />
                  ))}
                </tbody>
              </>
            ) : (
              <tbody>{children}</tbody>
            )}
          </table>
        </TableScroll>
        <TableToolbar />
      </div>
    </TableLayoutProvider>
  );
}

interface BlockComponentProps {
  block: BlockView;
  editor: GoTipeEditor;
  selectedBlockId: string;
  parentType?: string;
}

export function BlockComponent(props: BlockComponentProps) {
  const { block, editor, selectedBlockId, parentType } = props;
  const views = useContext(BlockViewsContext);
  const legacy = useContext(LegacyRendererContext);
  const phantom = useContext(PhantomContext);
  const rootProps = rootPropsOf(block, phantom);
  const Custom = views?.[block.type];
  const extraClass = nodeDecorationClass(block);
  if (extraClass) rootProps.className = extraClass;
  if (!Custom && legacy) {
    const rendered = legacy({
      block,
      editor,
      children: (
        <>
          <BlockContent block={block} />
          <BlockChildren block={block} editor={editor} selectedBlockId={selectedBlockId} />
        </>
      ),
    });
    if (rendered !== null && rendered !== undefined) {
      if (
        React.isValidElement<Record<string, unknown>>(rendered) &&
        typeof rendered.type === "string"
      )
        return React.cloneElement(rendered, {
          ...rootProps,
          "data-block-type": block.type,
          className: [rendered.props.className, extraClass].filter(Boolean).join(" "),
          style: {
            ...(rendered.props.style as React.CSSProperties),
            ...(rootProps.style as React.CSSProperties),
          },
        });
      return (
        <div {...rootProps} className={extraClass} data-block-type={block.type}>
          {rendered}
        </div>
      );
    }
  }
  let element: React.ReactNode;
  if (Custom) {
    // Custom views merge `rootProps.className` into their root element.
    if (extraClass) rootProps.className = extraClass;
    element = (
      <Custom
        block={block}
        editor={editor}
        parentType={parentType}
        selectedBlockId={selectedBlockId}
        isSelected={selectedBlockId === block.id}
        readOnly={!editor.isEditable}
        phantom={phantom}
        rootProps={rootProps}
        content={<BlockContent block={block} />}
      >
        <BlockChildren block={block} editor={editor} selectedBlockId={selectedBlockId} />
      </Custom>
    );
  } else {
    element = (
      <BlockComponentInner
        {...props}
        rootProps={rootProps}
        readOnly={!editor.isEditable || phantom}
      />
    );
  }
  return <>{element}</>;
}

function BlockComponentInner({
  block,
  editor,
  selectedBlockId,
  parentType,
  rootProps,
  readOnly,
}: BlockComponentProps & { rootProps: Record<string, unknown>; readOnly: boolean }) {
  const content = <BlockContent block={block} />;
  const children = (
    <BlockChildren block={block} editor={editor} selectedBlockId={selectedBlockId} />
  );
  const placeholderFn = useContext(PlaceholderContext);
  const i18n = useGoTipeI18n();
  const isSelected = selectedBlockId === block.id;
  const isEmpty = isBlockContentEmpty(block);
  // An empty block says what it will become (Atlas frame 11); an empty paragraph only under the
  // caret, so a page of empty lines stays quiet.
  const shouldShowPlaceholder = isEmpty && !readOnly && (isSelected || block.type !== "paragraph");
  const placeholder = shouldShowPlaceholder
    ? placeholderFn
      ? placeholderFn(block, parentType)
      : getEmptyBlockPlaceholder(block, parentType, i18n)
    : null;

  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max((block.attrs.level as number) || 1, 1), 6);
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag
          {...rootProps}
          data-block-type={block.type}
          data-placeholder={placeholder ?? undefined}
        >
          {content}
        </Tag>
      );
    }

    case "bulletList":
      return (
        <ul {...rootProps} data-block-type={block.type}>
          {children}
        </ul>
      );

    case "orderedList":
      return (
        <ol {...rootProps} data-block-type={block.type}>
          {children}
        </ol>
      );

    case "listItem":
      return (
        <li {...rootProps} data-block-type={block.type} data-placeholder={placeholder ?? undefined}>
          {content}
          {children}
        </li>
      );

    case "todoList":
      return (
        <ul
          {...rootProps}
          data-block-type={block.type}
          className={["gotipe-todo-list", rootProps.className].filter(Boolean).join(" ")}
        >
          {children}
        </ul>
      );

    case "todoItem": {
      const checked = !!block.attrs.checked;
      return (
        <li
          {...rootProps}
          data-block-type={block.type}
          className={["gotipe-todo-item", rootProps.className].filter(Boolean).join(" ")}
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest("[data-block-id]") !== e.currentTarget) return;
            if (target.closest('input[type="checkbox"]')) return;

            const host = e.currentTarget.querySelector("[data-gotipe-todo-content]");
            if (!(host instanceof HTMLElement)) return;
            if (e.clientX > host.getBoundingClientRect().left) return;

            // Prevent transient caret placement on <li> left edge when clicking left zone.
            e.preventDefault();
            const selection = window.getSelection();
            if (!selection) return;
            const range = document.createRange();
            range.setStart(host, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            editor.syncSelectionFromDOM();
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            contentEditable={false}
            aria-label={i18n.t(checked ? "todo.uncheck" : "todo.check")}
            disabled={readOnly}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onChange={(event) => {
              if (!readOnly)
                editor.chain().setBlockAttrs(block.id, { checked: event.target.checked }).run();
            }}
          />
          <span
            className="gotipe-todo-item-content"
            data-gotipe-todo-content=""
            data-placeholder={placeholder ?? undefined}
          >
            {content}
          </span>
          {children}
        </li>
      );
    }

    case "codeBlock":
      return <CodeBlock block={block} editor={editor} rootProps={rootProps} />;

    case "blockquote":
      return (
        <blockquote
          {...rootProps}
          data-block-type={block.type}
          data-placeholder={placeholder ?? undefined}
        >
          {content}
          {children}
        </blockquote>
      );

    case "divider":
      return <hr {...rootProps} data-block-type={block.type} />;

    case "image":
      return <ImageBlock block={block} editor={editor} rootProps={rootProps} />;

    case "file":
      return <FileBlock block={block} editor={editor} rootProps={rootProps} />;

    case "embed":
      return <EmbedBlock block={block} editor={editor} rootProps={rootProps} />;

    case "math":
      return <MathBlock block={block} editor={editor} rootProps={rootProps} />;

    case "table":
      return (
        <TableBlock
          block={block}
          editor={editor}
          selectedBlockId={selectedBlockId}
          rootProps={rootProps}
        />
      );

    case "tableRow":
      return (
        <tr {...rootProps} data-block-type={block.type}>
          {children}
        </tr>
      );

    case "tableHeader":
      return (
        <th
          {...rootProps}
          data-block-type={block.type}
          contentEditable={!readOnly}
          suppressContentEditableWarning
        >
          {content}
          <TableColumnResizeHandle cellId={block.id} />
        </th>
      );

    case "tableCell":
      return (
        <td
          {...rootProps}
          data-block-type={block.type}
          contentEditable={!readOnly}
          suppressContentEditableWarning
        >
          {content}
          <TableColumnResizeHandle cellId={block.id} />
        </td>
      );

    case "callout":
      return (
        <CalloutBlock block={block} editor={editor} rootProps={rootProps} content={content}>
          {children}
        </CalloutBlock>
      );

    case "toggle":
      return (
        <ToggleBlock
          block={block}
          editor={editor}
          rootProps={rootProps}
          content={content}
          placeholder={placeholder}
        >
          {children}
        </ToggleBlock>
      );

    case "columns":
      return (
        <div
          {...rootProps}
          data-block-type={block.type}
          className={["gotipe-columns", rootProps.className].filter(Boolean).join(" ")}
          data-columns-count={block.attrs.count ?? block.children.length}
        >
          {children}
        </div>
      );

    case "column":
      return (
        <div
          {...rootProps}
          data-block-type={block.type}
          className={["gotipe-column", rootProps.className].filter(Boolean).join(" ")}
        >
          {content}
          {children}
        </div>
      );

    default:
      return (
        <p
          {...rootProps}
          data-block-type={block.type || "paragraph"}
          data-placeholder={placeholder ?? undefined}
        >
          {content}
        </p>
      );
  }
}
