"use client";

/**
 * The site's one way to copy text and to say so. `copyText` takes the text or a promise of it
 * (a page's Markdown is fetched on the click: Safari keeps the click's permission only for a
 * ClipboardItem built at once). `announce` speaks through one polite live region of the page,
 * which assistive technology reads; changing a button's label alone is not announced.
 */

export async function copyText(text: string | Promise<string>): Promise<boolean> {
  try {
    if (
      typeof text !== "string" &&
      typeof ClipboardItem !== "undefined" &&
      navigator.clipboard?.write
    ) {
      const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    } else await navigator.clipboard.writeText(await text);
    return true;
  } catch {
    return false;
  }
}

let region: HTMLElement | null = null;
let clear = 0;

/** Says `message` once, politely; the region empties itself so a repeat is said again. */
export function announce(message: string): void {
  if (!region?.isConnected) {
    region = document.createElement("div");
    region.className = "site-sr";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("role", "status");
    document.body.append(region);
  }
  const target = region;
  window.clearTimeout(clear);
  target.textContent = "";
  // a new text node after a tick, so a second «Copied» is announced as well
  window.setTimeout(() => {
    target.textContent = message;
  }, 50);
  clear = window.setTimeout(() => {
    target.textContent = "";
  }, 3000);
}
