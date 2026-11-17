import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { useEffect, useMemo, useState } from "react";
import { useGoTipeI18n } from "../i18n-context";
import { mathErrorText, renderMath } from "./atoms";
import { CodeText } from "./code-text";
import { useMathRenderer } from "./math-renderer";

/** Whether the editor has focus and its caret is in `blockId`. */
function editingIn(editor: GoTipeEditor, blockId: string): boolean {
  const doc = editor.element?.ownerDocument;
  const focused = !!doc && !!editor.element?.contains(doc.activeElement);
  return focused && editor.getViewState().selection.head.blockId === blockId;
}

function useEditing(editor: GoTipeEditor, blockId: string): boolean {
  const [editing, setEditing] = useState(() => editingIn(editor, blockId));
  useEffect(() => {
    const sync = () => setEditing(editingIn(editor, blockId));
    const stops = [editor.on("selectionChange", sync), editor.on("focus", sync)];
    stops.push(editor.on("blur", () => setEditing(false)));
    sync();
    return () => {
      for (const stop of stops) stop();
    };
  }, [editor, blockId]);
  return editing;
}

/**
 * A formula (GoTipe Atlas, frames 18 and 24): the label “Formula · TeX” and the typeset formula
 * in the document's font. With the caret in the block its TeX shows, edited as text, with the
 * drawing under it; TeX that cannot be read shows with the reason. At rest the source stays in
 * place, transparent over the drawing, so a click or the arrow keys still reach it.
 */
export function MathBlock({
  block,
  editor,
  rootProps = {},
}: {
  block: BlockView;
  editor: GoTipeEditor;
  rootProps?: Record<string, unknown>;
}) {
  const i18n = useGoTipeI18n();
  const source = typeof block.content === "string" ? block.content : "";
  const editing = useEditing(editor, block.id);
  // Without a TeX reader (`MathRendererContext`) the block shows its TeX only.
  const parse = useMathRenderer();
  const result = useMemo(
    () => (parse && source.trim() ? parse(source, { display: true }) : null),
    [parse, source],
  );
  const rendered = !editing && !!result?.ok;
  return (
    <div
      {...rootProps}
      data-block-id={block.id}
      data-block-type="math"
      className={["gotipe-math", rootProps.className].filter(Boolean).join(" ")}
      data-state={rendered ? "rendered" : "editing"}
      spellCheck={false}
      aria-label={i18n.t("math.label")}
    >
      <div className="gotipe-math-header" contentEditable={false} data-gotipe-widget="">
        {i18n.t("math.tex")}
      </div>
      <pre className="gotipe-math-source">
        <CodeText editor={editor} code={source} language="latex" />
      </pre>
      {result && (
        <div
          className={result.ok ? "gotipe-math-render" : "gotipe-math-render is-invalid"}
          contentEditable={false}
          data-gotipe-widget=""
          aria-hidden={result.ok ? "true" : undefined}
        >
          {result.ok ? renderMath(result.math) : mathErrorText(i18n, result.error, source)}
        </div>
      )}
    </div>
  );
}
