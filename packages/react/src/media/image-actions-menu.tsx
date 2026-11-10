import type { CSSProperties, ComponentProps, RefObject } from "react";
import { useState } from "react";
import { ImageOptionsItem } from "./icons";

export interface ImageAction {
  id: string;
  icon: ComponentProps<typeof ImageOptionsItem>["icon"];
  label: string;
  danger?: boolean;
  onClick: () => void;
}

export function ImageActionsMenu({
  element,
  style,
  actions,
  onClose,
}: {
  element: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  actions: ImageAction[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = actions.filter((action) =>
    action.label.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()),
  );
  return (
    <div
      ref={element}
      style={style}
      className="gotipe-image-options-menu"
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <input
        className="gotipe-image-options-search"
        type="search"
        placeholder="Search actions…"
        aria-label="Search image actions"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="gotipe-image-options-group">Image</div>
      {filtered.map(({ id, ...action }) => (
        <ImageOptionsItem key={id} {...action} />
      ))}
      {!filtered.length ? <p role="status">No matching actions</p> : null}
    </div>
  );
}
