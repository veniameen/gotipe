/**
 * The GoTipe glyphs of the Atlas (design/atlas/src/icons.svg), served once as /icons.svg and drawn
 * by reference. Icons are decoration: the control around them carries the accessible name.
 */
export type IconName =
  | "arrow-left"
  | "arrow-down"
  | "arrow-down-right"
  | "arrow-right"
  | "arrow-up-right"
  | "braces"
  | "bulb"
  | "check"
  | "check-16"
  | "chip"
  | "chevron-down"
  | "chevron-right"
  | "cloud"
  | "comment"
  | "copy"
  | "download"
  | "edit"
  | "external"
  | "flag"
  | "globe"
  | "hash"
  | "info"
  | "layers"
  | "lock"
  | "logo"
  | "menu"
  | "moon"
  | "more"
  | "nodes"
  | "page"
  | "palette"
  | "restore"
  | "search"
  | "server"
  | "sparkle"
  | "sun"
  | "swap"
  | "warning"
  | "x";

/** Bump the version when public/icons.svg changes: browsers keep an external sprite in cache. */
export const ICON_SPRITE = "/icons.svg?v=2";

/** An icon as markup, for HTML built as text (the docs pipeline): the same sprite and names. */
export function iconMarkup(name: IconName, className = "site-icon"): string {
  return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="${ICON_SPRITE}#i-${name}"></use></svg>`;
}

export function Icon({ name, className = "site-icon" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} aria-hidden="true" focusable="false">
      <use href={`${ICON_SPRITE}#i-${name}`} />
    </svg>
  );
}
