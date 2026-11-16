/**
 * What the visual audit measures in the page. `installProbe` runs in the browser and must not
 * reach anything outside itself: Playwright sends its source, not its closure.
 */

import type { AuditTarget } from "./document";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
/** Something drawn in the editor: text, a box, a marker, an icon, a control. */
export interface Hit {
  kind: string;
  box: Box;
  text?: string;
}
export interface HandleProbe {
  /** The hovered block exists. */
  found: boolean;
  /** The handle is drawn: «+» and the grip. */
  visible: boolean;
  /** The block the grip moves (`data-block-drag`) and the block it should move. */
  drag: string | null;
  unit: string | null;
  buttons: Box[];
  /** What the handle's buttons cover. */
  hits: Hit[];
  /** The first line the handle belongs to; null for a block without text of its own. */
  line: Box | null;
  block: Box;
  editor: Box;
  /** The viewport cut by every clipping container of the handle. */
  area: Box;
}
export interface ControlProbe {
  /** The row handle of a hovered cell, or the column handle of a hovered header. */
  name: string;
  visible: boolean;
  box: Box | null;
  /** Text the control covers. */
  hits: Hit[];
  /** The room it must stay in: its row's left margin, or its header cell. */
  room: Box;
  area: Box;
}
export interface LayoutProbe {
  /** Scrolling containers around the editor (the page included) that scroll sideways. */
  scrollers: { name: string; scrollWidth: number; clientWidth: number }[];
  /** Elements of the editor that stand outside it, outside a container that scrolls. */
  overflow: { name: string; box: Box }[];
  editor: Box;
  /** Columns: each column's box and the boxes of their text. */
  columns: { box: Box; columns: { box: Box; text: Box[] }[] }[];
  /** The page's head, counter and quick blocks that do not start where the text column does. */
  misaligned: { name: string; left: number; column: number }[];
}

declare global {
  interface Window {
    __visualAudit?: {
      prepare(target: AuditTarget, align?: "center" | "end"): { x: number; y: number } | null;
      handle(target: AuditTarget): HandleProbe;
      controls(target: AuditTarget): ControlProbe[];
      layout(): LayoutProbe;
      /** Scrolls an element of `selector` (without one, the first overflow) to mid-screen. */
      reveal(selector: string, index?: number): void;
      menu(selector: string): Box | null;
      textPoint(target: AuditTarget, end: boolean): { x: number; y: number } | null;
      draw(boxes: { box: Box; color: string; label?: string }[]): void;
      erase(): void;
    };
  }
}

