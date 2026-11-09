import type { BlockView, GoTipeEditor } from "@gotipe/core";
import type React from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BlockRendererProps } from "./block-renderer";
import { TextRenderer } from "./text-renderer";

function useViewState(editor: GoTipeEditor | null) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!editor) return () => {};
      return editor.on("viewStateChange", onStoreChange as never);
    },
    [editor],
  );

  const getSnapshot = useCallback(() => {
    if (!editor) return null;
    return editor.getViewState();
  }, [editor]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function BlockContent({ block }: { block: BlockView }) {
  if (block.content === null) return null;
  if (typeof block.content === "string") return <>{block.content}</>;
  if (Array.isArray(block.content)) {
    const hasVisibleText = block.content.some((span) => span.text.length > 0);
    if (hasVisibleText) {
      return <TextRenderer spans={block.content} />;
    }
    // Keep empty editable blocks caret-addressable in the DOM.
    return <br data-gotipe-trailing-break="" />;
  }
  return null;
}

function isBlockContentEmpty(block: BlockView): boolean {
  if (block.content === null) return true;
  if (typeof block.content === "string") return block.content.length === 0;
  if (Array.isArray(block.content)) return block.content.every((span) => span.text.length === 0);
  return true;
}

function getEmptyBlockPlaceholder(block: BlockView, parentType?: string): string | null {
  switch (block.type) {
    case "paragraph":
      return "Text";
    case "heading": {
      const level = Math.min(Math.max((block.attrs.level as number) || 1, 1), 6);
      return `Heading ${level}`;
    }
    case "listItem":
      return parentType === "orderedList" ? "Numbered List" : "Bullet List";
    case "todoItem":
      return "To-do List";
    case "blockquote":
      return "Quote";
    default:
      return null;
  }
}

function BlockChildren({
  block,
  editor,
  selectedBlockId,
}: {
  block: BlockView;
  editor: GoTipeEditor;
  selectedBlockId: string;
}) {
  if (!block.children || block.children.length === 0) return null;
  return (
    <>
      {block.children.map((child) => (
        <BlockComponent
          key={child.id}
          block={child}
          editor={editor}
          selectedBlockId={selectedBlockId}
          parentType={block.type}
        />
      ))}
    </>
  );
}

function formatFileSize(bytes: number | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeHttpUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function inferFileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.split("/").filter(Boolean).pop();
    if (!path) return "Linked file";
    return decodeURIComponent(path);
  } catch {
    return "Linked file";
  }
}

type ImageInsertTab = "upload" | "link" | "unsplash" | "giphy";
type FileInsertTab = "upload" | "link";
type ResizeDirection = "left" | "right";

