import type { ReactNode } from "react";

/**
 * A small mono label: a package name, or a license (`licence`) — the GoTipe Commercial License
 * in the accent tint, as the site marks it everywhere (Atlas frames 20–21).
 */
export function Badge({ children, licence }: { children?: ReactNode; licence?: string }) {
  const commercial = licence === "Commercial";
  return (
    <span className={commercial ? "site-badge is-commercial" : "site-badge"}>
      {children ?? licence}
    </span>
  );
}
