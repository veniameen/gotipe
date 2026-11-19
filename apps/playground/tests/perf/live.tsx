import { PageEditor } from "@gotipe/block-editor";
import type { GoTipeEditor } from "@gotipe/core";
import type { LaneCursor, ReviewLane, ReviewProposal } from "@gotipe/suggestions";
import { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "@gotipe/theme/page.css";
import { largePage } from "./large-page";

/**
 * A technical consumer for `scripts/perf/live-review.mjs`: a `PageEditor` on a generated page
 * (`?sections=236` is about 258 KiB and 7,384 blocks) whose review holds `writers` growing
 * proposals, each with a cursor. `start()` grows every text `rate` times a second for `seconds`:
 * all in one update (`batched`), or each on its own beat (`staggered`). It records, per update,
 * the time to the first frame after it, and every frame's length while the texts grow. A text
 * is a section of many blocks, or with `?text=paragraph` one long paragraph: it grows without
 * a new block coming to the page.
 */
interface LiveRun {
  /** Time from an update to the first frame after it, per update. */
  updates: number[];
  /** Length of every frame while the texts grew. */
  frames: number[];
  /** Characters of the proposals' texts, and of them shown on the page at the end. */
  written: number;
  shown: number;
}

declare global {
  interface Window {
    __GOTIPE_LIVE__: {
      editor: GoTipeEditor | null;
      start(mode: "batched" | "staggered", rate: number, seconds: number): Promise<LiveRun>;
      /** Makes every proposal an ordinary one, as a host does when the writing ends. */
      settle(): void;
    };
  }
}

const params = new URLSearchParams(location.search);
const sections = Number(params.get("sections") ?? 236);
const writers = Number(params.get("writers") ?? 4);
const initial = largePage(sections);
const first = Math.max(1, Math.floor(sections / 2) - 1);

const LANES: ReviewLane[] = Array.from({ length: writers }, (_, index) => ({
  id: `writer-${index}`,
  name: `Writer ${index + 1}`,
  kind: "agent",
  color: `var(--gt-track-${(index % 4) + 1})`,
}));

/**
 * The text a writer will have written, after one of the page's sections: a section of its own
 * (headings, paragraphs, lists, a table, code), or one paragraph of the same length.
 */
const TEXTS = LANES.map((_, index) => {
  const page = largePage(2, 4242 + index);
  const section = page.slice(page.indexOf("## Section 1")).trimEnd();
  if (params.get("text") !== "paragraph") return `\n\n${section}`;
  return `\n\n${section.replace(/[^\p{L}\p{N}]+/gu, " ").trim()}.`;
});

/** After the last paragraph of section `first + index`: the anchor names the next heading. */
const PLACES = LANES.map((_, index) => {
  const next = `\n\n## Section ${first + index + 1}:`;
  const at = initial.indexOf(next);
  if (at < 0) throw new Error("The generated page has no such section");
  return { before: initial.slice(Math.max(0, at - 60), at), quote: "", after: next };
});

const proposalsOf = (lengths: number[], live: boolean): ReviewProposal[] =>
  LANES.map((lane, index) => ({
    id: `live-${index}`,
    laneId: lane.id,
    live,
    order: index,
    edits: [{ ...PLACES[index]!, text: TEXTS[index]!.slice(0, lengths[index]) }],
  }));

const CURSORS: LaneCursor[] = LANES.map((lane, index) => ({
  laneId: lane.id,
  id: `cursor-${index}`,
  proposalId: `live-${index}`,
  label: "Writing",
}));

let apply: (lengths: number[], live: boolean) => void = () => {};

/** Resolves after the frame that follows this call is out. */
const afterFrame = () =>
  new Promise<number>((resolve) => {
    requestAnimationFrame(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve(performance.now());
      channel.port2.postMessage(null);
    });
  });

function start(mode: "batched" | "staggered", rate: number, seconds: number): Promise<LiveRun> {
  const steps = Math.max(1, Math.round(rate * seconds));
  const lengths = LANES.map(() => 0);
  const run: LiveRun = { updates: [], frames: [], written: 0, shown: 0 };
  const pending: Promise<void>[] = [];
  let growing = true;
  let last = performance.now();
  const frame = (now: number) => {
    run.frames.push(now - last);
    last = now;
    if (growing) requestAnimationFrame(frame);
  };
  requestAnimationFrame((now) => {
    last = now;
    requestAnimationFrame(frame);
  });
  const grow = (which: number[], step: number) => {
    for (const index of which)
      lengths[index] = Math.ceil((TEXTS[index]!.length * (step + 1)) / steps);
    const began = performance.now();
    apply([...lengths], true);
    pending.push(
      afterFrame().then((out) => {
        run.updates.push(out - began);
      }),
    );
  };
  return new Promise((resolve) => {
    const period = 1000 / rate;
    const beats =
      mode === "batched" ? [LANES.map((_, index) => index)] : LANES.map((_, index) => [index]);
    const began = performance.now();
    let left = beats.length;
    beats.forEach((which, beat) => {
      let step = 0;
      const offset = (period * beat) / beats.length;
      const tick = () => {
        grow(which, step);
        step += 1;
        if (step < steps) {
          setTimeout(tick, Math.max(0, began + offset + step * period - performance.now()));
          return;
        }
        left -= 1;
        if (left > 0) return;
        void Promise.all(pending).then(async () => {
          growing = false;
          await afterFrame();
          run.written = TEXTS.reduce((sum, text) => sum + text.trim().length, 0);
          run.shown = Array.from(
            document.querySelectorAll("[data-gotipe-proposal]:not([data-gotipe-proposal] *)"),
          ).reduce((sum, element) => sum + (element.textContent ?? "").length, 0);
          resolve(run);
        });
      };
      setTimeout(tick, offset);
    });
  });
}

const perf: Window["__GOTIPE_LIVE__"] = {
  editor: null,
  start,
  settle: () =>
    apply(
      TEXTS.map((text) => text.length),
      false,
    ),
};
window.__GOTIPE_LIVE__ = perf;

function Consumer() {
  const [state, setState] = useState({ lengths: LANES.map(() => 0), live: true });
  apply = useCallback((lengths: number[], live: boolean) => setState({ lengths, live }), []);
  const proposals = useMemo(() => proposalsOf(state.lengths, state.live), [state]);
  const review = useMemo(() => ({ lanes: LANES, proposals, cursors: CURSORS }), [proposals]);
  const ready = useCallback((editor: GoTipeEditor) => {
    perf.editor = editor;
  }, []);
  return (
    <PageEditor
      markdown={initial}
      onReady={ready}
      locale="en"
      review={review}
      reviewLayout="inline"
      reviewBar={{ title: "Writing" }}
    />
  );
}

document.body.style.margin = "0";
const root = document.getElementById("root");
if (!root) throw new Error("Live review consumer root is missing");
createRoot(root).render(<Consumer />);
