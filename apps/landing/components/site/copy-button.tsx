"use client";

import { useEffect, useRef, useState } from "react";
import { announce, copyText } from "./clipboard";
import { Icon } from "./icon";

type State = "idle" | "copied" | "failed";

const SAY: Record<State, string> = { idle: "", copied: "Copied", failed: "Copy failed" };
const RESET_MS = 2000;

/**
 * Copies a fixed text to the clipboard. `label` names the action for assistive technology; the
 * result is announced (clipboard.ts) and shown for a moment. Without the Clipboard API it says it
 * failed.
 */
export function CopyButton({
  text,
  label,
  className,
  showText = false,
}: {
  text: string;
  label: string;
  className: string;
  /** Shows the word «copy» beside the icon (the code panel), not just the icon. */
  showText?: boolean;
}) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    const next: State = (await copyText(text)) ? "copied" : "failed";
    announce(SAY[next]);
    setState(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), RESET_MS);
  };

  return (
    <button type="button" className={className} aria-label={label} onClick={copy}>
      <Icon name={state === "copied" ? "check-16" : "copy"} />
      {showText && (
        <span aria-hidden="true">{state === "idle" ? "copy" : SAY[state].toLowerCase()}</span>
      )}
    </button>
  );
}
