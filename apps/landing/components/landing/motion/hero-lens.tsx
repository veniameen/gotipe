"use client";

import { useEffect, useRef } from "react";
import { LENS_TYPING, approach, readLines } from "./lens-content";
import {
  type LensColours,
  MONO,
  NARROW,
  type PlacedLine,
  ROW,
  calmLane,
  fieldLeftAt,
  paintCodeGrounds,
  paintDocumentLine,
  paintSourceLine,
  placeLines,
  readLensColours,
} from "./lens-paint";

/** The layers' pixel density at most: text stays sharp, memory stays sane. */
const MAX_RATIO = 1.5;
/** The lens magnifies the document a little, as a lens does. */
const ZOOM = 1.06;
/** How fast the lens follows the pointer and returns to its round (per second). */
const FOLLOW = 7;
/** One round of the lens about the headline, in seconds. */
const ROUND = 48;
/** The typed line: a character, an erased character, the pauses; the caret's blink. */
const TYPE_MS = 85;
const ERASE_MS = 32;
const HOLD_MS = 2200;
const REST_MS = 600;
const BLINK_MS = 1100;

type Phase = "type" | "hold" | "erase" | "rest";

/**
 * The first stage's background: the Markdown source of a few files, dim, and a lens that shows the
 * same lines as the document they become — under the pointer, or making its own round about the
 * headline when there is none (a phone's copy fills the stage: there it waits for a pointer). One
 * of the lines is being typed. The two layers are painted once
 * into their own canvases; a frame draws the source, the caret and the lens. Decoration: hidden from
 * assistive technology, no pointer events of its own; it draws only while on screen in a visible
 * tab, and for a reader who asked for less motion it is one still picture.
 */
