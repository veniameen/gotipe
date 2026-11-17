"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { beamPath, centerOf } from "./geometry";

interface Beam {
  key: string;
  d: string;
  tone: "in" | "out";
  index: number;
}

/** The diagram's beams lit together: the hub under the pointer lights every one. */
const ALL = -1;

/**
 * Beams between the boxes of a diagram: from every `data-beam="in"` box into the `data-hub` box
 * and from the hub out to every `data-beam="out"` box. The boxes are laid out by CSS; the beams
 * follow them on every resize. The diagram runs across (`--site-stack-dir: row`) or down a phone
 * (`column`). Along each beam a comet of light runs (styles/landing/motion.css): into the hub from
 * the interfaces, out of it to the infrastructure, the boxes flashing as it leaves or arrives. A box
 * or the hub under the pointer lights its beams and dims the rest. The beams are decoration: the
 * boxes carry the words.
 */
export function Beams({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
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
          d: tone === "in" ? beamPath(point, middle, axis) : beamPath(middle, point, axis),
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
        {beams.map((beam) => (
          <g
            key={beam.key}
            className={`site-beam is-${beam.tone}${lit(beam.index) ? " is-lit" : ""}`}
          >
            <path className="site-beam-path" d={beam.d} />
            <path className="site-beam-glow" d={beam.d} />
          </g>
        ))}
      </svg>
      {beams.map((beam) => (
        <span
          key={beam.key}
          className={`site-comet is-${beam.tone}`}
          aria-hidden="true"
          style={
            {
              "--site-comet-path": `path("${beam.d}")`,
              "--site-beam-i": beam.tone === "in" ? beam.index : beam.index - countIn(beams),
            } as CSSProperties
          }
        />
      ))}
      {children}
    </div>
  );
}

/** How many beams run into the hub: the out-beams count their place after them. */
function countIn(beams: Beam[]): number {
  return beams.filter((beam) => beam.tone === "in").length;
}
