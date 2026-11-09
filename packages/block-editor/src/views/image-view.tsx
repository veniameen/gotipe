import type { BlockView, GoTipeEditor } from "@gotipe/core";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type ImageInsertTab = "upload" | "link" | "unsplash" | "giphy";
type ResizeDirection = "left" | "right";

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

function ImageOptionsItem({
  label,
  meta,
  danger = false,
  onClick,
}: {
  label: string;
  meta?: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`gotipe-image-options-item${danger ? " danger" : ""}`}
      onClick={onClick}
    >
      <span className="gotipe-image-options-item-main">
        <span>{label}</span>
      </span>
      {meta ? <span className="gotipe-image-options-item-meta">{meta}</span> : null}
    </button>
  );
}

export function ImageView({ block, editor }: { block: BlockView; editor: GoTipeEditor }) {
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
              <ImageOptionsItem label="Replace" onClick={triggerFilePicker} />
              <ImageOptionsItem label="Copy image" onClick={() => void copyImage()} />
              <ImageOptionsItem label="Download" onClick={downloadImage} />
              <ImageOptionsItem label="Caption" meta="Cmd+Shift+M" onClick={focusCaption} />
              <ImageOptionsItem label="Crop image" onClick={closeImageOptions} />
              <ImageOptionsItem label="More options" meta=">" onClick={closeImageOptions} />
              <div className="gotipe-image-options-divider" />
              <ImageOptionsItem
                label="Copy link to block"
                meta="Cmd+Alt+L"
                onClick={() => void copyBlockLink()}
              />
              <ImageOptionsItem label="Duplicate" meta="Cmd+D" onClick={duplicateImageBlock} />
              <ImageOptionsItem label="Move to" meta="Cmd+Shift+P" onClick={closeImageOptions} />
              <ImageOptionsItem label="Remove image" onClick={clearImage} />
              <ImageOptionsItem label="Delete" meta="Del" danger onClick={removeImageBlock} />
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
                {activeTab === "unsplash" || activeTab === "giphy" ? (
                  <p className="gotipe-media-insert-note">
                    {activeTab === "unsplash"
                      ? "Unsplash integration coming soon."
                      : "GIPHY integration coming soon."}
                  </p>
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
          data-caption=""
          onInput={(e) => {
            const text = (e.target as HTMLElement).textContent ?? "";
            editor.chain().setBlockAttrs(block.id, { caption: text }).run();
            if (!text.trim()) setIsCaptionVisible(false);
          }}
          onBlur={(e) => {
            if (!(e.currentTarget.textContent ?? "").trim()) {
              setIsCaptionVisible(false);
            }
          }}
          aria-label="Image caption"
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
