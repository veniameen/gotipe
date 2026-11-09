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
      highlight(code, language)
        .then((lines) => {
          if (cancelled) return;
          setState(lines ? { code, language, lines } : null);
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
