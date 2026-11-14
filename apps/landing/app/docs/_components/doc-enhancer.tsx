"use client";

import { announce, copyText } from "@/components/site/clipboard";
import { ICON_SPRITE } from "@/components/site/icon";
import { useEffect } from "react";

const TAB_KEY = "gotipe-docs-tab";

function readChoices(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(TAB_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function saveChoice(group: string, label: string) {
  try {
    window.localStorage.setItem(TAB_KEY, JSON.stringify({ ...readChoices(), [group]: label }));
  } catch {
    // storage blocked: the choice holds for this page only
  }
}

/** Shows panel `index` of a tabbed code block. */
function select(block: HTMLElement, index: number, focus: boolean) {
  const tabs = Array.from(block.querySelectorAll<HTMLElement>("[role='tab']"));
  tabs.forEach((tab, n) => {
    const on = n === index;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    tab.classList.toggle("is-on", on);
    const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
    if (panel) panel.hidden = !on;
  });
  for (const title of block.querySelectorAll<HTMLElement>("[data-tab-title]"))
    title.hidden = title.dataset.tabTitle !== String(index);
  if (focus) tabs[index]?.focus();
}

/** Every block of the same group (e.g. the package manager) follows a choice. */
function choose(root: HTMLElement, group: string, label: string, source?: HTMLElement) {
  for (const block of root.querySelectorAll<HTMLElement>(`${STATIC} > [data-tabs]`)) {
    if (block.dataset.tabs !== group) continue;
    const tabs = Array.from(block.querySelectorAll<HTMLElement>("[role='tab']"));
    const index = tabs.findIndex((tab) => tab.dataset.tab === label);
    if (index >= 0) select(block, index, block === source);
  }
}

/** Copies the visible panel's code; the glyph turns to a check for a moment. */
async function copyCode(button: HTMLElement) {
  const block = button.closest(".gotipe-code-block");
  const code = block?.querySelector<HTMLElement>("[data-code-panel]:not([hidden]) code");
  if (!code) return;
  const done = await copyText(code.textContent ?? "");
  announce(done ? "Code copied" : "Copy failed");
  const glyph = button.querySelector("use");
  glyph?.setAttribute("href", `${ICON_SPRITE}#i-${done ? "check-16" : "copy"}`);
  window.setTimeout(() => glyph?.setAttribute("href", `${ICON_SPRITE}#i-copy`), 2000);
}

/** The page's own blocks: the runs of document content, never a live demo between them. */
const STATIC = ".site-doc-editor > .gotipe-content";

/**
 * The behaviour of the page's static HTML: copy buttons, tabs (click, arrows, Home/End, a choice
 * kept for the visit), and a keyboard stop on code and tables that scroll sideways.
 */
export function DocEnhancer({ root }: { root: string }) {
  useEffect(() => {
    const element = document.getElementById(root);
    if (!element) return;
    const choices = readChoices();
    for (const [group, label] of Object.entries(choices)) choose(element, group, label);

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest(".site-demo")) return;
      const copy = target.closest<HTMLElement>("[data-copy-code]");
      if (copy) {
        void copyCode(copy);
        return;
      }
      const tab = target.closest<HTMLElement>("[role='tab']");
      const block = tab?.closest<HTMLElement>("[data-tabs]");
      if (tab && block) {
        choose(element, block.dataset.tabs ?? "", tab.dataset.tab ?? "", block);
        saveChoice(block.dataset.tabs ?? "", tab.dataset.tab ?? "");
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as Element).closest(".site-demo")) return;
      const tab = (event.target as Element).closest<HTMLElement>("[role='tab']");
      const block = tab?.closest<HTMLElement>("[data-tabs]");
      if (!tab || !block) return;
      const tabs = Array.from(block.querySelectorAll<HTMLElement>("[role='tab']"));
      const index = tabs.indexOf(tab);
      const moves: Record<string, number> = {
        ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index - 1 + tabs.length) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      };
      const next = moves[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const label = tabs[next]?.dataset.tab ?? "";
      choose(element, block.dataset.tabs ?? "", label, block);
      saveChoice(block.dataset.tabs ?? "", label);
    };

    const scrollers = () =>
      element.querySelectorAll<HTMLElement>(
        `${STATIC} > .gotipe-code-block pre, ${STATIC} > .gotipe-table-wrapper`,
      );
    const markScrollable = () => {
      for (const box of scrollers()) {
        const wide = box.scrollWidth > box.clientWidth + 1;
        if (wide) {
          box.tabIndex = 0;
          if (!box.getAttribute("aria-label"))
            box.setAttribute("aria-label", box.matches("pre") ? "Code" : "Table");
          box.setAttribute("role", box.matches("pre") ? "region" : "group");
        } else if (box.tabIndex === 0) {
          box.removeAttribute("tabindex");
          box.removeAttribute("role");
          box.removeAttribute("aria-label");
        }
      }
    };
    const observer = new ResizeObserver(markScrollable);
    observer.observe(element);
    element.addEventListener("click", onClick);
    element.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      element.removeEventListener("click", onClick);
      element.removeEventListener("keydown", onKey);
    };
  }, [root]);
  return null;
}
