"use client";

import type { ThemePreset } from "@gotipe/theme";
import dynamic from "next/dynamic";
import { type CSSProperties, useRef, useState } from "react";
import { LOOK_MARKDOWN, LOOK_TITLE } from "./demo-content";
import { linesOf } from "./markdown-lines";
import { StaticDoc, StaticTodos } from "./static-doc";
import { useNearViewport } from "./use-near-viewport";

const LOOKS: { view: ThemePreset; name: string; note: string }[] = [
  { view: "notion", name: "Notion", note: "Familiar and focused. The default." },
  { view: "docs", name: "Docs", note: "Reference pages with an outline." },
  { view: "modern", name: "Modern", note: "A fixed toolbar and more room." },
  { view: "minimal", name: "Minimal", note: "Just the words." },
];

/** The page as the server sends it: readable without JavaScript, in the editor's place. */
function LookStatic() {
  const [paragraph = "", , ...todos] = linesOf(LOOK_MARKDOWN);
  return (
    <StaticDoc>
      <h2 className="site-static-title">{LOOK_TITLE}</h2>
      <p>{paragraph}</p>
      <StaticTodos
        items={todos.map((line) => [line.startsWith("- [x]"), line.slice(6)] as const)}
      />
    </StaticDoc>
  );
}

const LooksEditor = dynamic(() => import("./looks-editor"), {
  ssr: false,
  loading: LookStatic,
});

/**
 * «One markup. Four looks.»: a switch of the four views over a live BlockEditor. The thumb slides
 * to the chosen view; the window keeps one height, so the page does not jump between views.
 */
export function Looks() {
  const [view, setView] = useState<ThemePreset>("notion");
  const root = useRef<HTMLDivElement>(null);
  const near = useNearViewport(root);
  const index = Math.max(
    0,
    LOOKS.findIndex((look) => look.view === view),
  );
  return (
    <div className="site-looks" ref={root}>
      <div className="site-head-row" data-reveal>
        <div>
          <p className="site-eyebrow">Make it your own</p>
          <h2 id="site-looks-title" className="site-title">
            One markup.
            <br />
            Four looks.
          </h2>
        </div>
        <p className="site-sub">
          Notion, docs, modern and minimal are sets of tokens over the same document. Switch them
          with one attribute.
        </p>
      </div>
      <div className="site-looks-bar">
        <fieldset className="site-segment" style={{ "--site-segment-i": index } as CSSProperties}>
          <legend className="site-sr">View of the page</legend>
          <span className="site-segment-thumb" aria-hidden="true" />
          {LOOKS.map((look) => (
            <button
              key={look.view}
              type="button"
              className="site-segment-item"
              aria-pressed={look.view === view}
              onClick={() => setView(look.view)}
            >
              {look.name}
            </button>
          ))}
        </fieldset>
        <p className="site-looks-note" aria-live="polite">
          {LOOKS[index]?.note}
        </p>
      </div>
      <figure className="site-window is-look" data-gt-view={view}>
        <div className="site-window-bar">
          <span className="site-window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="site-tag">draft.md</span>
          <span className="site-window-end">
            <code className="site-code-attr">data-gt-view="{view}"</code>
          </span>
        </div>
        <div className="site-look-page">{near ? <LooksEditor view={view} /> : <LookStatic />}</div>
        <figcaption className="site-window-foot">
          <span>one document · four token sets</span>
          <span>source unchanged</span>
        </figcaption>
      </figure>
    </div>
  );
}
