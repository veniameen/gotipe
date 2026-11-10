import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef } from "react";

export interface DragPoint {
  x: number;
  y: number;
}
interface TouchDragOptions {
  enabled: boolean;
  root(): HTMLElement | null;
  start(id: string): boolean;
  move(point: DragPoint): void;
  drop(point: DragPoint): void;
  end(): void;
}

/** Owns one real touch/pen gesture; short taps retain the handle's menu behavior. */
export function useTouchDrag(options: TouchDragOptions) {
  const latest = useRef(options);
  latest.current = options;
  const cleanup = useRef<(() => void) | null>(null);
  const suppressClick = useRef(0);
  const cancel = useCallback(() => cleanup.current?.(), []);
  useEffect(() => {
    if (!options.enabled) cancel();
    return cancel;
  }, [options.enabled, cancel]);

  const begin = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
      suppressClick.current = 0;
      if (event.pointerType === "mouse" || !event.isPrimary || !latest.current.enabled) return;
      cancel();
      const button = event.currentTarget;
      const pointerId = event.pointerId;
      const origin = { x: event.clientX, y: event.clientY };
      let point = origin;
      let active = false;
      let finished = false;
      let frame: number | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (timer !== null) clearTimeout(timer);
        if (frame !== null) cancelAnimationFrame(frame);
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", abort, true);
        window.removeEventListener("blur", finish);
        window.removeEventListener("keydown", key, true);
        if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
        cleanup.current = null;
        if (active) {
          suppressClick.current = Date.now() + 500;
          latest.current.end();
        }
      };
      const scroll = () => {
        if (!active || finished) return;
        const root = latest.current.root();
        if (!latest.current.enabled || !root?.isConnected) return finish();
        let host: HTMLElement | null = root;
        while (
          host &&
          !(
            host.scrollHeight > host.clientHeight &&
            /auto|scroll/.test(getComputedStyle(host).overflowY)
          )
        )
          host = host.parentElement;
        const rect = host?.getBoundingClientRect();
        const top = Math.max(0, rect?.top ?? 0);
        const bottom = Math.min(window.innerHeight, rect?.bottom ?? window.innerHeight);
        const delta =
          point.y < top + 36
            ? -Math.min(12, (top + 36 - point.y) / 3)
            : point.y > bottom - 36
              ? Math.min(12, (point.y - bottom + 36) / 3)
              : 0;
        if (delta) {
          if (host) host.scrollBy(0, delta);
          else window.scrollBy(0, delta);
          latest.current.move(point);
        }
        frame = requestAnimationFrame(scroll);
      };
      const move = (next: PointerEvent) => {
        if (next.pointerId !== pointerId) return;
        point = { x: next.clientX, y: next.clientY };
        if (!active) {
          if (Math.hypot(point.x - origin.x, point.y - origin.y) > 10) finish();
          return;
        }
        next.preventDefault();
        latest.current.move(point);
      };
      const up = (next: PointerEvent) => {
        if (next.pointerId !== pointerId) return;
        point = { x: next.clientX, y: next.clientY };
        try {
          if (active && latest.current.enabled) {
            next.preventDefault();
            latest.current.drop(point);
          }
        } finally {
          finish();
        }
      };
      const abort = (next: PointerEvent) => {
        if (next.pointerId === pointerId) finish();
      };
      const key = (next: KeyboardEvent) => {
        if (next.key === "Escape") finish();
      };
      window.addEventListener("pointermove", move, { capture: true, passive: false });
      window.addEventListener("pointerup", up, { capture: true, passive: false });
      window.addEventListener("pointercancel", abort, true);
      window.addEventListener("blur", finish);
      window.addEventListener("keydown", key, true);
      cleanup.current = finish;
      button.setPointerCapture(pointerId);
      timer = setTimeout(() => {
        timer = null;
        if (!latest.current.enabled || !button.isConnected) return finish();
        if (latest.current.start(id) === false) return finish();
        active = true;
        suppressClick.current = Date.now() + 750;
        latest.current.move(point);
        frame = requestAnimationFrame(scroll);
      }, 300);
    },
    [cancel],
  );

  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (suppressClick.current < Date.now()) return;
    suppressClick.current = 0;
    event.preventDefault();
    event.stopPropagation();
  }, []);
  return { begin, cancel, onClickCapture };
}
