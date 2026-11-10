import type React from "react";
const ICON_TEXT_TOKENS = new Set(["heading-1", "heading-2", "heading-3"]);

export function renderIcon(icon: string, name: string): React.ReactNode {
  const key = icon.toLowerCase();

  if (ICON_TEXT_TOKENS.has(key)) {
    return <span className="gotipe-slash-menu-item-icon-text">{key.replace("heading-", "H")}</span>;
  }

  if (key === "sparkles" || key === "sparkle") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (key === "type") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 6h14M12 6v12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }

  if (key === "list") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="5" cy="7" r="1.2" fill="currentColor" />
        <circle cx="5" cy="12" r="1.2" fill="currentColor" />
        <circle cx="5" cy="17" r="1.2" fill="currentColor" />
        <path
          d="M9 7h10M9 12h10M9 17h10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "list-ordered") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 7h2V5M6 7V5M4 12h2M4 17h2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M9 7h10M9 12h10M9 17h10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "check-square") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect
          x="3.5"
          y="4"
          width="6.5"
          height="6.5"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M4.8 7.4l1.6 1.6L8.9 6.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 7h8M13 12h8M13 17h8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "quote") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 5v14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M10 7h9M10 12h7M10 17h9"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (key === "code") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect
          x="3.5"
          y="4"
          width="17"
          height="16"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M10 9l-2.5 3L10 15M14 9l2.5 3-2.5 3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (key === "table") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect
          x="3.5"
          y="4"
          width="17"
          height="16"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path d="M3.5 10h17M3.5 15h17M9 4v16M15 4v16" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (key === "minus") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (key === "image") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect
          x="3.5"
          y="4"
          width="17"
          height="16"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.7"
        />
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

  if (key === "paperclip") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9.5 12.5l5.9-5.9a3 3 0 114.2 4.2l-7.8 7.8a5 5 0 11-7.1-7.1l7.1-7.1"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const fallback = name.trim().charAt(0).toUpperCase() || "•";
  return <span className="gotipe-slash-menu-item-icon-text">{fallback}</span>;
}

export function isAccentIcon(icon: string, name: string): boolean {
  const key = icon.toLowerCase();
  if (key === "sparkles" || key === "sparkle") return true;
  return name.toLowerCase().includes("ai");
}
