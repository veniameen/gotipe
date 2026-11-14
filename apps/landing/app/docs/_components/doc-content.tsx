import { DemoIsland } from "@/components/demos/demo-island";
import type { DocNode } from "@/lib/docs/render";
import { type ReactNode, createElement } from "react";

/** The static blocks between demos as one run of the document in the docs view. */
function blocks(nodes: DocNode[], key: number): ReactNode {
  return (
    <div key={key} className="gotipe-editor site-doc-editor">
      <div className="gotipe-content">
        {nodes.map((node, index) => {
          if (node.kind === "void") return createElement(node.tag, { key: index, ...node.attrs });
          if (node.kind === "demo") return null;
          return createElement(node.tag, {
            key: index,
            ...node.attrs,
            dangerouslySetInnerHTML: { __html: node.html },
          });
        })}
      </div>
    </div>
  );
}

/**
 * The page's document: each top-level block is one element of the docs view's content, so the
 * view's flow (`.gotipe-content > * + *`) holds. A live demo stands between two runs of content,
 * outside them, so the document's rules (`.site-doc-editor …`) never reach the demo's own editor
 * and controls.
 * The HTML of a block comes from the build's own pipeline (lib/docs/render.ts): the library's
 * serializer escapes all text and checks every URL, and the site adds only fixed markup.
 */
export function DocContent({ nodes }: { nodes: DocNode[] }) {
  const parts: ReactNode[] = [];
  let run: DocNode[] = [];
  for (const node of nodes) {
    if (node.kind !== "demo") {
      run.push(node);
      continue;
    }
    if (run.length) parts.push(blocks(run, parts.length));
    parts.push(<DemoIsland key={parts.length} name={node.name} />);
    run = [];
  }
  if (run.length) parts.push(blocks(run, parts.length));
  return <div className="site-doc-body">{parts}</div>;
}
