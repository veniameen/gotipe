"use client";

import { useEffect } from "react";
import { figureAt, figureParts } from "./figures";

/** How far the page scrolls before the head turns to glass; it turns back a little higher. */
const SCROLLED_ON = 12;
const SCROLLED_OFF = 4;
/** A figure counts for this long once it comes into view. */
const COUNT_MS = 1400;
/** Blocks start to rise a little before they reach the viewport's bottom edge. */
const REVEAL_MARGIN = "0px 0px -8% 0px";

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * The head's glass: `data-scrolled` on the landing's head past the first few pixels, with
 * hysteresis, so a page resting near the threshold does not flicker between the two.
 */
function followScroll(): () => void {
  const heads = [...document.querySelectorAll<HTMLElement>(".site-head")];
  let frame = 0;
  let scrolled = false;
  const update = () => {
    frame = 0;
    const next = scrolled ? window.scrollY > SCROLLED_OFF : window.scrollY > SCROLLED_ON;
    if (next === scrolled) return;
    scrolled = next;
    for (const head of heads) head.toggleAttribute("data-scrolled", scrolled);
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => {
    window.removeEventListener("scroll", onScroll);
    if (frame) cancelAnimationFrame(frame);
    for (const head of heads) head.removeAttribute("data-scrolled");
  };
}

/** Counts a figure up from zero; the text ends exactly as the server wrote it. */
function count(element: HTMLElement, frames: Set<number>) {
  const text = element.textContent ?? "";
  const parts = figureParts(text);
  if (!parts.some((part) => typeof part === "number" && part > 0)) return;
  const start = performance.now();
  const step = (now: number) => {
    const t = (now - start) / COUNT_MS;
    element.textContent = figureAt(parts, t);
    if (t < 1) frames.add(requestAnimationFrame(step));
    else element.textContent = text;
  };
  frames.add(requestAnimationFrame(step));
}

/**
 * Blocks marked `data-reveal` rise into place as they come into view, once; `data-count` figures
 * count up as they do. Blocks already on screen are shown at once, before the page hides the
 * rest (`data-motion` on <html>), so nothing visible ever blinks out. Without the observer or with
 * reduced motion everything simply stays in place.
 */
function revealOnView(): () => void {
  const root = document.documentElement;
  const frames = new Set<number>();
  const show = (element: Element) => {
    element.setAttribute("data-revealed", "");
    for (const figure of element.querySelectorAll<HTMLElement>("[data-count]"))
      count(figure, frames);
    if (element instanceof HTMLElement && element.hasAttribute("data-count"))
      count(element, frames);
  };
  const targets = [...document.querySelectorAll("[data-reveal]")];
  const viewport = window.innerHeight;
  const later = targets.filter((element) => {
    const box = element.getBoundingClientRect();
    if (box.top < viewport && box.bottom > 0) {
      element.setAttribute("data-revealed", "");
      return false;
    }
    return true;
  });
  root.setAttribute("data-motion", "");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        show(entry.target);
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: REVEAL_MARGIN },
  );
  for (const element of later) observer.observe(element);
  return () => {
    observer.disconnect();
    for (const frame of frames) cancelAnimationFrame(frame);
    root.removeAttribute("data-motion");
  };
}

/**
 * Endless animations (beams, the marquee, carets) run only while their block is on screen:
 * `data-play-ready` on <html> lets the page pause every `data-play` block not `data-playing`.
 */
function playOnView(): () => void {
  const root = document.documentElement;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) entry.target.toggleAttribute("data-playing", entry.isIntersecting);
  });
  for (const element of document.querySelectorAll("[data-play]")) observer.observe(element);
  root.setAttribute("data-play-ready", "");
  return () => {
    observer.disconnect();
    root.removeAttribute("data-play-ready");
  };
}

/** The light under the pointer on cards of a `data-glow` grid: one listener per grid. */
function glowUnderPointer(): () => void {
  const offs: (() => void)[] = [];
  for (const grid of document.querySelectorAll<HTMLElement>("[data-glow]")) {
    let frame = 0;
    let last: PointerEvent | null = null;
    const paint = () => {
      frame = 0;
      if (!last) return;
      for (const card of grid.querySelectorAll<HTMLElement>("[data-glow-card]")) {
        const box = card.getBoundingClientRect();
        card.style.setProperty("--site-mx", `${last.clientX - box.left}px`);
        card.style.setProperty("--site-my", `${last.clientY - box.top}px`);
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      last = event;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    grid.addEventListener("pointermove", move);
    offs.push(() => {
      grid.removeEventListener("pointermove", move);
      if (frame) cancelAnimationFrame(frame);
    });
  }
  return () => {
    for (const off of offs) off();
  };
}

/**
 * The landing's motion, owned in one place: the head's glass, blocks rising into view, figures
 * counting, endless animations paused off screen and the light under the pointer. It renders
 * nothing; the page is complete and readable without it.
 */
export function MotionController() {
  useEffect(() => {
    const offs = [followScroll(), glowUnderPointer()];
    if (typeof IntersectionObserver !== "undefined") {
      offs.push(playOnView());
      if (!reducedMotion()) offs.push(revealOnView());
    }
    return () => {
      for (const off of offs) off();
    };
  }, []);
  return null;
}
