"use client";

import { announce, copyText } from "@/components/site/clipboard";
import { Icon } from "@/components/site/icon";
import { useEffect, useRef, useState } from "react";

type State = "idle" | "copied" | "failed";
const SAY: Record<State, string> = {
  idle: "Copy Markdown",
  copied: "Copied",
  failed: "Copy failed",
};

/** Copies the page's Markdown source (served at /docs/<slug>.md) to the clipboard. */
export function CopyMarkdown({ url }: { url: string }) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    const source = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    });
    const next: State = (await copyText(source)) ? "copied" : "failed";
    announce(next === "copied" ? "Markdown copied" : SAY.failed);
    setState(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2000);
  };

  return (
    <button
      type="button"
      className="site-button is-quiet site-tool-button"
      aria-label={SAY[state]}
      onClick={copy}
    >
      <Icon name={state === "copied" ? "check-16" : "copy"} />
      <span className="site-tool-label">{SAY[state]}</span>
    </button>
  );
}
