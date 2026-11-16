"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { beamPath, centerOf } from "./geometry";

interface Beam {
  key: string;
  d: string;
  tone: "in" | "out";
  index: number;
}

/**
 * Beams between the boxes of a diagram: from every `data-beam="in"` box into the `data-hub` box
 * and from the hub out to every `data-beam="out"` box. The boxes are laid out by CSS; the beams
 * follow them on every resize. The diagram runs across (`--site-stack-dir: row`) or down a phone
 * (`column`). The beams are decoration: the boxes carry the words.
 */
export function Beams({ className, children }: { className: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [beams, setBeams] = useState<Beam[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });

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
    return () => {
      live = false;
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={root} className={className} data-play>
      <svg
        className="site-beams"
        aria-hidden="true"
        focusable="false"
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}
      >
        {beams.map((beam) => (
          <g key={beam.key} className={`site-beam is-${beam.tone}`}>
            <path className="site-beam-path" d={beam.d} />
            <path
              className="site-beam-pulse"
              d={beam.d}
              pathLength={100}
              style={{ "--site-beam-i": beam.index } as CSSProperties}
            />
          </g>
        ))}
      </svg>
      {children}
    </div>
  );
}
