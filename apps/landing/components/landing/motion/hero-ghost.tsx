"use client";

import { useEffect, useRef } from "react";
import { Icon } from "../../site/icon";

/**
 * The editor beneath the first stage: pieces of GoTipe's own interface (the block menu, a comment
 * thread, the versions, Markdown, a table, the bubble toolbar) lie under the nebula, out of sight.
 * Under the pointer they come up, softly, in a round of light that follows it; when the pointer
 * leaves they sink back. Decoration, hidden from assistive technology; wide screens only (the copy
 * fills a phone's stage); none for a reader who asked for less motion or for touch.
 */
export function HeroGhost() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = layer.current;
    const stage = element?.parentElement;
    if (!element || !stage) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const box = element.getBoundingClientRect();
      element.style.setProperty("--site-ghost-x", `${event.clientX - box.left}px`);
      element.style.setProperty("--site-ghost-y", `${event.clientY - box.top}px`);
      element.setAttribute("data-lit", "");
    };
    const leave = () => element.removeAttribute("data-lit");
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerleave", leave);
    return () => {
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div ref={layer} className="site-ghost" aria-hidden="true">
      <div className="site-ghost-card is-menu">
        <p className="site-ghost-label">Blocks</p>
        <p className="site-ghost-row is-on">
          <span className="site-ghost-key">T</span>Text
        </p>
        <p className="site-ghost-row">
          <span className="site-ghost-key">H1</span>Heading 1
        </p>
        <p className="site-ghost-row">
          <span className="site-ghost-key">H2</span>Heading 2
        </p>
        <p className="site-ghost-row">
          <Icon name="check" />
          To-do list
        </p>
        <p className="site-ghost-row">
          <Icon name="braces" />
          Code block
        </p>
        <p className="site-ghost-row">
          <Icon name="layers" />
          Table
        </p>
      </div>
      <div className="site-ghost-card is-source">
        <p># Launch notes</p>
        <p>
          Everything **syncs** live.
          <span className="site-ghost-caret" />
        </p>
        <p>- [x] Engine compiles to WASM</p>
        <p>- [ ] Cut the release note</p>
        <p>&gt; Markdown stays intact.</p>
      </div>
      <div className="site-ghost-card is-table">
        <p className="site-ghost-cells is-head">
          <span>Area</span>
          <span>Owner</span>
          <span>Status</span>
        </p>
        <p className="site-ghost-cells">
          <span>Docs</span>
          <span>Ana</span>
          <span>done</span>
        </p>
        <p className="site-ghost-cells">
          <span>Engine</span>
          <span>Lev</span>
          <span>review</span>
        </p>
      </div>
      <div className="site-ghost-card is-thread">
        <p className="site-ghost-who">
          <span className="site-ghost-face">A</span>Ana<span className="site-ghost-when">2m</span>
        </p>
        <p>Keep this paragraph byte for byte.</p>
        <p className="site-ghost-who">
          <span className="site-ghost-face is-second">L</span>Lev
          <span className="site-ghost-when">now</span>
        </p>
        <p>Done, only the block I touched changed.</p>
      </div>
      <div className="site-ghost-card is-versions">
        <p className="site-ghost-label">Versions</p>
        <p className="site-ghost-row is-on">
          <Icon name="restore" />
          Today, 12:40<span className="site-ghost-when">Ana</span>
        </p>
        <p className="site-ghost-row">
          <Icon name="restore" />
          Yesterday<span className="site-ghost-when">Lev</span>
        </p>
        <p className="site-ghost-row">
          <Icon name="restore" />
          Monday<span className="site-ghost-when">Ana</span>
        </p>
      </div>
      <div className="site-ghost-bar">
        <Icon name="bold" />
        <Icon name="italic" />
        <Icon name="link" />
        <Icon name="comment" />
      </div>
      <p className="site-ghost-cursor">
        <span className="site-ghost-flag">Lev</span>
      </p>
    </div>
  );
}
