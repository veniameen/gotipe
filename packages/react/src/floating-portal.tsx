import { type CSSProperties, type ReactNode, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Floating UI escapes layout containment while retaining host-scoped theme tokens. */
export function FloatingPortal({
  owner,
  children,
}: { owner: HTMLElement | null; children: ReactNode }) {
  const [style, setStyle] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!owner) return;
    const win = owner.ownerDocument.defaultView;
    if (!win) return;
    const update = () => {
      const computed = win.getComputedStyle(owner);
      const tokens: Record<string, string> = {};
      for (let index = 0; index < computed.length; index++) {
        const name = computed.item(index);
        if (name.startsWith("--gt-")) tokens[name] = computed.getPropertyValue(name);
      }
      setStyle({
        ...tokens,
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontFeatureSettings: computed.fontFeatureSettings,
        lineHeight: computed.lineHeight,
        letterSpacing: computed.letterSpacing,
        color: computed.color,
        colorScheme: computed.colorScheme,
        direction: computed.direction === "rtl" ? "rtl" : "ltr",
      });
    };
    update();
    const observer = new MutationObserver(update);
    for (let ancestor: HTMLElement | null = owner; ancestor; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: ["style", "class", "data-theme", "data-gotipe-theme"],
      });
    }
    const theme = win.matchMedia?.("(prefers-color-scheme: dark)");
    theme?.addEventListener("change", update);
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    resize?.observe(owner);
    win.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      resize?.disconnect();
      win.removeEventListener("resize", update);
      theme?.removeEventListener("change", update);
    };
  }, [owner]);
  return owner
    ? createPortal(
        <div
          data-gotipe-floating-root=""
          data-theme={
            style.colorScheme === "dark" || style.colorScheme === "light"
              ? style.colorScheme
              : undefined
          }
          style={style}
        >
          {children}
        </div>,
        owner.ownerDocument.body,
      )
    : null;
}
