// Text stays on its plate. A line of text lies inside every box that paints something under it — a
// fill, an image, a border all round or a shadow: a tooltip, a menu, a badge, a button, a cell, at
// last the frame — up to the first box placed out of the flow, which may stand anywhere. A plate
// that does not grow with its text — a tooltip with nowrap and max-width (D-98), a menu of fixed
// width — lets the text run past its edge while every element stays in place, so only the text
// shows it. What an `overflow` clip hides does not count, a scroller included, but a scroller cuts
// text only along an axis its rules scroll (`overflow-x`, `overflow-y`, or `overflow` for both): a
// menu list is not cut sideways, a toolbar track does not cut a tooltip below it. Sideways a line
// keeps to the half pixel; its box is taller than its letters, so up and down it may pass a plate
// by a quarter of its font size. Text of pseudo-elements is not measured.

/* Runs inside the page; self-contained because Playwright serialises it. */
export function textOffPlates({ theme }) {
  const problems = [];
  const alpha = (color) => {
    if (color === "transparent") return 0;
    const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color);
    if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
    const rgba = /^rgba\((?:[^,]+,){3}\s*([\d.]+)\)$/.exec(color);
    return rgba ? Number(rgba[1]) : 1;
  };
  const edges = ["Top", "Right", "Bottom", "Left"];
  const paints = (s) =>
    s.display !== "contents" &&
    (alpha(s.backgroundColor) > 0 ||
      s.backgroundImage !== "none" ||
      s.boxShadow !== "none" ||
      edges.every(
        (edge) =>
          s[`border${edge}Style`] !== "none" &&
          Number.parseFloat(s[`border${edge}Width`]) > 0 &&
          alpha(s[`border${edge}Color`]) > 0,
      ));
  /** A box that holds the boxes placed `fixed` inside it, and so the `absolute` ones too. */
  const holdsFixed = (s) =>
    ["transform", "translate", "rotate", "scale", "perspective", "filter", "backdropFilter"].some(
      (property) => s[property] !== "none",
    ) ||
    /transform|perspective|filter/.test(s.willChange) ||
    /layout|paint|strict|content/.test(s.contain);
  const holds = (s, placed) => holdsFixed(s) || (placed === "absolute" && s.position !== "static");
  const scrolls = (value) => value === "auto" || value === "scroll";
  const tag = (el) => {
    const cls = typeof el.className === "string" && el.classList[0] ? `.${el.classList[0]}` : "";
    return `<${el.tagName.toLowerCase()}${cls}>`;
  };
  /** The side and the distance by which the worst of the lines passes the box, if it does. */
  const past = (box, lines, air) => {
    let worst = null;
    for (const r of lines) {
      for (const [side, by, allowed] of [
        ["to the left", box.left - r.left, 0.5],
        ["to the right", r.right - box.right, 0.5],
        ["upwards", box.top - r.top, air],
        ["downwards", r.bottom - box.bottom, air],
      ]) {
        if (by > allowed && by > (worst?.by ?? 0)) worst = { side, by };
      }
    }
    return worst;
  };

  /** Rules that let a box scroll: the selector, nesting resolved, and the axes they name. */
  const scrollRules = [];
  const collect = (rules, parent) => {
    for (const rule of rules) {
      let selector = parent;
      if (rule.selectorText && !parent) selector = rule.selectorText;
      else if (rule.selectorText) {
        const own = rule.selectorText;
        selector = own.includes("&")
          ? own.replaceAll("&", `:is(${parent})`)
          : `:is(${parent}) ${own}`;
      }
      if (selector && rule.style) {
        const x = scrolls(rule.style.overflowX);
        const y = scrolls(rule.style.overflowY);
        if (x || y) scrollRules.push({ selector, x, y });
      }
      if (rule.cssRules) collect(rule.cssRules, selector);
    }
  };
  for (const sheet of document.styleSheets) collect(sheet.cssRules);
  const meant = (el) => {
    const axes = { x: false, y: false };
    for (const { selector, x, y } of scrollRules) {
      if (el.matches(selector)) Object.assign(axes, { x: axes.x || x, y: axes.y || y });
    }
    return axes;
  };

  for (const stage of document.querySelectorAll(".at-stage")) {
    const frame = stage.querySelector(".at-frame");
    if (!frame) continue;
    const name = `#${stage.closest("figure")?.id}/${frame.dataset.frame}/${theme}`;
    const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent;
      const start = text.search(/\S/);
      const parent = node.parentElement;
      // A box with `display: contents` has no box to be seen: the nearest one around it decides.
      let holder = parent;
      while (holder && getComputedStyle(holder).display === "contents")
        holder = holder.parentElement;
      const shown = holder?.checkVisibility({ opacityProperty: true, visibilityProperty: true });
      if (start < 0 || !shown || getComputedStyle(parent).visibility !== "visible") continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, text.trimEnd().length);
      const lines = [...range.getClientRects()].filter((r) => r.width && r.height);
      const said = `«${text.trim().replace(/\s+/g, " ").slice(0, 32)}»`;

      // The plates under the text, and what the clips between the text and the frame leave of it.
      // A box placed out of the flow escapes the clips up to the box that holds it.
      const plates = [];
      const far = Number.POSITIVE_INFINITY;
      const view = { left: -far, right: far, top: -far, bottom: far };
      const seen = () =>
        lines
          .map((r) => ({
            left: Math.max(r.left, view.left),
            right: Math.min(r.right, view.right),
            top: Math.max(r.top, view.top),
            bottom: Math.min(r.bottom, view.bottom),
          }))
          .filter((r) => r.right > r.left && r.bottom > r.top);
      let cut = null;
      let outOfFlow = false;
      let escape = null;
      for (let el = parent; el; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (escape && holds(s, escape)) escape = null;
        if (!outOfFlow && paints(s)) plates.push(el);
        if (!escape && (s.overflowX !== "visible" || s.overflowY !== "visible")) {
          const box = el.getBoundingClientRect();
          const before = seen();
          const axes = scrolls(s.overflowX) || scrolls(s.overflowY) ? meant(el) : null;
          if (scrolls(s.overflowX) && !axes.x) {
            if (before.some((r) => r.left < box.left - 0.5 || r.right > box.right + 0.5))
              cut ??= { el, way: "sideways" };
          }
          if (scrolls(s.overflowY) && !axes.y) {
            if (before.some((r) => r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5))
              cut ??= { el, way: "vertically" };
          }
          if (s.overflowX !== "visible") {
            view.left = Math.max(view.left, box.left);
            view.right = Math.min(view.right, box.right);
          }
          if (s.overflowY !== "visible") {
            view.top = Math.max(view.top, box.top);
            view.bottom = Math.min(view.bottom, box.bottom);
          }
        }
        if (el === frame) break;
        if (s.position === "absolute" || s.position === "fixed") {
          outOfFlow = true;
          if (escape !== "fixed") escape = s.position;
        }
      }
      if (cut) {
        problems.push(
          `${name}: ${said} is cut ${cut.way} by ${tag(cut.el)}, which is not meant to scroll ${cut.way}`,
        );
      }

      const visible = seen();
      const air =
        (Number.parseFloat(getComputedStyle(parent).fontSize) * (parent.currentCSSZoom ?? 1)) / 4;
      for (const plate of plates) {
        const worst = past(plate.getBoundingClientRect(), visible, air);
        if (!worst) continue;
        const by = Math.round(worst.by * 10) / 10;
        problems.push(
          `${name}: ${said} leaves the background of ${tag(plate)} by ${by} px ${worst.side}`,
        );
        break;
      }
    }
  }
  return problems;
}