function PlaceholderImageIcon() {
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

function PlaceholderFileIcon() {
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

function ImageToolbarIcon({
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

function ImageOptionsIcon({
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

function ImageOptionsItem({
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

/* ---- Image Block ---- */

function ImageBlock({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
  const src = (block.attrs.src as string) || "";
  const alt = (block.attrs.alt as string) || "";
  const width = block.attrs.width as number | undefined;
  const caption = (block.attrs.caption as string) || "";
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<ImageInsertTab>("upload");
  const [isInsertPanelOpen, setIsInsertPanelOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isCaptionVisible, setIsCaptionVisible] = useState(caption.length > 0);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [draftWidth, setDraftWidth] = useState<number | null>(null);

  const insertShellRef = useRef<HTMLDivElement | null>(null);
  const imageShellRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const captionRef = useRef<HTMLElement | null>(null);
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const resizeStartRef = useRef<{
    startX: number;
    startWidth: number;
    maxWidth: number;
    direction: ResizeDirection;
  } | null>(null);
  const draftWidthRef = useRef<number | null>(null);

  useEffect(() => {
    draftWidthRef.current = draftWidth;
  }, [draftWidth]);

  const applyImageSource = useCallback(
    (nextSrc: string, nextAlt: string) => {
      editor.chain().setBlockAttrs(block.id, { src: nextSrc, alt: nextAlt }).run();
      setIsInsertPanelOpen(false);
      setIsOptionsOpen(false);
      setLinkValue("");
      setLinkError(null);
    },
    [editor, block.id],
  );

  const triggerFilePicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        applyImageSource(URL.createObjectURL(file), file.name);
      }
    };
    input.click();
  }, [applyImageSource]);

  const submitLink = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const normalized = normalizeHttpUrl(linkValue);
      if (!normalized) {
        setLinkError("Enter a valid image URL");
        return;
      }
      applyImageSource(normalized, "");
    },
    [applyImageSource, linkValue],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) {
        applyImageSource(URL.createObjectURL(file), file.name);
      }
    },
    [applyImageSource],
  );

  const focusCaption = useCallback(() => {
    setIsCaptionVisible(true);
    setIsOptionsOpen(false);
    requestAnimationFrame(() => {
      const target = captionRef.current;
      if (!target) return;
      target.focus();
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }, []);

  const getResizeMaxWidth = useCallback(() => {
    const shell = imageShellRef.current;
    if (!shell) return window.innerWidth - 64;
    const contentEl = shell.closest("[data-gotipe-content]") as HTMLElement | null;
    const contentWidth = contentEl?.clientWidth ?? 0;
    const parentWidth = shell.parentElement?.clientWidth ?? 0;
    const viewportWidth = Math.max(320, window.innerWidth - 64);
    return Math.max(contentWidth, parentWidth, viewportWidth);
  }, []);

  const resetImageWidth = useCallback(() => {
    editor.chain().setBlockAttrs(block.id, { width: null, height: null }).run();
    setDraftWidth(null);
    setIsOptionsOpen(false);
  }, [editor, block.id]);

  const setOriginalImageWidth = useCallback(() => {
    const imageEl = imageRef.current;
    if (!imageEl) return;
    const maxWidth = getResizeMaxWidth();
    const originalWidth = imageEl.naturalWidth || imageEl.width;
    const nextWidth = Math.max(160, Math.min(originalWidth, maxWidth));
    editor
      .chain()
      .setBlockAttrs(block.id, { width: Math.round(nextWidth), height: null })
      .run();
    setDraftWidth(null);
    setIsOptionsOpen(false);
  }, [editor, block.id, getResizeMaxWidth]);

  const downloadImage = useCallback(() => {
    if (!src) return;
    const link = document.createElement("a");
    link.href = src;
    link.download = alt || "image";
    link.target = "_blank";
    link.rel = "noreferrer";
    link.click();
    setIsOptionsOpen(false);
  }, [src, alt]);

  const copyImage = useCallback(async () => {
    if (!src) return;
    try {
      await navigator.clipboard.writeText(src);
    } catch {
      // Ignore clipboard failures.
    }
    setIsOptionsOpen(false);
  }, [src]);

  const copyBlockLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`#${block.id}`);
    } catch {
      // Ignore clipboard failures.
    }
    setIsOptionsOpen(false);
  }, [block.id]);

  const duplicateImageBlock = useCallback(() => {
    editor.chain().duplicateBlock(block.id).run();
    setIsOptionsOpen(false);
  }, [editor, block.id]);

  const removeImageBlock = useCallback(() => {
    editor.chain().deleteBlock(block.id).run();
    setIsOptionsOpen(false);
  }, [editor, block.id]);

  const clearImage = useCallback(() => {
    editor
      .chain()
      .setBlockAttrs(block.id, { src: "", alt: "", width: null, height: null, caption: "" })
      .run();
    setIsCaptionVisible(false);
    setIsInsertPanelOpen(false);
    setIsOptionsOpen(false);
    setDraftWidth(null);
  }, [editor, block.id]);

  const closeImageOptions = useCallback(() => {
    setIsOptionsOpen(false);
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, direction: ResizeDirection) => {
      e.preventDefault();
      e.stopPropagation();
      const imageEl = imageRef.current;
      if (!imageEl) return;
      const imageRect = imageEl.getBoundingClientRect();
      const maxWidth = Math.max(imageRect.width, getResizeMaxWidth());
      resizeStartRef.current = {
        startX: e.clientX,
        startWidth: imageRect.width,
        maxWidth,
        direction,
      };
      setIsResizing(true);
      setDraftWidth(Math.round(imageRect.width));
    },
    [getResizeMaxWidth],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const dx = event.clientX - start.startX;
      const delta = start.direction === "right" ? dx : -dx;
      const nextWidth = Math.max(160, Math.min(start.maxWidth, start.startWidth + delta));
      setDraftWidth(Math.round(nextWidth));
    };

    const handleMouseUp = () => {
      const nextWidth = draftWidthRef.current;
      if (typeof nextWidth === "number" && Number.isFinite(nextWidth)) {
        editor
          .chain()
          .setBlockAttrs(block.id, { width: Math.round(nextWidth), height: null })
          .run();
      }
      resizeStartRef.current = null;
      setIsResizing(false);
      setDraftWidth(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [editor, block.id, isResizing]);

  useEffect(() => {
    if (!isInsertPanelOpen || src) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (insertShellRef.current?.contains(target)) return;
      setIsInsertPanelOpen(false);
      setLinkError(null);
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [isInsertPanelOpen, src]);

  useEffect(() => {
    if (!isOptionsOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (optionsMenuRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest("[data-gotipe-image-toolbar]")) return;
      setIsOptionsOpen(false);
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [isOptionsOpen]);

  const renderWidth = draftWidth ?? width;
  const showImageControls = Boolean(src) && (isHovered || isResizing || isOptionsOpen);

  return (
    <figure
      data-block-id={block.id}
      data-block-type={block.type}
      className="gotipe-image-block"
      contentEditable={false}
    >
      {src ? (
        <div
          ref={imageShellRef}
          className="gotipe-image-loaded-shell"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <img
            ref={imageRef}
            src={src}
            alt={alt}
            style={
              renderWidth
                ? { width: `${renderWidth}px`, maxWidth: "100%", height: "auto" }
                : undefined
            }
          />
          <div
            className={`gotipe-image-toolbar${showImageControls ? " visible" : ""}`}
            data-gotipe-image-toolbar=""
          >
            <button
              type="button"
              className="gotipe-image-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setIsOptionsOpen(false);
              }}
              aria-label="Comment"
            >
              <ImageToolbarIcon kind="comment" />
            </button>
            <button
              type="button"
              className="gotipe-image-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={setOriginalImageWidth}
              aria-label="Original size"
            >
              <ImageToolbarIcon kind="original" />
            </button>
            <button
              type="button"
              className="gotipe-image-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={resetImageWidth}
              aria-label="Fit to width"
            >
              <ImageToolbarIcon kind="fit" />
            </button>
            <button
              type="button"
              className="gotipe-image-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={focusCaption}
              aria-label="Caption"
            >
              <ImageToolbarIcon kind="caption" />
            </button>
            <button
              type="button"
              className="gotipe-image-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!src) return;
                window.open(src, "_blank", "noopener,noreferrer");
              }}
              aria-label="Zoom"
            >
              <ImageToolbarIcon kind="zoom" />
            </button>
            <button
              type="button"
              className="gotipe-image-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={downloadImage}
              aria-label="Download"
            >
              <ImageToolbarIcon kind="download" />
            </button>
            <button
              type="button"
              className={`gotipe-image-toolbar-btn${isOptionsOpen ? " active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setIsOptionsOpen((current) => !current)}
              aria-label="More options"
            >
              <ImageToolbarIcon kind="more" />
            </button>
          </div>
          {showImageControls ? (
            <>
              <button
                type="button"
                className="gotipe-image-side-handle gotipe-image-side-handle-left"
                onMouseDown={(e) => handleResizeStart(e, "left")}
                aria-label="Resize image from left"
              />
              <button
                type="button"
                className="gotipe-image-side-handle gotipe-image-side-handle-right"
                onMouseDown={(e) => handleResizeStart(e, "right")}
                aria-label="Resize image from right"
              />
            </>
          ) : null}
          {isOptionsOpen ? (
            <div
              ref={optionsMenuRef}
              className="gotipe-image-options-menu"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                className="gotipe-image-options-search"
                type="text"
                placeholder="Search actions..."
                aria-label="Search image actions"
                onMouseDown={(e) => e.stopPropagation()}
              />
              <div className="gotipe-image-options-group">Image</div>
              <ImageOptionsItem icon="replace" label="Replace" onClick={triggerFilePicker} />
              <ImageOptionsItem icon="copy" label="Copy image" onClick={() => void copyImage()} />
              <ImageOptionsItem icon="download" label="Download" onClick={downloadImage} />
              <ImageOptionsItem
                icon="caption"
                label="Caption"
                meta="Cmd+Shift+M"
                onClick={focusCaption}
              />
              <ImageOptionsItem icon="crop" label="Crop image" onClick={closeImageOptions} />
              <ImageOptionsItem
                icon="more"
                label="More options"
                hasSubmenu
                onClick={closeImageOptions}
              />
              <div className="gotipe-image-options-divider" />
              <ImageOptionsItem
                icon="link"
                label="Copy link to block"
                meta="Cmd+Alt+L"
                onClick={() => void copyBlockLink()}
              />
              <ImageOptionsItem
                icon="duplicate"
                label="Duplicate"
                meta="Cmd+D"
                onClick={duplicateImageBlock}
              />
              <ImageOptionsItem
                icon="move"
                label="Move to"
                meta="Cmd+Shift+P"
                onClick={closeImageOptions}
              />
              <ImageOptionsItem
                icon="delete"
                label="Delete"
                meta="Del"
                danger
                onClick={removeImageBlock}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="gotipe-media-placeholder-shell" ref={insertShellRef}>
          <button
            type="button"
            className={`gotipe-image-placeholder gotipe-media-placeholder${dragOver ? " dragover" : ""}`}
            aria-label="Add an image"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsInsertPanelOpen(true);
              setActiveTab("upload");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsInsertPanelOpen(true);
                setActiveTab("upload");
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <span className="gotipe-media-placeholder-icon" aria-hidden="true">
              <PlaceholderImageIcon />
            </span>
            <span className="gotipe-media-placeholder-label">Add an image</span>
          </button>
          {isInsertPanelOpen ? (
            <div className="gotipe-media-insert-panel" aria-label="Image source">
              <div
                className="gotipe-media-insert-tabs"
                role="tablist"
                aria-label="Image source tabs"
              >
                <button
                  type="button"
                  className={`gotipe-media-tab${activeTab === "upload" ? " active" : ""}`}
                  role="tab"
                  aria-selected={activeTab === "upload"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTab("upload")}
                >
                  Upload
                </button>
                <button
                  type="button"
                  className={`gotipe-media-tab${activeTab === "link" ? " active" : ""}`}
                  role="tab"
                  aria-selected={activeTab === "link"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTab("link")}
                >
                  Link
                </button>
                <button
                  type="button"
                  className={`gotipe-media-tab${activeTab === "unsplash" ? " active" : ""}`}
                  role="tab"
                  aria-selected={activeTab === "unsplash"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTab("unsplash")}
                >
                  Unsplash
                </button>
                <button
                  type="button"
                  className={`gotipe-media-tab${activeTab === "giphy" ? " active" : ""}`}
                  role="tab"
                  aria-selected={activeTab === "giphy"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTab("giphy")}
                >
                  GIPHY
                </button>
              </div>
              <div className="gotipe-media-insert-content">
                {activeTab === "upload" ? (
                  <>
                    <button
                      type="button"
                      className="gotipe-media-upload-button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={triggerFilePicker}
                    >
                      Upload file
                    </button>
                    <p className="gotipe-media-insert-note">You can also drag and drop an image.</p>
                  </>
                ) : null}
                {activeTab === "link" ? (
                  <form className="gotipe-media-link-form" onSubmit={submitLink}>
                    <input
                      type="url"
                      placeholder="https://example.com/image.png"
                      value={linkValue}
                      onChange={(e) => {
                        setLinkValue(e.target.value);
                        if (linkError) setLinkError(null);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <button type="submit" onMouseDown={(e) => e.preventDefault()}>
                      Insert
                    </button>
                  </form>
                ) : null}
                {activeTab === "unsplash" ? (
                  <p className="gotipe-media-insert-note">
                    Unsplash source will be connected here.
                  </p>
                ) : null}
                {activeTab === "giphy" ? (
                  <p className="gotipe-media-insert-note">GIPHY source will be connected here.</p>
                ) : null}
                {linkError ? <p className="gotipe-media-insert-error">{linkError}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
      {src && (isCaptionVisible || caption) ? (
        <figcaption
          ref={captionRef}
          contentEditable
          suppressContentEditableWarning
          onMouseDown={(e) => e.stopPropagation()}
          onInput={(e) => {
            const nextCaption = (e.currentTarget.textContent ?? "").trim();
            editor.chain().setBlockAttrs(block.id, { caption: nextCaption }).run();
          }}
          onBlur={(e) => {
            const nextCaption = (e.currentTarget.textContent ?? "").trim();
            if (!nextCaption) setIsCaptionVisible(false);
          }}
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

/* ---- File Block ---- */

function FileBlock({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
  const url = (block.attrs.url as string) || "";
  const name = (block.attrs.name as string) || "";
  const size = typeof block.attrs.size === "number" ? (block.attrs.size as number) : undefined;
  const mimeType = (block.attrs.mime_type as string) || "";

  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<FileInsertTab>("upload");
  const [isInsertPanelOpen, setIsInsertPanelOpen] = useState(false);
  const [linkUrlValue, setLinkUrlValue] = useState("");
  const [linkNameValue, setLinkNameValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const insertShellRef = useRef<HTMLDivElement | null>(null);

  const applyFile = useCallback(
    (next: { url: string; name: string; size?: number | null; mime_type?: string }) => {
      editor.chain().setBlockAttrs(block.id, next).run();
      setIsInsertPanelOpen(false);
      setLinkUrlValue("");
      setLinkNameValue("");
      setLinkError(null);
    },
    [editor, block.id],
  );

  const triggerFilePicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        applyFile({
          url: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          mime_type: file.type,
        });
      }
    };
    input.click();
  }, [applyFile]);

  const submitLink = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const normalized = normalizeHttpUrl(linkUrlValue);
      if (!normalized) {
        setLinkError("Enter a valid file URL");
        return;
      }
      const resolvedName = linkNameValue.trim() || inferFileNameFromUrl(normalized);
      applyFile({
        url: normalized,
        name: resolvedName,
        size: null,
        mime_type: "",
      });
    },
    [applyFile, linkNameValue, linkUrlValue],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        applyFile({
          url: URL.createObjectURL(file),
          name: file.name,
          size: file.size,
          mime_type: file.type,
        });
      }
    },
    [applyFile],
  );

  const fileMeta = [mimeType, formatFileSize(size)].filter(Boolean).join(" • ");

  useEffect(() => {
    if (!isInsertPanelOpen || url) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (insertShellRef.current?.contains(target)) return;
      setIsInsertPanelOpen(false);
      setLinkError(null);
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [isInsertPanelOpen, url]);

  return (
    <figure
      data-block-id={block.id}
      data-block-type={block.type}
      className="gotipe-file-block"
      contentEditable={false}
    >
      {url ? (
        <div className="gotipe-file-card">
          <span className="gotipe-file-card-icon" aria-hidden="true">
            <PlaceholderFileIcon />
          </span>
          <div className="gotipe-file-card-main">
            <a
              className="gotipe-file-card-name"
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {name || "Untitled file"}
            </a>
            <div className="gotipe-file-card-meta">{fileMeta || "File attachment"}</div>
          </div>
          <div className="gotipe-media-actions">
            <button
              type="button"
              className="gotipe-media-action-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={triggerFilePicker}
            >
              Replace
            </button>
            <button
              type="button"
              className="gotipe-media-action-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor
                  .chain()
                  .setBlockAttrs(block.id, {
                    url: "",
                    name: "",
                    size: null,
                    mime_type: "",
                  })
                  .run();
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="gotipe-media-placeholder-shell" ref={insertShellRef}>
          <button
            type="button"
            className={`gotipe-file-placeholder gotipe-media-placeholder${dragOver ? " dragover" : ""}`}
            aria-label="Add a file"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsInsertPanelOpen(true);
              setActiveTab("upload");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setIsInsertPanelOpen(true);
                setActiveTab("upload");
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <span className="gotipe-media-placeholder-icon" aria-hidden="true">
              <PlaceholderFileIcon />
            </span>
            <span className="gotipe-media-placeholder-label">Add a file</span>
          </button>
          {isInsertPanelOpen ? (
            <div className="gotipe-media-insert-panel" aria-label="File source">
              <div
                className="gotipe-media-insert-tabs"
                role="tablist"
                aria-label="File source tabs"
              >
                <button
                  type="button"
                  className={`gotipe-media-tab${activeTab === "upload" ? " active" : ""}`}
                  role="tab"
                  aria-selected={activeTab === "upload"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTab("upload")}
                >
                  Upload
                </button>
                <button
                  type="button"
                  className={`gotipe-media-tab${activeTab === "link" ? " active" : ""}`}
                  role="tab"
                  aria-selected={activeTab === "link"}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTab("link")}
                >
                  Link
                </button>
              </div>
              <div className="gotipe-media-insert-content">
                {activeTab === "upload" ? (
                  <>
                    <button
                      type="button"
                      className="gotipe-media-upload-button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={triggerFilePicker}
                    >
                      Upload file
                    </button>
                    <p className="gotipe-media-insert-note">You can also drag and drop a file.</p>
                  </>
                ) : null}
                {activeTab === "link" ? (
                  <form
                    className="gotipe-media-link-form gotipe-media-link-form--file"
                    onSubmit={submitLink}
                  >
                    <input
                      type="url"
                      placeholder="https://example.com/file.pdf"
                      value={linkUrlValue}
                      onChange={(e) => {
                        setLinkUrlValue(e.target.value);
                        if (linkError) setLinkError(null);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <input
                      type="text"
                      placeholder="File name (optional)"
                      value={linkNameValue}
                      onChange={(e) => setLinkNameValue(e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <button type="submit" onMouseDown={(e) => e.preventDefault()}>
                      Insert
                    </button>
                  </form>
                ) : null}
                {linkError ? <p className="gotipe-media-insert-error">{linkError}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </figure>
  );
}

/* ---- Toggle Block ---- */

function ToggleBlock({
  block,
  editor,
  selectedBlockId,
}: {
  block: BlockView;
  editor: GoTipeEditor;
  selectedBlockId: string;
}) {
  const content = <BlockContent block={block} />;
  const children = (
    <BlockChildren block={block} editor={editor} selectedBlockId={selectedBlockId} />
  );
  const isOpen = !!block.attrs.open;

  return (
    <details
      data-block-id={block.id}
      data-block-type={block.type}
      className="gotipe-toggle"
      open={isOpen}
    >
      <summary
        onMouseDown={(e) => {
          // Only handle clicks on the summary marker area (not the text content)
          const target = e.target as HTMLElement;
          if (target.tagName === "SUMMARY" || target.closest("summary") === e.currentTarget) {
            e.preventDefault();
            e.stopPropagation();
            editor.chain().setBlockAttrs(block.id, { open: !isOpen }).run();
          }
        }}
      >
        {content}
      </summary>
      <div className="gotipe-toggle-content">{children}</div>
    </details>
  );
}

/* ---- Callout Block ---- */

function CalloutBlock({
  block,
  editor,
  selectedBlockId,
}: {
  block: BlockView;
  editor: GoTipeEditor;
  selectedBlockId: string;
}) {
  const content = <BlockContent block={block} />;
  const children = (
    <BlockChildren block={block} editor={editor} selectedBlockId={selectedBlockId} />
  );
  const variant = (block.attrs.type as string) || "info";
  const emoji = block.attrs.emoji ? String(block.attrs.emoji) : null;

  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      data-variant={variant}
      className="gotipe-callout"
      role="note"
    >
      {emoji ? (
        <span
          className="gotipe-callout-emoji"
          contentEditable={false}
          role="img"
          aria-label="callout icon"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const newEmoji = prompt("Enter emoji:", emoji);
            if (newEmoji) {
              editor.chain().setBlockAttrs(block.id, { emoji: newEmoji }).run();
            }
          }}
        >
          {emoji}
        </span>
      ) : null}
      <div className="gotipe-callout-content">
        {content}
        {children}
      </div>
    </div>
  );
}

/* ---- Table Block ---- */

function TableBlock({
  block,
  editor,
  selectedBlockId,
}: {
  block: BlockView;
  editor: GoTipeEditor;
  selectedBlockId: string;
}) {
  const children = (
    <BlockChildren block={block} editor={editor} selectedBlockId={selectedBlockId} />
  );
  const hasHeader =
    block.children.length > 0 && block.children[0]!.children.some((c) => c.type === "tableHeader");

  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      className="gotipe-table-wrapper"
      contentEditable={false}
    >
      <table className="gotipe-table">
        {hasHeader ? (
          <>
            <thead>
              <BlockComponent
                block={block.children[0]!}
                editor={editor}
                selectedBlockId={selectedBlockId}
                parentType={block.type}
              />
            </thead>
            <tbody>
              {block.children.slice(1).map((child) => (
                <BlockComponent
                  key={child.id}
                  block={child}
                  editor={editor}
                  selectedBlockId={selectedBlockId}
                  parentType={block.type}
                />
              ))}
            </tbody>
          </>
        ) : (
          <tbody>{children}</tbody>
        )}
      </table>
    </div>
  );
}

interface BlockComponentProps {
  block: BlockView;
  editor: GoTipeEditor;
  selectedBlockId: string;
  parentType?: string;
}

function BlockComponent({ block, editor, selectedBlockId, parentType }: BlockComponentProps) {
  const content = <BlockContent block={block} />;
  const children = (
    <BlockChildren block={block} editor={editor} selectedBlockId={selectedBlockId} />
  );
  const isSelected = selectedBlockId === block.id;
  const isEmpty = isBlockContentEmpty(block);
  const shouldShowPlaceholder = isEmpty && (isSelected || block.type === "heading");
  const placeholder = shouldShowPlaceholder ? getEmptyBlockPlaceholder(block, parentType) : null;

  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max((block.attrs.level as number) || 1, 1), 6);
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag
          data-block-id={block.id}
          data-block-type={block.type}
          data-placeholder={placeholder ?? undefined}
        >
          {content}
        </Tag>
      );
    }

    case "bulletList":
      return (
        <ul data-block-id={block.id} data-block-type={block.type}>
          {children}
        </ul>
      );

    case "orderedList":
      return (
        <ol data-block-id={block.id} data-block-type={block.type}>
          {children}
        </ol>
      );

    case "listItem":
      return (
        <li
          data-block-id={block.id}
          data-block-type={block.type}
          data-placeholder={placeholder ?? undefined}
        >
          {content}
          {children}
        </li>
      );

    case "todoList":
      return (
        <ul data-block-id={block.id} data-block-type={block.type} className="gotipe-todo-list">
          {children}
        </ul>
      );

    case "todoItem": {
      const checked = !!block.attrs.checked;
      return (
        <li
          data-block-id={block.id}
          data-block-type={block.type}
          className="gotipe-todo-item"
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('input[type="checkbox"]')) return;

            const host = e.currentTarget.querySelector("[data-gotipe-todo-content]");
            if (!(host instanceof HTMLElement)) return;
            if (e.clientX > host.getBoundingClientRect().left) return;

            // Prevent transient caret placement on <li> left edge when clicking left zone.
            e.preventDefault();
            const selection = window.getSelection();
            if (!selection) return;
            const range = document.createRange();
            range.setStart(host, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            editor.syncSelectionFromDOM();
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            contentEditable={false}
            aria-label={checked ? "Mark as incomplete" : "Mark as complete"}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().setBlockAttrs(block.id, { checked: !checked }).run();
            }}
            onChange={() => {}}
          />
          <span
            className="gotipe-todo-item-content"
            data-gotipe-todo-content=""
            data-placeholder={placeholder ?? undefined}
          >
            {content}
          </span>
        </li>
      );
    }

    case "codeBlock":
      return (
        <pre
          data-block-id={block.id}
          data-block-type={block.type}
          className="gotipe-code-block"
          aria-label={`Code block${block.attrs.language ? `, ${block.attrs.language}` : ""}`}
        >
          <code className={block.attrs.language ? `language-${block.attrs.language}` : undefined}>
            {typeof block.content === "string" ? block.content : content}
          </code>
        </pre>
      );

    case "blockquote":
      return (
        <blockquote
          data-block-id={block.id}
          data-block-type={block.type}
          data-placeholder={placeholder ?? undefined}
        >
          {content}
          {children}
        </blockquote>
      );

    case "divider":
      return <hr data-block-id={block.id} data-block-type={block.type} />;

    case "image":
      return <ImageBlock block={block} editor={editor} />;

    case "file":
      return <FileBlock block={block} editor={editor} />;

    case "table":
      return <TableBlock block={block} editor={editor} selectedBlockId={selectedBlockId} />;

    case "tableRow":
      return (
        <tr data-block-id={block.id} data-block-type={block.type}>
          {children}
        </tr>
      );

    case "tableHeader":
      return (
        <th data-block-id={block.id} data-block-type={block.type} contentEditable>
          {content}
        </th>
      );

    case "tableCell":
      return (
        <td data-block-id={block.id} data-block-type={block.type} contentEditable>
          {content}
        </td>
      );

    case "callout":
      return <CalloutBlock block={block} editor={editor} selectedBlockId={selectedBlockId} />;

    case "toggle":
      return <ToggleBlock block={block} editor={editor} selectedBlockId={selectedBlockId} />;

    case "columns":
      return (
        <div
          data-block-id={block.id}
          data-block-type={block.type}
          className="gotipe-columns"
          data-columns-count={block.attrs.count ?? block.children.length}
        >
          {children}
        </div>
      );

    case "column":
      return (
        <div data-block-id={block.id} data-block-type={block.type} className="gotipe-column">
          {content}
          {children}
        </div>
      );

    default:
      return (
        <p
          data-block-id={block.id}
          data-block-type={block.type || "paragraph"}
          data-placeholder={placeholder ?? undefined}
        >
          {content}
        </p>
      );
  }
}

export function EditorContent({
  editor,
  blockRenderer: _blockRenderer,
}: {
  editor: GoTipeEditor | null;
  blockRenderer?: (props: BlockRendererProps) => React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewState = useViewState(editor);

  useEffect(() => {
    if (containerRef.current && editor) {
      editor.mount(containerRef.current);
      return () => editor.unmount();
    }
  }, [editor]);

  const blocks = viewState?.blocks ?? [];
  const selectedBlockId = viewState?.selection.anchor.blockId ?? "";

  return (
    <>
      <div
        ref={containerRef}
        role="textbox"
        aria-multiline={true}
        aria-label="Document content"
        tabIndex={0}
        className="gotipe-content"
        data-gotipe-content=""
        contentEditable={!!editor}
        suppressContentEditableWarning
      >
        {editor &&
          blocks.map((block) => (
            <BlockComponent
              key={block.id}
              block={block}
              editor={editor}
              selectedBlockId={selectedBlockId}
            />
          ))}
      </div>
      {/* Screen reader live region for status updates */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="gotipe-sr-only"
        data-gotipe-live-region=""
      />
    </>
  );
}
