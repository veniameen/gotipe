export function PlaceholderImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="8.5" cy="9" r="1.7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.5 17l4.5-4 3.5 3 3-2.5 2.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlaceholderFileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 3.8h6.6l4.1 4.1v11.3a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2V5.8a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M15.1 3.8v4.1h4.1" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.2 12.2h6.6M9.2 15.8h5.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ImageToolbarIcon({
  kind,
}: { kind: "comment" | "fit" | "original" | "caption" | "zoom" | "download" | "more" }) {
  if (kind === "comment") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 6h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-6l-4.2 3v-3H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "fit") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3.5 6h17M3.5 18h17" stroke="currentColor" strokeWidth="1.5" />
        <rect
          x="6.5"
          y="8.2"
          width="11"
          height="7.6"
          rx="1.8"
          stroke="currentColor"
          strokeWidth="1.7"
        />
      </svg>
    );
  }
  if (kind === "original") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect
          x="7.2"
          y="7.2"
          width="9.6"
          height="9.6"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M4 6h3M4 12h3M4 18h3M17 6h3M17 12h3M17 18h3"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "caption") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4.5" y="5" width="15" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M7 18h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "zoom") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="5.5" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M15.3 15.3L20 20M10.5 8v5M8 10.5h5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "download") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4v10M8 10.5l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M5 19h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="17.5" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function ImageOptionsIcon({
  kind,
}: {
  kind:
    | "replace"
    | "copy"
    | "download"
    | "caption"
    | "crop"
    | "more"
    | "link"
    | "duplicate"
    | "move"
    | "delete";
}) {
  if (kind === "replace") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7.5 8.5a6 6 0 0 1 10.2-2.2M16.5 15.5a6 6 0 0 1-10.2 2.2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path d="M17 4.5v3.6h-3.6M7 19.5v-3.6h3.6" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === "copy") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect
          x="8.5"
          y="8.5"
          width="11"
          height="11"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M15.5 4.5h-9a2 2 0 0 0-2 2v9"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "download") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4.5v10M8 11l4 4 4-4M5.5 19.5h13"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "caption") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 18.5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "crop") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 4.5v12a3 3 0 0 0 3 3h9.5M4.5 10h9a3 3 0 0 0 3-3V4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "more") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="6.5" cy="12" r="1.5" fill="currentColor" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        <circle cx="17.5" cy="12" r="1.5" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "link") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M10.2 8.8l1.7-1.7a3.3 3.3 0 1 1 4.6 4.6l-1.7 1.7M13.8 15.2l-1.7 1.7a3.3 3.3 0 0 1-4.6-4.6l1.7-1.7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === "duplicate") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect
          x="8.5"
          y="8.5"
          width="10.5"
          height="10.5"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path d="M15 4.5H6.5a2 2 0 0 0-2 2V15" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (kind === "move") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 18V8a3 3 0 0 1 3-3h10M14 13l4-4-4-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 7h12M8 7l.8 12h6.4L16 7M9.5 7V5h5v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ImageOptionsItem({
  icon,
  label,
  meta,
  danger = false,
  onClick,
  hasSubmenu = false,
}: {
  icon:
    | "replace"
    | "copy"
    | "download"
    | "caption"
    | "crop"
    | "more"
    | "link"
    | "duplicate"
    | "move"
    | "delete";
  label: string;
  meta?: string;
  danger?: boolean;
  onClick: () => void;
  hasSubmenu?: boolean;
}) {
  return (
    <button
      type="button"
      className={`gotipe-image-options-item${danger ? " danger" : ""}`}
      onClick={onClick}
    >
      <span className="gotipe-image-options-item-main">
        <span className="gotipe-image-options-item-icon" aria-hidden="true">
          <ImageOptionsIcon kind={icon} />
        </span>
        <span>{label}</span>
      </span>
      {hasSubmenu ? (
        <span className="gotipe-image-options-item-meta chevron" aria-hidden="true">
          {">"}
        </span>
      ) : meta ? (
        <span className="gotipe-image-options-item-meta">{meta}</span>
      ) : null}
    </button>
  );
}
