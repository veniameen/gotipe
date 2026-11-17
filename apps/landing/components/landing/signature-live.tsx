"use client";

import dynamic from "next/dynamic";
import { type RefObject, useEffect, useRef, useState } from "react";
import { SIGNATURE_MARKDOWN } from "./demo-content";
import { lineSummary, linesOf } from "./markdown-lines";
import { SignatureStatic } from "./signature-static";
import { SignatureWindow } from "./signature-window";
import { useNearViewport } from "./use-near-viewport";

const LINES = linesOf(SIGNATURE_MARKDOWN);

function Placeholder() {
  return (
    <SignatureWindow
      lines={LINES}
      summary={lineSummary(LINES.length, LINES.length, 0)}
      live={false}
    >
      <SignatureStatic />
    </SignatureWindow>
  );
}

/** The editor and the Markdown session: their own chunk, fetched near the viewport. */
const SignatureEditor = dynamic(() => import("./signature-editor"), {
  ssr: false,
  loading: Placeholder,
});

/** The first stage settles in about this long (motion.css: the window rises last), in ms. */
const SETTLE = 1600;
/** After that the editor waits for the browser to be idle, but no longer than this, in ms. */
const IDLE_WAIT = 2000;
/** A reader reaching for the window brings the editor at once. */
const REACH = ["pointerenter", "focusin", "touchstart"] as const;

/**
 * True once the window is near the viewport and either the first stage has settled and the browser
 * is idle, or the reader reaches for the window: the editor's code is parsed and run when it costs
 * the page's first motion nothing. The static document shows the same page meanwhile.
 */
function useEditorReady(target: RefObject<HTMLElement | null>): boolean {
  const near = useNearViewport(target);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = target.current;
    if (!near || ready || !element) return;
    const go = () => setReady(true);
    for (const name of REACH) element.addEventListener(name, go, { passive: true });
    // the wait for an idle moment: an idle callback, or a timer where there is none
    let cancel = () => {};
    const settled = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") {
        const idle = window.requestIdleCallback(go, { timeout: IDLE_WAIT });
        cancel = () => window.cancelIdleCallback(idle);
      } else {
        const later = window.setTimeout(go, 0);
        cancel = () => window.clearTimeout(later);
      }
    }, SETTLE);
    return () => {
      for (const name of REACH) element.removeEventListener(name, go);
      window.clearTimeout(settled);
      cancel();
    };
  }, [near, ready, target]);
  return ready;
}

/** The signature window: the static picture in the server HTML, the live editor in the browser. */
export function SignatureLive() {
  const root = useRef<HTMLDivElement>(null);
  const ready = useEditorReady(root);
  return (
    <div ref={root} className="site-showcase" data-play>
      <span className="site-beam-ring" aria-hidden="true">
        <span />
      </span>
      {ready ? <SignatureEditor /> : <Placeholder />}
    </div>
  );
}
