import type { GoTipeEditor } from "@gotipe/core";
import { useFloatingPosition } from "@gotipe/react";
import {
  type CSSProperties,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Tip } from "../components/formatting/tip";
import { useBlockEditorI18n } from "../i18n/strings";
import { PageIcon } from "../page/icons";
import { UNIT_ATTRIBUTE, useOverflowPlan } from "./measure";
import type { ToolUnit } from "./overflow";
import { lineControls, useRovingFocus } from "./roving";
import { type FixedToolbarTool, UnitTools, toolUnits } from "./units";

export interface FixedToolbarProps {
  editor: GoTipeEditor;
  /** The toolbar's accessible name. Default: “Formatting” in the editor's language. */
  label?: string;
  /**
   * Tools to leave out. The font and size need `FontFamily` and `FontSize`, ¶ needs
   * `InvisibleCharacters`: without those extensions their tools are not shown.
   */
  hide?: readonly FixedToolbarTool[];
  /** The host's own tools at the bar's end, after ¶ (a theme switch, a save state). */
  children?: ReactNode;
  className?: string;
}

const NONE: readonly FixedToolbarTool[] = [];
const POPUP = "[data-gotipe-formatting-popup]";
const CLOSED: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  visibility: "hidden",
  pointerEvents: "none",
};

function Separator() {
  return <hr className="gotipe-fixed-toolbar-sep" aria-orientation="vertical" />;
}

/**
 * The fixed toolbar over the document (Atlas frame 31, the view modern): history, the block
 * type, the font and size, marks, alignment and lists, “Insert”, ¶. What is on stands on a fill;
 * an unavailable tool says why in its tooltip. What does not fit goes to “More” — a second bar
 * under its button, in the bar's order. One Tab stop; the arrows move between the tools.
 */
export function FixedToolbar({
  editor,
  label,
  hide = NONE,
  children,
  className,
}: FixedToolbarProps) {
  const i18n = useBlockEditorI18n();
  const host = children !== undefined && children !== null && children !== false;
  const hidden = hide.join(" ");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `hidden` stands for the list `hide`.
  const units = useMemo(() => toolUnits(editor, hide, host), [editor, hidden, host]);
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const plan = useOverflowPlan(units, root, track, panel);
  const [open, setOpen] = useState(false);
  const byKeyboard = useRef(false);
  const panelId = useId();
  const bar = useRovingFocus(track);
  const extra = useRovingFocus(panel);

  const anchor = useCallback(() => {
    const button = more.current?.getBoundingClientRect();
    if (!button) return null;
    // “More” opens under its button, its right edge on the button's right edge
    const width = panel.current?.offsetWidth ?? 0;
    return {
      top: button.top,
      bottom: button.bottom,
      height: button.height,
      right: button.right,
      left: button.right - width,
      width,
    };
  }, []);
  const position = useFloatingPosition({ open, anchor, element: panel, gap: 6 });

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) more.current?.focus();
  }, []);
  useEffect(() => {
    if (plan.hidden.size === 0) setOpen(false);
  }, [plan]);
  useLayoutEffect(() => {
    if (panel.current) panel.current.inert = !open;
  });
  useEffect(() => {
    if (!open) return;
    const owner = panel.current?.ownerDocument ?? document;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !more.current?.contains(target)) setOpen(false);
    };
    const frame = byKeyboard.current
      ? requestAnimationFrame(() => {
          if (panel.current) lineControls(panel.current)[0]?.focus();
        })
      : null;
    owner.addEventListener("mousedown", outside);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      owner.removeEventListener("mousedown", outside);
    };
  }, [open]);

  const escape = (event: KeyboardEvent<HTMLElement>, inPanel: boolean) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (root.current?.querySelector(POPUP)) return;
    event.preventDefault();
    if (open) close(inPanel || event.target === more.current);
    else editor.focus();
  };

  const unit = (item: ToolUnit) => (
    <div key={item.id} className="gotipe-fixed-toolbar-unit" {...{ [UNIT_ATTRIBUTE]: item.id }}>
      <UnitTools unit={item.id} editor={editor} host={children} />
    </div>
  );
  const shown = units.filter((item) => !plan.hidden.has(item.id));
  const main = shown.filter((item) => !item.end);
  const ends = shown.filter((item) => item.end && item.id !== "host");
  const hostUnit = shown.find((item) => item.id === "host");
  const overflowing = plan.hidden.size > 0;

  return (
    <div
      ref={root}
      className={["gotipe-fixed-toolbar", className].filter(Boolean).join(" ")}
      role="toolbar"
      aria-label={label ?? i18n.t("toolbar.label")}
      aria-orientation="horizontal"
      data-gotipe-fixed-toolbar=""
    >
      <div
        ref={track}
        className="gotipe-fixed-toolbar-track"
        data-cramped={plan.cramped ? "" : undefined}
        onFocus={bar.onFocus}
        onKeyDown={(event) => {
          bar.onKeyDown(event);
          escape(event, false);
        }}
      >
        {main.map((item, index) => (
          <Fragment key={item.id}>
            {index > 0 && main[index - 1]?.group !== item.group ? <Separator /> : null}
            {unit(item)}
          </Fragment>
        ))}
        {ends.length > 0 || overflowing || hostUnit ? (
          <span className="gotipe-fixed-toolbar-space" />
        ) : null}
        {ends.map(unit)}
        {overflowing ? (
          <button
            ref={more}
            type="button"
            className="gotipe-format-tool gotipe-fixed-toolbar-more"
            aria-label={i18n.t("editor.more")}
            aria-haspopup="true"
            aria-expanded={open}
            aria-controls={panelId}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              byKeyboard.current = event.detail === 0;
              setOpen((value) => !value);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && !open) {
                event.preventDefault();
                byKeyboard.current = true;
                setOpen(true);
              }
            }}
          >
            <PageIcon name="more" />
            <Tip label={i18n.t("editor.more")} />
          </button>
        ) : null}
        {hostUnit ? unit(hostUnit) : null}
      </div>
      {overflowing ? (
        <div
          ref={panel}
          id={panelId}
          className="gotipe-fixed-toolbar-panel"
          role="toolbar"
          aria-label={i18n.t("toolbar.moreTools")}
          data-open={open ? "" : undefined}
          style={
            open && position
              ? {
                  position: "fixed",
                  left: position.left,
                  top: position.top,
                  maxWidth: position.maxWidth,
                }
              : CLOSED
          }
          onFocus={extra.onFocus}
          onKeyDown={(event) => {
            extra.onKeyDown(event);
            escape(event, true);
          }}
        >
          {plan.rows.map((row) => (
            <div key={row[0]?.[0]?.id} className="gotipe-fixed-toolbar-row">
              {row.map((group, index) => (
                <Fragment key={group[0]?.id}>
                  {index > 0 ? <Separator /> : null}
                  {group.map(unit)}
                </Fragment>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
