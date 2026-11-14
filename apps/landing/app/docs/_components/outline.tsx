"use client";

import type { OutlineItem } from "@/lib/docs/render";
import { useEffect, useState } from "react";

/**
 * The outline of the page's H2 and H3 (the docs view's `gotipe-outline`), the section in view
 * marked as current while the page scrolls.
 */
export function Outline({ items }: { items: OutlineItem[] }) {
  const [current, setCurrent] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null);
    if (!headings.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line =
        Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      let id = headings[0]!.id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top - line <= 8) id = heading.id;
        else break;
      }
      const bottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setCurrent(bottom ? headings[headings.length - 1]!.id : id);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [items]);

  if (!items.length) return null;
  return (
    <nav className="gotipe-outline" aria-label="On this page">
      <p className="gotipe-outline-title">On this page</p>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          data-level={item.level > 1 ? item.level : undefined}
          className={item.id === current ? "is-current" : undefined}
          aria-current={item.id === current ? "location" : undefined}
        >
          {item.text}
        </a>
      ))}
    </nav>
  );
}
