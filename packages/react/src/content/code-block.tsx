import { type BlockView, type GoTipeEditor, GoTipeError } from "@gotipe/core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useGoTipeI18n } from "../i18n-context";
import { CodeText } from "./code-text";
import { usePhantom } from "./context";
import { ContentIcon } from "./icons";

const LANGUAGES = [
  ["plaintext", "Plain text"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["python", "Python"],
  ["rust", "Rust"],
  ["go", "Go"],
  ["html", "HTML"],
  ["css", "CSS"],
  ["json", "JSON"],
  ["sql", "SQL"],
  ["bash", "Bash"],
  ["java", "Java"],
  ["c", "C"],
  ["cpp", "C++"],
  ["ruby", "Ruby"],
  ["php", "PHP"],
  ["swift", "Swift"],
  ["kotlin", "Kotlin"],
  ["yaml", "YAML"],
  ["markdown", "Markdown"],
];

/** The editable text and non-document controls have separate DOM ownership. */
export function CodeBlock({
  block,
  editor,
  rootProps = {},
  children,
}: {
  block: BlockView;
  editor: GoTipeEditor;
  rootProps?: Record<string, unknown>;
  /** Optional token rendering supplied by a lazy highlighter. */
  children?: ReactNode;
}) {
  const language = String(block.attrs.language || "plaintext");
  const code = typeof block.content === "string" ? block.content : "";
  const readOnly = usePhantom() || !editor.isEditable;
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      if (!mounted.current) return;
      setCopied(true);
      setError(null);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch (cause) {
      if (!mounted.current) return;
      const error = new GoTipeError(
        "TRANSFORM_ERROR",
        cause instanceof Error ? cause.message : "Could not copy code",
      );
      setError(error.message);
      editor.reportError(error);
    }
  };
  const lines = code.split("\n");
  const i18n = useGoTipeI18n();
  return (
    <div
      {...rootProps}
      data-block-id={block.id}
      data-block-type="codeBlock"
      className={["gotipe-code-block", rootProps.className].filter(Boolean).join(" ")}
      spellCheck={false}
      aria-label={i18n.t("code.label", { language })}
    >
      <div className="gotipe-code-block-header" contentEditable={false} data-gotipe-widget="">
        <select
          className="gotipe-select gotipe-select--compact gotipe-code-language-select"
          aria-label={i18n.t("code.language")}
          value={language}
          disabled={readOnly}
          onChange={(event) => {
            if (editor.isEditable)
              editor.chain().setBlockAttrs(block.id, { language: event.target.value }).run();
          }}
        >
          {!LANGUAGES.some(([value]) => value === language) && (
            <option value={language}>{language}</option>
          )}
          {LANGUAGES.map(([value, label]) => (
            <option key={value} value={value}>
              {value === "plaintext" ? i18n.t("code.plainText") : label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={i18n.t(copied ? "code.copied" : "code.copy")}
          onClick={() => void copy()}
        >
          <ContentIcon name={copied ? "check" : "copy"} />
          <span className="gotipe-tip" aria-hidden="true">
            {i18n.t(copied ? "code.copied" : "code.copy")}
          </span>
        </button>
      </div>
      <div className="gotipe-code-block-scroll">
        {lines.length > 1 && (
          <div
            className="gotipe-code-block-line-numbers"
            contentEditable={false}
            data-gotipe-widget=""
            aria-hidden="true"
          >
            {lines.map((_, index) => (
              <div key={index}>{index + 1}</div>
            ))}
          </div>
        )}
        <pre>
          <CodeText editor={editor} code={code} language={language}>
            {children}
          </CodeText>
        </pre>
      </div>
      {error && (
        <p role="alert" contentEditable={false} data-gotipe-widget="">
          {error}
        </p>
      )}
    </div>
  );
}
