import type { Block, Mark, TextSpan } from "@gotipe/core";
import type { TextChange } from "@gotipe/versions";
import type { ReactNode } from "react";
import { type DiffNode, standsAlone } from "./history-model";

/** Links the comparison may open: web and mail addresses only. */
const SAFE_LINK = /^(?:https?:|mailto:)/i;

function marked(text: string, marks: readonly Mark[], key: number): ReactNode {
  let node: ReactNode = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        node = <strong>{node}</strong>;
        break;
      case "italic":
        node = <em>{node}</em>;
        break;
      case "underline":
        node = <u>{node}</u>;
        break;
      case "strikethrough":
        node = <s>{node}</s>;
        break;
      case "code":
        node = <code>{node}</code>;
        break;
      case "highlight":
        node = <mark>{node}</mark>;
        break;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        if (SAFE_LINK.test(href))
          node = (
            <a href={href} rel="noopener noreferrer" target="_blank">
              {node}
            </a>
          );
        break;
      }
    }
  }
  return <span key={key}>{node}</span>;
}

/** A block's own text: its spans with their marks, or the words that changed. */
function Text({ node }: { node: DiffNode }) {
  if (node.text)
    return (
      <>
        {node.text.map((change, index) =>
          change.type === "equal" ? (
            <span key={index}>{change.text}</span>
          ) : (
            <Change key={`${change.type}${index}`} change={change} />
          ),
        )}
      </>
    );
  const { content } = node.block;
  if (Array.isArray(content))
    return (
      <>{(content as TextSpan[]).map((span, index) => marked(span.text, span.marks, index))}</>
    );
  return typeof content === "string" ? <>{content}</> : null;
}

function Change({ change }: { change: TextChange }) {
  return change.type === "insert" ? (
    <ins className="gotipe-insert">{change.text}</ins>
  ) : (
    <del className="gotipe-delete">{change.text}</del>
  );
}

const attr = (block: Block, name: string) =>
  typeof block.attrs[name] === "string" ? (block.attrs[name] as string) : "";

/** One block of the comparison in the page's own markup; its mark is a rule in the gutter. */
function DiffBlock({ node }: { node: DiffNode }) {
  const { block } = node;
  const props = {
    "data-block-id": block.id,
    "data-block-type": block.type,
    "data-diff": node.status !== "same" && standsAlone(block) ? statusName(node) : undefined,
  };
  const children = node.children.map((child) => <DiffBlock key={child.block.id} node={child} />);
  const text = <Text node={node} />;
  switch (block.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(block.attrs.level) || 1));
      const Tag = `h${level}` as "h1";
      return <Tag {...props}>{text}</Tag>;
    }
    case "bulletList":
      return <ul {...props}>{children}</ul>;
    case "orderedList":
      return (
        <ol {...props} start={Number(block.attrs.start) || undefined}>
          {children}
        </ol>
      );
    case "todoList":
      return (
        <ul {...props} className="gotipe-todo-list">
          {children}
        </ul>
      );
    case "listItem":
      return (
        <li {...props}>
          {text}
          {children}
        </li>
      );
    case "todoItem":
      return (
        <li {...props} className="gotipe-todo-item">
          <input type="checkbox" checked={!!block.attrs.checked} disabled readOnly />
          <span className="gotipe-todo-item-content">{text}</span>
          {children}
        </li>
      );
    case "blockquote":
      return (
        <blockquote {...props}>
          {text}
          {children}
        </blockquote>
      );
    case "codeBlock":
    case "math":
      return (
        <pre {...props}>
          <code>{text}</code>
        </pre>
      );
    case "divider":
      return <hr {...props} />;
    case "image":
    case "file":
    case "embed":
      return (
        <p {...props}>
          {attr(block, "alt") ||
            attr(block, "caption") ||
            attr(block, "name") ||
            attr(block, "url") ||
            attr(block, "src")}
        </p>
      );
    case "table":
      return (
        <div {...props} className="gotipe-table-wrapper">
          <table className="gotipe-table">
            <tbody>{children}</tbody>
          </table>
        </div>
      );
    case "tableRow":
      return <tr {...props}>{children}</tr>;
    case "tableHeader":
    case "tableCell": {
      const Tag = block.type === "tableHeader" ? "th" : "td";
      return (
        <Tag
          {...props}
          colSpan={Number(block.attrs.colspan) || undefined}
          rowSpan={Number(block.attrs.rowspan) || undefined}
        >
          {text}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p {...props}>
          {text}
          {children}
        </p>
      );
    default:
      return block.content === null ? (
        <div {...props}>{children}</div>
      ) : (
        <div {...props}>
          <p>{text}</p>
          {children}
        </div>
      );
  }
}

const statusName = (node: DiffNode) => node.status;

/** The chosen version against the page as it is now, in the page's typography (Atlas frame 30). */
export function CompareView({ nodes, empty }: { nodes: DiffNode[]; empty: string | null }) {
  return (
    <div className="gotipe-editor gotipe-history-compare" data-gotipe-version-diff="">
      <div className="gotipe-content">
        {empty ? <p className="gotipe-history-same">{empty}</p> : null}
        {nodes.map((node) => (
          <DiffBlock key={node.block.id} node={node} />
        ))}
      </div>
    </div>
  );
}
