"use client";

import { useEffect } from "react";
import { figureAt, figureParts } from "./figures";

/** A figure counts for this long once it comes into view. */
const COUNT_MS = 1400;
/** Blocks start to rise a little before they reach the viewport's bottom edge. */
const REVEAL_MARGIN = "0px 0px -8% 0px";

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * The head's glass: `data-scrolled` on the landing's head once the page has scrolled past its first
 * few pixels. A mark as tall as those pixels lies at the page's top (`site-scroll-mark`, site.css);
 * once it is out of view the page has scrolled. An observer, not a scroll listener: scrolling never
 * wakes the page's main thread for it.
 */
function followScroll(): () => void {
  const heads = [...document.querySelectorAll<HTMLElement>(".site-head")];
  if (heads.length === 0 || typeof IntersectionObserver === "undefined") return () => {};
  const mark = document.createElement("div");
  mark.className = "site-scroll-mark";
  mark.setAttribute("aria-hidden", "true");
  document.body.prepend(mark);
  const observer = new IntersectionObserver((entries) => {
    const scrolled = !entries.some((entry) => entry.isIntersecting);
    for (const head of heads) head.toggleAttribute("data-scrolled", scrolled);
  });
  observer.observe(mark);
  return () => {
    observer.disconnect();
    mark.remove();
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

/** A card's light fades out at this share of --site-glow-size (styles/landing/sections.css). */
const GLOW_REACH = 0.4;

/**
 * The light under the pointer on cards of a `data-glow` grid: one listener per grid. Only cards the
 * light reaches are restyled; a card it leaves takes one last place, so its light goes with it.
 */
function glowUnderPointer(): () => void {
  const offs: (() => void)[] = [];
  for (const grid of document.querySelectorAll<HTMLElement>("[data-glow]")) {
    let frame = 0;
    let last: PointerEvent | null = null;
    const cards = [...grid.querySelectorAll<HTMLElement>("[data-glow-card]")];
    const lit = new Set<HTMLElement>();
    const reach = () =>
      (Number.parseFloat(getComputedStyle(grid).getPropertyValue("--site-glow-size")) || 0) *
      GLOW_REACH;
    const paint = () => {
      frame = 0;
      if (!last) return;
      const far = reach();
      for (const card of cards) {
        const box = card.getBoundingClientRect();
        const dx = Math.max(box.left - last.clientX, 0, last.clientX - box.right);
        const dy = Math.max(box.top - last.clientY, 0, last.clientY - box.bottom);
        const near = dx * dx + dy * dy <= far * far;
        if (!near && !lit.has(card)) continue;
        if (near) lit.add(card);
        else lit.delete(card);
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

/** How the light of a call follows: a critically damped spring, and how near the pill's ends it goes. */
const LAMP_STIFFNESS = 170;
const LAMP_DAMPING = 26;
const LAMP_EDGE = 0.08;
const LAMP_STILL = 0.0005;
const LAMP_FRAME = 0.032;

/**
 * The light of a primary call (`[data-lamp]`, styles/site.css) follows a mouse along the pill on a
 * spring and stays where the mouse left it: its position is a share of the pill's width in
 * --site-lamp-x, written on the row the call stands in, so a second call beside it can catch the
 * light; never visited, the light rests near the pill's end. One listener for the page, one frame
 * loop that runs only while a light is moving.
 */
function lampUnderPointer(): () => void {
  const lights = new Map<HTMLElement, { at: number; speed: number; to: number }>();
  let frame = 0;
  let then = 0;
  const step = (now: number) => {
    const dt = Math.min(LAMP_FRAME, Math.max(0, (now - then) / 1000));
    then = now;
    let moving = false;
    for (const [row, light] of lights) {
      if (light.at === light.to && light.speed === 0) continue;
      light.speed += (LAMP_STIFFNESS * (light.to - light.at) - LAMP_DAMPING * light.speed) * dt;
      light.at += light.speed * dt;
      if (Math.abs(light.to - light.at) < LAMP_STILL && Math.abs(light.speed) < LAMP_STILL) {
        light.at = light.to;
        light.speed = 0;
      } else {
        moving = true;
      }
      row.style.setProperty("--site-lamp-x", light.at.toFixed(4));
    }
    frame = moving ? requestAnimationFrame(step) : 0;
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const target = event.target instanceof Element ? event.target : null;
    const lamp = target?.closest<HTMLElement>("[data-lamp]");
    if (!lamp) return;
    const row = lamp.parentElement ?? lamp;
    let light = lights.get(row);
    if (!light) {
      const rest = Number.parseFloat(getComputedStyle(row).getPropertyValue("--site-lamp-x"));
      const at = Number.isFinite(rest) ? rest : 1 - LAMP_EDGE;
      light = { at, speed: 0, to: at };
      lights.set(row, light);
    }
    const box = lamp.getBoundingClientRect();
    if (box.width === 0) return;
    const share = (event.clientX - box.left) / box.width;
    light.to = Math.min(1 - LAMP_EDGE, Math.max(LAMP_EDGE, share));
    if (!frame) {
      then = performance.now();
      frame = requestAnimationFrame(step);
    }
  };
  document.addEventListener("pointermove", move, { passive: true });
  return () => {
    document.removeEventListener("pointermove", move);
    if (frame) cancelAnimationFrame(frame);
    for (const row of lights.keys()) row.style.removeProperty("--site-lamp-x");
    lights.clear();
  };
}

/**
 * The landing's motion, owned in one place: the head's glass, blocks rising into view, figures
 * counting, endless animations paused off screen, the light under the pointer and the lamps of
 * the calls. It renders
 * nothing; the page is complete and readable without it.
 */
export function MotionController() {
  useEffect(() => {
    const offs = [followScroll(), glowUnderPointer()];
    if (!reducedMotion()) offs.push(lampUnderPointer());
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
