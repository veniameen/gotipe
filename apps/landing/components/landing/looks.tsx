"use client";

import type { ThemePreset } from "@gotipe/theme";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Icon } from "../site/icon";
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

/** «One markup. Four looks.»: the list switches the view of a live BlockEditor beside it. */
export function Looks() {
  const [view, setView] = useState<ThemePreset>("notion");
  const root = useRef<HTMLDivElement>(null);
  const near = useNearViewport(root);
  return (
    <div className="site-looks" ref={root}>
      <div>
        <p className="site-eyebrow">Make it your own</p>
        <h2 id="site-looks-title">
          One markup.
          <br />
          Four looks.
        </h2>
        <p className="site-sub">
          Notion, docs, modern and minimal are sets of tokens over the same document. Switch them
          with one attribute.
        </p>
        <fieldset className="site-look-list">
          <legend className="site-sr">View of the page</legend>
          {LOOKS.map((look) => (
            <button
              key={look.view}
              type="button"
              className={`site-look${look.view === view ? " is-on" : ""}`}
              aria-pressed={look.view === view}
              onClick={() => setView(look.view)}
            >
              <span>
                <strong>{look.name}</strong>
                <small>{look.note}</small>
              </span>
              <Icon name="arrow-up-right" />
            </button>
          ))}
        </fieldset>
      </div>
      <figure className="site-window is-look" data-gt-view={view}>
        <div className="site-window-bar">
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