export function installProbe() {
  type B = { left: number; top: number; right: number; bottom: number };
  type T = {
    type: string;
    text?: string;
    index?: number;
    empty?: boolean;
    unit?: string;
    line?: string;
    at?: string;
  };
  const IGNORED = [
    ".gotipe-block-toolbar-wrapper",
    ".gotipe-block-toolbar-tooltip",
    "[data-gotipe-context-menu]",
    "[data-gotipe-slash-menu]",
    "[data-gotipe-bubble-menu]",
    ".gotipe-tip",
    ".gotipe-sr-only",
    ".gotipe-drop-indicator",
    "[data-visual-audit]",
  ].join(", ");
  /** Text of a control or a widget is not the block's own; a cell is editable inside its table. */
  const widget = (element: Element) =>
    element
      .closest("[contenteditable], [data-gotipe-widget], button, select, input, textarea")
      ?.getAttribute("contenteditable") !== "true";
  const box = (rect: DOMRectReadOnly | B): B => ({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  });
  const crosses = (a: B, b: B) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
  const shown = (element: Element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const check = (element as Element & { checkVisibility?: (options: object) => boolean })
      .checkVisibility;
    if (check) return check.call(element, { opacityProperty: true, visibilityProperty: true });
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    }
    return true;
  };
  /** What `layout` found sticking out of the editor: `reveal("")` shows the first. */
  let offenders: Element[] = [];
  const editorRoot = () =>
    document.querySelector<HTMLElement>("[data-gotipe-block-editor]") ??
    (document.querySelector(".gotipe-editor") as HTMLElement);
  const blockOf = (node: Node) => node.parentElement?.closest("[data-block-id]") ?? null;

  /** Text nodes of the block itself: not of a nested block, a control or a hidden label. */
  const ownText = (block: Element, editable: boolean) => {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim() || blockOf(node) !== block) continue;
      if (parent.closest(IGNORED) || (editable && widget(parent))) continue;
      nodes.push(node as Text);
    }
    return nodes;
  };
  /** The boxes of a text's words: a pre-wrap line's trailing space hangs past its box. */
  const rectsOf = (node: Text) => {
    const rects: DOMRect[] = [];
    const range = document.createRange();
    for (const word of (node.textContent ?? "").matchAll(/\S+/g)) {
      range.setStart(node, word.index ?? 0);
      range.setEnd(node, (word.index ?? 0) + word[0].length);
      for (const rect of range.getClientRects())
        if (rect.width > 0 && rect.height > 0) rects.push(rect);
    }
    return rects;
  };
  const textOf = (element: Element) =>
    ownText(element, false)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
  const find = (target: T): HTMLElement | null => {
    const all = Array.from(
      editorRoot()?.querySelectorAll<HTMLElement>(`[data-block-type="${target.type}"]`) ?? [],
    );
    if (target.empty) return all.find((element) => textOf(element) === "") ?? null;
    if (!target.text) return all[target.index ?? 0] ?? null;
    return all.find((element) => textOf(element).startsWith(target.text ?? "")) ?? null;
  };
  /** A block that runs from the right starts at its right edge. */
  const rightToLeft = (element: Element) => getComputedStyle(element).direction === "rtl";
  /** Laid out, even if transparent: a formula's TeX stays in place over its drawing. */
  const laidOut = (element: Element) =>
    element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== "hidden";
  type Lead = { box: B; row: boolean; editable: boolean };
  /**
   * Where a block starts, as a reader sees it: the first of its own editable text and pictures in
   * document order (a picture starts the block's top row: an image above its caption, a formula's
   * TeX below its label); else the caret line of an empty block; else its first nested block (a
   * table's first cell); else the first text or field it shows (a file's name, a link field).
   */
  const lead = (block: Element): Lead | null => {
    let seen: Lead | null = null;
    const visit = (element: Element): Lead | null => {
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          const first = rectsOf(child as Text)[0];
          if (!first || element.closest(IGNORED)) continue;
          if (!widget(element) && laidOut(element))
            return { box: box(first), row: false, editable: true };
          if (shown(element)) seen ??= { box: box(first), row: false, editable: false };
          continue;
        }
        if (!(child instanceof Element) || child.hasAttribute("data-block-id")) continue;
        if (child.matches(`${IGNORED}, [aria-hidden="true"]`)) continue;
        if (child.matches("button, input, textarea, select")) {
          if (shown(child))
            seen ??= { box: box(child.getBoundingClientRect()), row: false, editable: false };
          continue;
        }
        if (child.matches("img, video, iframe, canvas, hr")) {
          if (shown(child))
            return { box: box(child.getBoundingClientRect()), row: true, editable: false };
          continue;
        }
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    const found = visit(block);
    if (found) return found;
    const caret = Array.from(block.querySelectorAll("br")).find(
      (br) => br.closest("[data-block-id]") === block && !widget(br) && laidOut(br),
    );
    if (caret) return { box: box(caret.getBoundingClientRect()), row: false, editable: true };
    const nested = block.querySelector("[data-block-id]");
    return (nested && lead(nested)) ?? seen;
  };
  /** The line the handle stands at: the lead's, a picture's top row, or the block's top row. */
  const firstLine = (block: Element): B | null => {
    const found = lead(block);
    if (!found || !found.row) return found?.box ?? null;
    const row = Math.min(found.box.bottom - found.box.top, 24);
    return { ...found.box, bottom: found.box.top + row };
  };
  const unitOf = (element: HTMLElement, target: T) => {
    const around = { table: "table", columns: "columns", toggle: "toggle" }[target.unit ?? ""];
    return around ? element.closest(`[data-block-type="${around}"]`) : element;
  };
  /** The viewport cut by every ancestor of `element` that clips. */
  const visibleArea = (element: Element): B => {
    let area: B = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      if (style.overflowX !== "visible")
        area = {
          ...area,
          left: Math.max(area.left, rect.left),
          right: Math.min(area.right, rect.right),
        };
      if (style.overflowY !== "visible")
        area = {
          ...area,
          top: Math.max(area.top, rect.top),
          bottom: Math.min(area.bottom, rect.bottom),
        };
    }
    return area;
  };

  /** Everything drawn in the editor that meets `band`: text, controls, pictures, list markers. */
  const drawn = (root: HTMLElement, band: B): { kind: string; box: B; text?: string }[] => {
    const out: { kind: string; box: B; text?: string }[] = [];
    const near = (rect: B) => rect.bottom > band.top && rect.top < band.bottom;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !node.textContent?.trim() || parent.closest(IGNORED) || !shown(parent))
        continue;
      for (const rect of rectsOf(node as Text))
        if (near(rect))
          out.push({ kind: "text", box: box(rect), text: node.textContent.trim().slice(0, 32) });
    }
    const graphics = "input, select, img, svg, hr, button, math, .gotipe-callout-icon";
    for (const element of root.querySelectorAll(graphics)) {
      if (element.closest(IGNORED) || !shown(element)) continue;
      const rect = element.getBoundingClientRect();
      if (!near(rect)) continue;
      const kind =
        element instanceof HTMLInputElement
          ? element.type
          : element.closest(".gotipe-callout-icon")
            ? "callout icon"
            : element.tagName.toLowerCase();
      out.push({ kind, box: box(rect) });
    }
    // a dot or ring before a bullet, a number before an ordered item
    for (const item of root.querySelectorAll<HTMLElement>("li")) {
      if (item.closest(IGNORED) || !shown(item)) continue;
      const rect = item.getBoundingClientRect();
      if (item.parentElement?.tagName === "OL") {
        const line = firstLine(item);
        const style = getComputedStyle(item, "::marker");
        const index = Array.from(item.parentElement.children).indexOf(item) + 1;
        const canvas = document.createElement("canvas").getContext("2d");
        if (!canvas || !line) continue;
        canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const width = canvas.measureText(`${index}. `).width;
        const marker = {
          left: rect.left - width,
          top: line.top,
          right: rect.left,
          bottom: line.bottom,
        };
        if (near(marker)) out.push({ kind: "number", box: marker });
        continue;
      }
      const before = getComputedStyle(item, "::before");
      if (before.content === "none" || before.position !== "absolute") continue;
      const left = rect.left + Number.parseFloat(before.left);
      const top = rect.top + Number.parseFloat(before.top);
      const marker = {
        left,
        top,
        right: left + Number.parseFloat(before.width),
        bottom: top + Number.parseFloat(before.height),
      };
      if (near(marker)) out.push({ kind: "bullet", box: marker });
    }
    return out;
  };

  window.__visualAudit = {
    prepare(target, align = "center") {
      const element = find(target);
      if (!element) return null;
      element.scrollIntoView({ block: align, inline: "nearest" });
      // text is pointed at its start; a card, a field or a picture at the block's own start
      const start = lead(element);
      const line = firstLine(element);
      const rect = element.getBoundingClientRect();
      const text = start?.editable && line && target.at !== "edge";
      const from = text ? line : box(rect);
      const by = text ? 6 : 12;
      const x = rightToLeft(element)
        ? from.right - Math.min(by, (from.right - from.left) / 2)
        : from.left + Math.min(by, (from.right - from.left) / 2);
      return {
        x,
        y: line ? (line.top + line.bottom) / 2 : rect.top + Math.min(12, rect.height / 2),
      };
    },

    handle(target) {
      const root = editorRoot();
      const element = find(target);
      const empty = { left: 0, top: 0, right: 0, bottom: 0 };
      const wrapper = root.querySelector<HTMLElement>(".gotipe-block-toolbar-wrapper");
      const buttons = Array.from(
        wrapper?.querySelectorAll<HTMLElement>(".gotipe-block-toolbar-control > button") ?? [],
      );
      const visible = !!wrapper && buttons.length > 0 && buttons.every(shown);
      const boxes = visible ? buttons.map((button) => box(button.getBoundingClientRect())) : [];
      const band = boxes.reduce(
        (all, next) => ({
          left: Math.min(all.left, next.left),
          top: Math.min(all.top, next.top),
          right: Math.max(all.right, next.right),
          bottom: Math.max(all.bottom, next.bottom),
        }),
        {
          left: Number.POSITIVE_INFINITY,
          top: Number.POSITIVE_INFINITY,
          right: Number.NEGATIVE_INFINITY,
          bottom: Number.NEGATIVE_INFINITY,
        },
      );
      // a table's handle stands at its first line: the text of its first cell (Atlas frame 9)
      const lineOwner =
        element && target.line === "table"
          ? element
              .closest('[data-block-type="table"]')
              ?.querySelector(":is(th, td)[data-block-id]")
          : element;
      return {
        found: !!element,
        visible,
        drag: buttons[1]?.getAttribute("data-block-drag") ?? null,
        unit: element ? (unitOf(element, target)?.getAttribute("data-block-id") ?? null) : null,
        buttons: boxes,
        hits: visible
          ? drawn(root, band).filter((hit) => boxes.some((b) => crosses(b, hit.box)))
          : [],
        line: lineOwner ? firstLine(lineOwner) : null,
        block: element ? box(element.getBoundingClientRect()) : empty,
        editor: box(root.getBoundingClientRect()),
        area: wrapper ? visibleArea(wrapper) : empty,
      };
    },

    controls(target) {
      const element = find(target);
      if (!element) return [];
      const out: ControlProbe[] = [];
      if (target.type === "tableCell") {
        const row = element.closest("tr");
        const first = row?.firstElementChild;
        const handle = row?.querySelector<HTMLElement>(".gotipe-row-handle");
        if (row && first && handle) {
          const rect = box(handle.getBoundingClientRect());
          const cells = box(first.getBoundingClientRect());
          const text = Array.from(row.children).flatMap((cell) =>
            ownText(cell, true).flatMap((node) => rectsOf(node).map((r) => box(r))),
          );
          // the room ends where the first column's text starts: at its cell's padding
          const start = cells.left + Number.parseFloat(getComputedStyle(first).paddingLeft);
          out.push({
            name: "row handle",
            visible: shown(handle),
            box: rect,
            hits: text.filter((t) => crosses(t, rect)).map((t) => ({ kind: "text", box: t })),
            room: {
              ...box(row.getBoundingClientRect()),
              right: start,
              left: Number.NEGATIVE_INFINITY,
            },
            area: visibleArea(handle),
          });
        }
      }
      if (target.type === "tableHeader") {
        const handle = element.querySelector<HTMLElement>(".gotipe-column-handle");
        if (handle) {
          const rect = box(handle.getBoundingClientRect());
          const text = ownText(element, true).flatMap((node) => rectsOf(node).map((r) => box(r)));
          out.push({
            name: "column handle",
            visible: shown(handle),
            box: rect,
            hits: text.filter((t) => crosses(t, rect)).map((t) => ({ kind: "text", box: t })),
            room: box(element.getBoundingClientRect()),
            area: visibleArea(handle),
          });
        }
      }
      return out;
    },

    layout() {
      const root = editorRoot();
      const editor = box(root.getBoundingClientRect());
      const scrollers: LayoutProbe["scrollers"] = [];
      for (let node: Element | null = root; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const scrolls = node === document.documentElement || /auto|scroll/.test(style.overflowX);
        if (scrolls && node.scrollWidth > node.clientWidth + 0.5)
          scrollers.push({
            name: node === document.documentElement ? "page" : node.className || node.tagName,
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
          });
      }
      // what sticks out of the editor without a container of its own that scrolls
      const overflow: LayoutProbe["overflow"] = [];
      offenders = [];
      const walk = (element: Element) => {
        for (const child of Array.from(element.children)) {
          if (child.closest(IGNORED)) continue;
          const rect = child.getBoundingClientRect();
          if (
            rect.width > 0 &&
            (rect.left < editor.left - 0.5 || rect.right > editor.right + 0.5)
          ) {
            offenders.push(child);
            overflow.push({
              name: `${child.tagName.toLowerCase()}.${Array.from(child.classList).join(".")}`,
              box: box(rect),
            });
          }
          const style = getComputedStyle(child);
          if (!/auto|scroll|hidden|clip/.test(style.overflowX)) walk(child);
        }
      };
      walk(root);
      const columns = Array.from(root.querySelectorAll<HTMLElement>(".gotipe-columns")).map(
        (layout) => ({
          box: box(layout.getBoundingClientRect()),
          columns: Array.from(layout.querySelectorAll<HTMLElement>(":scope > .gotipe-column")).map(
            (column) => ({
              box: box(column.getBoundingClientRect()),
              text: Array.from(column.querySelectorAll("[data-block-id]")).flatMap((inner) =>
                ownText(inner, true).flatMap((node) => rectsOf(node).map((r) => box(r))),
              ),
            }),
          ),
        }),
      );
      // the head, the counter and the quick blocks stand in the text column (Atlas frames 1, 11, 26)
      const start = (element: Element) =>
        element.getBoundingClientRect().left +
        Number.parseFloat(getComputedStyle(element).paddingLeft);
      const content = root.querySelector("[data-gotipe-content]");
      const misaligned = content
        ? Array.from(root.querySelectorAll(".gotipe-page-head, .gotipe-status, .gotipe-starters"))
            .filter(shown)
            .map((element) => ({
              name: element.className,
              left: start(element),
              column: start(content),
            }))
            .filter((item) => Math.abs(item.left - item.column) > 0.5)
        : [];
      return { scrollers, overflow: overflow.slice(0, 8), editor, columns, misaligned };
    },

    reveal(selector, index = 0) {
      const element = selector ? document.querySelectorAll(selector)[index] : offenders[0];
      element?.scrollIntoView({ block: "center" });
    },

    menu(selector) {
      const menu = Array.from(document.querySelectorAll(selector)).find(shown);
      return menu ? box(menu.getBoundingClientRect()) : null;
    },

    textPoint(target, end) {
      const element = find(target);
      if (!element) return null;
      element.scrollIntoView({ block: "center" });
      const line = firstLine(element);
      if (!line) return null;
      return { x: end ? line.right - 4 : line.left + 4, y: (line.top + line.bottom) / 2 };
    },

    draw(boxes) {
      for (const { box: b, color, label } of boxes) {
        const mark = document.createElement("div");
        mark.setAttribute("data-visual-audit", "");
        Object.assign(mark.style, {
          position: "fixed",
          left: `${b.left - 1}px`,
          top: `${b.top - 1}px`,
          width: `${b.right - b.left + 2}px`,
          height: `${b.bottom - b.top + 2}px`,
          outline: `2px solid ${color}`,
          pointerEvents: "none",
          zIndex: "2147483647",
          font: "10px/12px monospace",
          color,
        });
        if (label) mark.textContent = label;
        document.body.append(mark);
      }
    },

    erase() {
      for (const mark of document.querySelectorAll("[data-visual-audit]")) mark.remove();
    },
  };
}
