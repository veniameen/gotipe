"use client";

import { type CSSProperties, type KeyboardEvent, useId, useRef, useState } from "react";
import { CopyButton } from "../site/copy-button";

export interface HighlightedSample {
  tab: string;
  file: string;
  text: string;
  /** One HTML string per line, every text escaped by the build's highlighter. */
  lines: string[];
}

/**
 * The code of the dark panel: one tab per sample (tablist with arrow keys), the file's name and
 * a copy button, line numbers beside the code. The accent line slides under the chosen tab. Every
 * sample is in the HTML; the others are hidden.
 */
export function CodeTabs({ samples }: { samples: HighlightedSample[] }) {
  const [active, setActive] = useState(0);
  const ids = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = samples[active] ?? samples[0];
  if (!current) return null;

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: samples.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = ((moves[event.key] ?? 0) + samples.length) % samples.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="site-code" data-gt-view="docs">
      <div className="site-code-head">
        <div
          className="site-code-tabs"
          role="tablist"
          aria-label="Samples"
          onKeyDown={onKey}
          style={{ "--site-tab-i": active, "--site-tab-n": samples.length } as CSSProperties}
        >
          {samples.map((sample, index) => (
            <button
              key={sample.tab}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${ids}-tab-${index}`}
              className="site-code-tab"
              aria-selected={index === active}
              aria-controls={`${ids}-panel-${index}`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => setActive(index)}
            >
              {sample.tab}
            </button>
          ))}
          <span className="site-code-tab-line" aria-hidden="true" />
        </div>
        <span className="site-code-file">{current.file}</span>
        <CopyButton
          text={current.text}
          label={`Copy ${current.file}`}
          className="site-button is-quiet site-code-copy"
          showText
        />
      </div>
      {samples.map((sample, index) => (
        <div
          key={sample.tab}
          id={`${ids}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${ids}-tab-${index}`}
          className="site-code-panel"
          hidden={index !== active}
        >
          <span className="site-code-numbers" aria-hidden="true">
            {sample.lines.map((_, line) => `${line + 1}\n`).join("")}
          </span>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a code sample that scrolls sideways is reachable from the keyboard */}
          <pre tabIndex={0} aria-label={`${sample.file}, ${sample.tab} sample`}>
            <code
              // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time highlighter output of a constant sample, every text escaped (lib/docs/highlight.ts)
              dangerouslySetInnerHTML={{
                __html: sample.lines
                  .map((line) => `<span class="site-code-line">${line}\n</span>`)
                  .join(""),
              }}
            />
          </pre>
        </div>
      ))}
    </div>
  );
}
