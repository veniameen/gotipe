import { useEffect, useState } from "react";
import type { CodeHighlighter, HighlightToken } from "./types";

/**
 * Tokens for `code`, or `null` while highlighting is pending, unavailable, or
 * stale. Tokens are returned only when their text equals the current code,
 * so an editable view never shows text that differs from the document.
 */
export function useHighlightedCode(
  highlight: CodeHighlighter | undefined,
  code: string,
  language: string,
  delayMs = 120,
): HighlightToken[][] | null {
  const [state, setState] = useState<{
    code: string;
    language: string;
    lines: HighlightToken[][];
  } | null>(null);

  useEffect(() => {
    if (!highlight || !code || !language || language === "plaintext" || language === "plain") {
      setState(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => highlight(code, language))
        .then((lines) => {
          if (cancelled) return;
          // A host adapter may reject, normalize newlines or return incomplete
          // tokens. Never let that change the editable DOM's document text.
          const valid =
            Array.isArray(lines) &&
            lines.every(
              (line) =>
                Array.isArray(line) &&
                line.every(
                  (token) =>
                    token !== null &&
                    typeof token === "object" &&
                    typeof token.content === "string",
                ),
            );
          const text = valid
            ? lines.map((line) => line.map((token) => token.content).join("")).join("\n")
            : null;
          setState(valid && text === code ? { code, language, lines } : null);
        })
        .catch(() => {
          if (!cancelled) setState(null);
        });
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [highlight, code, language, delayMs]);

  if (!state || state.code !== code || state.language !== language) return null;
  return state.lines;
}
