import { keyLabel } from "./keys";

/**
 * The tooltip of a toolbar button (GoTipe Atlas, frame 6): an inverted label with its key, shown
 * on hover and keyboard focus. The button keeps its own accessible name and aria-keyshortcuts.
 */
export function Tip({ label, binding }: { label: string; binding?: string }) {
  return (
    <span className="gotipe-tip" aria-hidden="true">
      {label}
      {binding ? <span className="gotipe-tip-key">{keyLabel(binding)}</span> : null}
    </span>
  );
}

/** A bound key at the end of a menu row. */
export function MenuKey({ binding }: { binding?: string }) {
  return binding ? (
    <span className="gotipe-menu-key" aria-hidden="true">
      {keyLabel(binding)}
    </span>
  ) : null;
}