export function HeroLens() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const stage = element?.parentElement?.parentElement;
    const ctx = element?.getContext("2d");
    const source = document.createElement("canvas");
    const documentLayer = document.createElement("canvas");
    const sctx = source.getContext("2d");
    const dctx = documentLayer.getContext("2d");
    if (!element || !stage || !ctx || !sctx || !dctx) return;

    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let colours: LensColours | null = readLensColours(element);
    let width = 0;
    let height = 0;
    let ratio = 1;
    let charWidth = 7.2;
    let lines: PlacedLine[] = [];
    let live: PlacedLine | null = null;
    let frame = 0;
    let last = 0;
    let clock = 0;
    let onScreen = false;
    const lens = { x: 0, y: 0, placed: false };
    const pointer = { x: 0, y: 0, here: false };
    const typing = { sentence: 0, length: 0, phase: "type" as Phase, wait: 0 };

    /** Where the lens goes without a pointer: an oval round about the copy. */
    const roundAt = (time: number) => {
      const screen = Math.min(height, 900);
      const angle = (time / ROUND) * Math.PI * 2 + Math.PI;
      return {
        x: width / 2 + width * 0.4 * Math.cos(angle),
        y: screen * 0.44 + screen * 0.34 * Math.sin(angle),
      };
    };
    const radius = () => Math.min(170, Math.max(96, width * 0.12));

    const liveText = () => (LENS_TYPING[typing.sentence] ?? "").slice(0, typing.length);

    /** The typed line in both layers: its row cleared and painted again. */
    const paintLive = () => {
      if (!live || !colours) return;
      const text = liveText();
      live.source = text;
      live.read = readLines([text])[0] ?? live.read;
      for (const [layer, paint] of [
        [sctx, paintSourceLine],
        [dctx, paintDocumentLine],
      ] as const) {
        layer.save();
        layer.setTransform(ratio, 0, 0, ratio, 0, 0);
        layer.beginPath();
        layer.rect(live.x - 6, live.y, live.width + 12, ROW);
        layer.clip();
        layer.clearRect(live.x - 6, live.y, live.width + 12, ROW);
        paint(layer, live, colours, charWidth);
        if (layer === sctx) calmLane(layer, width, height);
        layer.restore();
      }
    };

    /** Both layers from scratch: on start, on resize, when the fonts or the theme change. */
    const paintLayers = () => {
      width = element.clientWidth;
      height = element.clientHeight;
      ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
      for (const layer of [element, source, documentLayer]) {
        layer.width = Math.max(1, Math.round(width * ratio));
        layer.height = Math.max(1, Math.round(height * ratio));
      }
      if (!colours) return;
      sctx.font = MONO;
      charWidth = sctx.measureText("0").width || charWidth;
      lines = placeLines(width, height, charWidth);
      // the live line: an empty line from the ninth row of the leftmost column that starts on
      // the stage, so the typed text never cuts into a code block's ground
      const columns = [...new Set(lines.filter((line) => line.x >= 0).map((line) => line.column))];
      const first = columns[0];
      live =
        lines.find(
          (line) => line.column === first && line.y >= ROW * 8 && line.read.kind === "blank",
        ) ?? null;
      for (const [layer, paint] of [
        [sctx, paintSourceLine],
        [dctx, paintDocumentLine],
      ] as const) {
        layer.setTransform(ratio, 0, 0, ratio, 0, 0);
        layer.clearRect(0, 0, width, height);
        layer.textBaseline = "alphabetic";
        if (layer === dctx) paintCodeGrounds(layer, lines, colours);
        for (const line of lines) if (line !== live) paint(layer, line, colours, charWidth);
      }
      calmLane(sctx, width, height);
      if (still) typing.length = (LENS_TYPING[0] ?? "").length;
      paintLive();
      if (!lens.placed) {
        const start = still ? { x: width * 0.16, y: Math.min(height, 900) * 0.36 } : roundAt(clock);
        lens.x = start.x;
        lens.y = start.y;
        lens.placed = true;
      }
    };

    const draw = (now: number) => {
      if (!colours) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, element.width, element.height);
      ctx.drawImage(source, 0, 0);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      // the caret of the typed line
      if (live && (still || Math.floor(now / (BLINK_MS / 2)) % 2 === 0)) {
        const x = live.x + liveText().length * charWidth + 1;
        ctx.globalAlpha = fieldLeftAt(x, live.y + ROW / 2, width, height);
        ctx.fillStyle = colours.accent;
        ctx.fillRect(x, live.y + 4, 1.5, ROW - 8);
        ctx.globalAlpha = 1;
      }
      // the lens: the document under the glass, a little larger; on a narrow stage only under a
      // pointer, its round would cross the copy
      if (width < NARROW && !pointer.here) {
        element.setAttribute("data-ready", "");
        return;
      }
      const r = radius();
      ctx.save();
      ctx.beginPath();
      ctx.arc(lens.x, lens.y, r, 0, Math.PI * 2);
      ctx.shadowColor = colours.ring;
      ctx.shadowBlur = 28;
      ctx.fillStyle = colours.fill;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.clip();
      ctx.translate(lens.x, lens.y);
      ctx.scale(ZOOM, ZOOM);
      ctx.translate(-lens.x, -lens.y);
      ctx.drawImage(documentLayer, 0, 0, width, height);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(lens.x, lens.y, r, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = colours.ring;
      ctx.stroke();
      element.setAttribute("data-ready", "");
    };

    const advanceTyping = (ms: number) => {
      typing.wait -= ms;
      while (typing.wait <= 0) {
        const sentence = LENS_TYPING[typing.sentence] ?? "";
        if (typing.phase === "type") {
          typing.length += 1;
          typing.wait += TYPE_MS * (0.6 + Math.random() * 0.8);
          if (typing.length >= sentence.length) typing.phase = "hold";
        } else if (typing.phase === "hold") {
          typing.phase = "erase";
          typing.wait += HOLD_MS;
        } else if (typing.phase === "erase") {
          typing.length -= 1;
          typing.wait += ERASE_MS;
          if (typing.length <= 0) typing.phase = "rest";
        } else {
          typing.phase = "type";
          typing.sentence = (typing.sentence + 1) % LENS_TYPING.length;
          typing.wait += REST_MS;
        }
        paintLive();
      }
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      clock += dt;
      const target = pointer.here ? pointer : roundAt(clock);
      lens.x = approach(lens.x, target.x, dt, pointer.here ? FOLLOW : FOLLOW / 4);
      lens.y = approach(lens.y, target.y, dt, pointer.here ? FOLLOW : FOLLOW / 4);
      advanceTyping(dt * 1000);
      draw(now);
      schedule();
    };
    function schedule() {
      if (still || frame || !onScreen || document.hidden) return;
      frame = requestAnimationFrame(tick);
    }
    const pause = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };
    const redraw = () => {
      paintLayers();
      draw(performance.now());
    };

    // the pointer, in the canvas's space; a touch has no hover, the lens keeps its round
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = element.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
      pointer.here = true;
    };
    const onLeave = () => {
      pointer.here = false;
    };
    if (!still) {
      stage.addEventListener("pointermove", onMove);
      stage.addEventListener("pointerleave", onLeave);
    }
    const resize = new ResizeObserver(redraw);
    resize.observe(element);
    const view = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) schedule();
      else pause();
    });
    view.observe(element);
    const onVisibility = () => (document.hidden ? pause() : schedule());
    document.addEventListener("visibilitychange", onVisibility);
    const theme = new MutationObserver(() => {
      colours = readLensColours(element);
      redraw();
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) redraw();
    });

    redraw();
    schedule();

    return () => {
      alive = false;
      pause();
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      resize.disconnect();
      view.disconnect();
      theme.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      element.removeAttribute("data-ready");
    };
  }, []);

  return (
    <div className="site-hero-lens" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
