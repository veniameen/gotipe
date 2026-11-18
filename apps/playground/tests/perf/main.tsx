import { PageEditor } from "@gotipe/block-editor";
import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import "@gotipe/theme/page.css";
import { largePage } from "./large-page";

/**
 * A technical consumer for `scripts/perf/typing-latency.mjs`: a controlled `PageEditor` on a
 * generated page (`?sections=236` is about 258 KiB and 7,384 blocks). It records, per key press,
 * the time from `keydown` to the first frame after it and the time spent in `beforeinput`.
 */
interface Sample {
  frame: number;
  input: number;
}

declare global {
  interface Window {
    __GOTIPE_PERF__: {
      samples: Sample[];
      editor: GoTipeEditor | null;
      /** The page as generated, and as last emitted by `onChange`. */
      initial: string;
      markdown: string;
      changes: number;
    };
  }
}

const sections = Number(new URLSearchParams(location.search).get("sections") ?? 236);
const initial = largePage(sections);
const perf = {
  samples: [] as Sample[],
  editor: null as GoTipeEditor | null,
  initial,
  markdown: initial,
  changes: 0,
};
window.__GOTIPE_PERF__ = perf;

let pending: { start: number; input: number } | null = null;
let inputStart = 0;
window.addEventListener(
  "keydown",
  (event) => {
    if (event.key.length !== 1) return;
    const sample = { start: performance.now(), input: 0 };
    pending = sample;
    // after the next paint: a task posted from the frame callback runs once the frame is out
    requestAnimationFrame(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        perf.samples.push({ frame: performance.now() - sample.start, input: sample.input });
      };
      channel.port2.postMessage(null);
    });
  },
  true,
);
window.addEventListener(
  "beforeinput",
  () => {
    inputStart = performance.now();
  },
  true,
);
window.addEventListener("beforeinput", () => {
  if (pending) pending.input += performance.now() - inputStart;
});

function Consumer() {
  const [markdown, setMarkdown] = useState(initial);
  const change = useCallback((text: string) => {
    perf.markdown = text;
    perf.changes += 1;
    setMarkdown(text);
  }, []);
  const ready = useCallback((editor: GoTipeEditor) => {
    perf.editor = editor;
  }, []);
  return <PageEditor markdown={markdown} onChange={change} onReady={ready} locale="en" />;
}

document.body.style.margin = "0";
const root = document.getElementById("root");
if (!root) throw new Error("Typing latency consumer root is missing");
createRoot(root).render(<Consumer />);
