import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { useGoTipeI18n } from "../i18n-context";
import { CodeText } from "./code-text";

/**
 * A formula as its TeX, centred and edited as text (GoTipe Atlas, frame 18). The library ships no
 * TeX renderer; a host that has one passes its own block view for `math`.
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
  return (
    <div
      {...rootProps}
      data-block-id={block.id}
      data-block-type="math"
      className={["gotipe-math", rootProps.className].filter(Boolean).join(" ")}
      spellCheck={false}
      aria-label={i18n.t("math.label")}
    >
      <div className="gotipe-math-header" contentEditable={false} data-gotipe-widget="">
        {i18n.t("math.tex")}
      </div>
      <pre className="gotipe-math-source">
        <CodeText editor={editor} code={source} language="latex" />
      </pre>
    </div>
  );
}
