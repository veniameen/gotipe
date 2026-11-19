import { type BlockView, type GoTipeEditor, headerRows, tableGrid } from "@gotipe/core";
import React, { useContext, useMemo } from "react";
import { useGoTipeI18n } from "../i18n-context";
import { CodeBlock } from "./code-block";
import {
  BlockViewsContext,
  LegacyRendererContext,
  PhantomContext,
  PlaceholderContext,
} from "./context";
import { placeholderOf } from "./decorations";
import { EmbedBlock } from "./embed-block";
import { CalloutBlock, ToggleBlock } from "./interactive-blocks";
import { MathBlock } from "./math-block";
import { MediaBlock } from "./media-view";
import { holdsBlock, isPlainTree } from "./plain-blocks";
import {
  BlockContent,
  blockKey,
  getEmptyBlockPlaceholder,
  isBlockContentEmpty,
  nodeDecorationClass,
  phantomBlocksOf,
  phantomGroupsOf,
  phantomOf,
  rootPropsOf,
} from "./presentation";

import { TableCell, TableCellSelection, TableRow } from "./table-cells";
import {
  TableColumns,
  TableElement,
  TableLayoutProvider,
  TableScroll,
  TableToolbar,
} from "./table-layout";

/** Digits of the widest number of an ordered list from `start` with `count` items. */
function listDigits(start: number, count: number): number {
  const last = start + Math.max(0, count - 1);
  return Math.max(String(Math.abs(start)).length, String(Math.abs(last)).length);
}

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
            block={phantomOf(phantom, group)}
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
      {block.children.map((child) => {
        const phantoms = phantomGroupsOf(child).length > 0;
        return (
          <React.Fragment key={blockKey(child)}>
            {phantoms ? (
              <PhantomBlocks
                block={child}
                editor={editor}
                position="before"
                parentType={block.type}
              />
            ) : null}
            <BlockComponent
              block={child}
              editor={editor}
              selectedBlockId={selectedBlockId}
              parentType={block.type}
            />
            {phantoms ? (
              <PhantomBlocks
                block={child}
                editor={editor}
                position="after"
                parentType={block.type}
              />
            ) : null}
          </React.Fragment>
        );
      })}
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
  const grid = useMemo(() => tableGrid(block), [block]);
  // the head holds the header rows on top and every row a header cell reaches down into
  const first = block.children[0]?.children.some((cell) => cell.type === "tableHeader");
  const head = Math.max(
    headerRows(grid),
    first
      ? Math.max(1, ...grid.cells.filter((cell) => cell.row === 0).map((cell) => cell.rows))
      : 0,
  );
  const rows = (from: number, to?: number) =>
    block.children
      .slice(from, to)
      .map((child) => (
        <BlockComponent
          key={child.id}
          block={child}
          editor={editor}
          selectedBlockId={selectedBlockId}
          parentType={block.type}
        />
      ));

  return (
    <TableLayoutProvider block={block} grid={grid} editor={editor}>
      <div
        {...rootProps}
        data-block-type={block.type}
        className={["gotipe-table-wrapper", rootProps.className].filter(Boolean).join(" ")}
        contentEditable={false}
      >
        <TableScroll>
          <TableElement>
            <TableColumns />
            {head > 0 ? <thead>{rows(0, head)}</thead> : null}
            {head < block.children.length ? <tbody>{rows(head)}</tbody> : null}
          </TableElement>
        </TableScroll>
        <TableCellSelection />
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

/**
 * A block and everything under it. A block that only built-in views draw (`isPlainTree`) is
 * drawn again only when it is a new object, the caret enters or leaves it, or the editor
 * becomes read-only or editable: typing in one block of a long document does not redraw the
 * others. A block with a custom view or a legacy renderer anywhere under it is drawn every time.
 */
export function BlockComponent(props: BlockComponentProps) {
  const views = useContext(BlockViewsContext);
  const legacy = useContext(LegacyRendererContext);
  const { block, editor, selectedBlockId, parentType } = props;
  if (legacy || !isPlainTree(block, views)) return <BlockRender {...props} />;
  return (
    <PlainBlock
      block={block}
      editor={editor}
      parentType={parentType}
      selectedBlockId={holdsBlock(block, selectedBlockId) ? selectedBlockId : ""}
      editable={editor.isEditable}
    />
  );
}

/** `editable` is not read: a change of it draws the block again, which reads the editor. */
const PlainBlock = React.memo(function PlainBlock({
  editable: _editable,
  ...props
}: BlockComponentProps & { editable: boolean }) {
  return <BlockRender {...props} />;
});

function BlockRender(props: BlockComponentProps) {
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
  // caret, so a page of empty lines stays quiet. A `placeholder` decoration (the Placeholder
  // extension) also shows it away from the caret. The host's function decides the words, then
  // the decoration's own text, then the interface language.
  const decorated = isEmpty && !readOnly ? placeholderOf(block) : null;
  const shouldShowPlaceholder =
    isEmpty && !readOnly && (isSelected || block.type !== "paragraph" || decorated !== null);
  const placeholder = shouldShowPlaceholder
    ? placeholderFn
      ? placeholderFn(block, parentType)
      : decorated || getEmptyBlockPlaceholder(block, parentType, i18n)
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

    case "orderedList": {
      // the list counts from its own number (D-268); its widest number sets the room before the
      // text (D-269)
      const value = Number(block.attrs.start);
      const start = Number.isInteger(value) ? value : 1;
      const digits = listDigits(start, block.children.length);
      return (
        <ol
          {...rootProps}
          data-block-type={block.type}
          start={start !== 1 ? start : undefined}
          style={
            digits > 2
              ? ({
                  ...(rootProps.style as React.CSSProperties | undefined),
                  "--gt-list-digits": digits,
                } as React.CSSProperties)
              : (rootProps.style as React.CSSProperties | undefined)
          }
        >
          {children}
        </ol>
      );
    }

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
    case "file":
      return <MediaBlock block={block} editor={editor} rootProps={rootProps} />;

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
        <TableRow block={block} rootProps={rootProps}>
          {children}
        </TableRow>
      );

    case "tableHeader":
    case "tableCell":
      return (
        <TableCell block={block} rootProps={rootProps} readOnly={readOnly}>
          {content}
        </TableCell>
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

    default: {
      // A paragraph, or a type without a view of its own: its children stay in it (a `<p>` can't
      // hold blocks), and a block without children keeps its `<p>`.
      const Tag = block.children.length > 0 ? "div" : "p";
      return (
        <Tag
          {...rootProps}
          data-block-type={block.type || "paragraph"}
          data-placeholder={placeholder ?? undefined}
        >
          {content}
          {children}
        </Tag>
      );
    }
  }
}
