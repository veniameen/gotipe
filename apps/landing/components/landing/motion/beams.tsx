"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  type Tone,
  beatKeyframes,
  cometKeyframes,
  flashKeyframes,
  parseBezier,
  toMs,
} from "./comets";
import { type Cubic, beamCurve, centerOf, pathOf } from "./geometry";

interface Beam {
  key: string;
  curve: Cubic;
  tone: Tone;
  index: number;
}

/** The diagram's beams lit together: the hub under the pointer lights every one. */
const ALL = -1;
/** The stylesheet's ease, should its token be missing (tokens-site.css, --site-ease). */
const EASE = [0.22, 0.61, 0.36, 1] as const;

/** Whether the block plays: the page pauses blocks off screen (motion/controller.tsx). */
function playing(element: HTMLElement): boolean {
  return (
    !document.documentElement.hasAttribute("data-play-ready") ||
    element.hasAttribute("data-playing")
  );
}

/**
 * The stack's motion on the compositor: each comet carried along its beam by transform, each box's
 * flash and the engine's beat, all from one start so they keep time, resting while the block is off
 * screen. None for a reader who asked for less motion. Returns the way to stop it.
 */
function runComets(element: HTMLElement, beams: Beam[], start: { at: number | null }): () => void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  if (typeof element.animate !== "function") return () => {};
  const style = getComputedStyle(element);
  const cycle = toMs(style.getPropertyValue("--site-comet-cycle"), 5600);
  const step = toMs(style.getPropertyValue("--site-comet-step"), 300);
  const easeText = style.getPropertyValue("--site-ease").trim();
  const ease = parseBezier(easeText) ?? EASE;
  const easeOut = style.getPropertyValue("--site-ease-out").trim() || "ease-out";
  const comet = {
    width: Number.parseFloat(style.getPropertyValue("--site-comet-w")) || 0,
    height: Number.parseFloat(style.getPropertyValue("--site-comet-h")) || 0,
  };
  const timing = (order: number): KeyframeAnimationOptions => ({
    duration: cycle,
    delay: order * step,
    iterations: Number.POSITIVE_INFINITY,
  });
  const animations: Animation[] = [];
  const add = (make: () => Animation) => {
    try {
      animations.push(make());
    } catch {
      // a browser without animations of pseudo-elements: that light stays still
    }
  };
  const inCount = beams.filter((beam) => beam.tone === "in").length;
  const comets = element.querySelectorAll<HTMLElement>(".site-comet");
  beams.forEach((beam, index) => {
    const target = comets[index];
    if (!target) return;
    const order = beam.tone === "in" ? beam.index : beam.index - inCount;
    add(() =>
      target.animate(
        cometKeyframes(beam.curve, beam.tone, ease, comet, easeText || "ease"),
        timing(order),
      ),
    );
  });
  for (const box of element.querySelectorAll<HTMLElement>("[data-beam]")) {
    const order = Number(box.style.getPropertyValue("--site-beam-i")) || 0;
    const tone: Tone = box.dataset.beam === "out" ? "out" : "in";
    add(() => box.animate(flashKeyframes(tone), { ...timing(order), pseudoElement: "::after" }));
  }
  const hub = element.querySelector<HTMLElement>("[data-hub]");
  if (hub)
    add(() => hub.animate(beatKeyframes(easeOut), { ...timing(0), pseudoElement: "::after" }));

  // one start for all, kept across measurements: a resize does not restart the cycle
  start.at ??= (document.timeline.currentTime as number | null) ?? 0;
  for (const animation of animations) animation.startTime = start.at;
  const sync = () => {
    const on = playing(element);
    for (const animation of animations) {
      if (on && animation.playState === "paused") animation.play();
      else if (!on && animation.playState === "running") animation.pause();
    }
  };
  sync();
  const watch = new MutationObserver(sync);
  watch.observe(element, { attributes: true, attributeFilter: ["data-playing"] });
  watch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-play-ready"],
  });
  return () => {
    watch.disconnect();
    for (const animation of animations) animation.cancel();
  };
}

/**
 * Beams between the boxes of a diagram: from every `data-beam="in"` box into the `data-hub` box
 * and from the hub out to every `data-beam="out"` box. The boxes are laid out by CSS; the beams
 * follow them on every resize. The diagram runs across (`--site-stack-dir: row`) or down a phone
 * (`column`). Along each beam a comet of light runs: into the hub from the interfaces, out of it to
 * the infrastructure, the boxes flashing as it leaves or arrives (runComets, on the compositor). A
 * box or the hub under the pointer lights its beams and dims the rest. The beams are decoration:
 * the boxes carry the words.
 */
export function Beams({ className, children }: { className: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const start = useRef<{ at: number | null }>({ at: null });
  const [beams, setBeams] = useState<Beam[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [focus, setFocus] = useState<number | null>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const hub = element.querySelector<HTMLElement>("[data-hub]");
      if (!hub) return;
      const middle = centerOf(hub.getBoundingClientRect(), origin);
      const across = getComputedStyle(element).getPropertyValue("--site-stack-dir").trim();
      const axis = across === "column" ? "y" : "x";
      const next: Beam[] = [];
      for (const [index, box] of [
        ...element.querySelectorAll<HTMLElement>("[data-beam]"),
      ].entries()) {
        const tone = box.dataset.beam === "out" ? "out" : "in";
        const point = centerOf(box.getBoundingClientRect(), origin);
        next.push({
          key: `${tone}-${index}`,
          curve: tone === "in" ? beamCurve(point, middle, axis) : beamCurve(middle, point, axis),
          tone,
          index,
        });
      }
      setSize({ width: origin.width, height: origin.height });
      setBeams(next);
    };
    measure();
    // the diagram and every box: a box changes width when the web fonts arrive
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const box of element.querySelectorAll("[data-beam], [data-hub]")) observer.observe(box);
    let live = true;
    document.fonts?.ready.then(() => {
      if (live) measure();
    });

    // the pointer over a box lights its beam, over the hub all of them
    const offs: (() => void)[] = [];
    const watch = (box: Element, index: number) => {
      const enter = () => setFocus(index);
      const leave = () => setFocus(null);
      box.addEventListener("pointerenter", enter);
      box.addEventListener("pointerleave", leave);
      offs.push(() => {
        box.removeEventListener("pointerenter", enter);
        box.removeEventListener("pointerleave", leave);
      });
    };
    element.querySelectorAll("[data-beam]").forEach(watch);
    const hub = element.querySelector("[data-hub]");
    if (hub) watch(hub, ALL);

    return () => {
      live = false;
      observer.disconnect();
      for (const off of offs) off();
    };
  }, []);

  // the comets and the flashes follow the beams: started again on every measurement
  useEffect(() => {
    const element = root.current;
    if (!element || beams.length === 0) return;
    return runComets(element, beams, start.current);
  }, [beams]);

  const lit = (index: number) => focus === ALL || focus === index;
  return (
    <div ref={root} className={className} data-focus={focus === null ? undefined : ""} data-play>
      <svg
        className="site-beams"
        aria-hidden="true"
        focusable="false"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
      >
        {beams.map((beam) => {
          const d = pathOf(beam.curve);
          return (
            <g
              key={beam.key}
              className={`site-beam is-${beam.tone}${lit(beam.index) ? " is-lit" : ""}`}
            >
              <path className="site-beam-path" d={d} />
              <path className="site-beam-glow" d={d} />
            </g>
          );
        })}
      </svg>
      {beams.map((beam) => (
        <span key={beam.key} className={`site-comet is-${beam.tone}`} aria-hidden="true" />
      ))}
      {children}
    </div>
  );
}
