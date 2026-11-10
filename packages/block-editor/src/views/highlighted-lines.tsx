import { toSafeColor } from "@gotipe/core";
import type React from "react";
import type { HighlightToken } from "../highlight/types";

/**
 * Renders highlighter tokens as React spans (no HTML strings). Colours go
 * through CSS variables so themes can switch without re-highlighting:
 * `--gt-code-token` (light) and `--gt-code-token-dark`.
 */
export function HighlightedLines({ lines }: { lines: HighlightToken[][] }) {
  const out: React.ReactNode[] = [];
  lines.forEach((line, li) => {
    if (li > 0) out.push("\n");
    line.forEach((token, ti) => {
      const style: Record<string, string> = {};
      const color = toSafeColor(token.color);
      const darkColor = toSafeColor(token.darkColor);
      if (color) style["--gt-code-token"] = color;
      if (darkColor) style["--gt-code-token-dark"] = darkColor;
      const fs =
        typeof token.fontStyle === "number" &&
        Number.isInteger(token.fontStyle) &&
        token.fontStyle >= 0 &&
        token.fontStyle <= 7
          ? token.fontStyle
          : 0;
      out.push(
        <span
          key={`${li}:${ti}`}
          className="gotipe-code-token"
          data-italic={fs & 1 ? "" : undefined}
          data-bold={fs & 2 ? "" : undefined}
          data-underline={fs & 4 ? "" : undefined}
          style={style as React.CSSProperties}
        >
          {token.content}
        </span>,
      );
    });
  });
  return <>{out}</>;
}
