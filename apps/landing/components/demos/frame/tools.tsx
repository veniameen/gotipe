import type { ReactNode } from "react";

/** The row of a demo's own controls under the window bar. */
export function DemoTools({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="site-demo-tools" role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * A button that leaves the editor's selection where it is: the press does not take focus from
 * the document, so a command runs on the text the reader selected.
 */
export function ToolButton({
  children,
  onClick,
  pressed,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      className="site-demo-button"
      aria-pressed={pressed}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** One of a few values, as pressed buttons in a labelled group. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="site-demo-choice">
      <legend className="site-demo-choice-label">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="site-demo-button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

/** Where the editor scrolls inside the window's fixed height. */
export function DemoScroll({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="site-demo-scroll" aria-label={label} role={label ? "region" : undefined}>
      {children}
    </div>
  );
}
