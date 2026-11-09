import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BundledLanguage, Highlighter } from "shiki";
import { createHighlighter } from "shiki";

const POPULAR_LANGUAGES: { value: string; label: string }[] = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "ruby", label: "Ruby" },
  { value: "php", label: "PHP" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
  { value: "plaintext", label: "Plain text" },
];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: POPULAR_LANGUAGES.filter((l) => l.value !== "plaintext").map(
        (l) => l.value as BundledLanguage,
      ),
    });
  }
  return highlighterPromise;
}

const COPY_FEEDBACK_MS = 2000;

export function CodeBlockView({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
  const language = (block.attrs.language as string) || "plaintext";
  const code = typeof block.content === "string" ? block.content : "";
  const [highlightedHtml, setHighlightedHtml] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load and apply syntax highlighting
  useEffect(() => {
    if (language === "plaintext" || !code) {
      setHighlightedHtml("");
      return;
    }

    let cancelled = false;
    getHighlighter().then((highlighter) => {
      if (cancelled) return;
      try {
        const html = highlighter.codeToHtml(code, {
          lang: language as BundledLanguage,
          theme: "github-light",
        });
        setHighlightedHtml(html);
      } catch {
        // Language not loaded — fall back to plain text
        setHighlightedHtml("");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      editor.chain().setBlockAttrs(block.id, { language: e.target.value }).run();
    },
    [editor, block.id],
  );

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }, [code]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const lines = code.split("\n");

  return (
    <div data-block-id={block.id} data-block-type="codeBlock" className="gotipe-code-block">
      <div className="gotipe-code-block-header">
        <select
          className="gotipe-select gotipe-select--compact gotipe-code-language-select"
          value={language}
          onChange={handleLanguageChange}
          aria-label="Programming language"
        >
          {POPULAR_LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
        <button type="button" aria-label={copied ? "Copied!" : "Copy code"} onClick={handleCopy}>
          {copied ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            "Copy"
          )}
        </button>
      </div>
      <div style={{ display: "flex" }}>
        {/* Line numbers */}
        {showLineNumbers && lines.length > 1 && (
          <div className="gotipe-code-block-line-numbers" aria-hidden="true">
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}
        {/* Code content — Shiki output is safe: generated from grammar
            parsing with proper HTML escaping, not from user-supplied HTML */}
        {highlightedHtml ? (
          <div
            className="gotipe-code-block-content"
            style={{ flex: 1 }}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre style={{ flex: 1 }}>
            <code className={`language-${language}`}>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
