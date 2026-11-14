"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
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

/** The signature window: the static picture in the server HTML, the live editor in the browser. */
export function SignatureLive() {
  const root = useRef<HTMLDivElement>(null);
  const near = useNearViewport(root);
  return (
    <div ref={root} className="site-plinth">
      {near ? <SignatureEditor /> : <Placeholder />}
    </div>
  );
}
