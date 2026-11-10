import { type BlockView, type GoTipeEditor, GoTipeError } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePhantom } from "../content/context";
import { useResolvedAsset } from "../host-assets";
import { useFloatingPosition } from "../use-floating-position";
import { downloadAsset } from "./download";
import { ImageToolbarIcon } from "./icons";
import { type ImageAction, ImageActionsMenu } from "./image-actions-menu";
import { ImageCaption } from "./image-caption";
import { ImageDialog } from "./image-dialog";
import { ImageInsert } from "./image-insert";
import { useAssetUpload } from "./use-asset-upload";
import { useHoverIntent } from "./use-hover-intent";
import { useImageResize } from "./use-image-resize";

export function ImageBlock({
  block,
  editor,
  rootProps,
}: { block: BlockView; editor: GoTipeEditor; rootProps: Record<string, unknown> }) {
  const src = (block.attrs.src as string) || "";
  const alt = (block.attrs.alt as string) || "";
  const width = block.attrs.width as number | undefined;
  const caption = (block.attrs.caption as string) || "";
  const { url: displaySrc, failed: assetFailed } = useResolvedAsset(editor, src);
  const { hovered: isHovered, onEnter, onLeave } = useHoverIntent();
  const [isFocused, setIsFocused] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isCaptionVisible, setIsCaptionVisible] = useState(caption.length > 0);
  const [dialogMode, setDialogMode] = useState<"preview" | "alt" | "crop" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const optionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const imageShellRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const captionRef = useRef<HTMLDivElement | null>(null);
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const readOnly = usePhantom() || !editor.isEditable;
  const optionsAnchor = useCallback(
    () => optionsButtonRef.current?.getBoundingClientRect() ?? null,
    [],
  );
  const optionsPosition = useFloatingPosition({
    open: isOptionsOpen && !readOnly,
    anchor: optionsAnchor,
    element: optionsMenuRef,
  });
  const {
    draftWidth,
    isResizing,
    start: handleResizeStart,
    reset,
    original,
    nudge,
  } = useImageResize(editor, block.id, imageRef, imageShellRef, readOnly);
  const resetImageWidth = () => {
    reset();
    setIsOptionsOpen(false);
  };
  const setOriginalImageWidth = () => {
    original();
    setIsOptionsOpen(false);
  };

  const applyImageSource = useCallback(
    (nextSrc: string, nextAlt: string) => {
      if (readOnly || editor.isDestroyed || !editor.isEditable) return;
      editor.chain().setBlockAttrs(block.id, { src: nextSrc, alt: nextAlt }).run();
      setIsOptionsOpen(false);
    },
    [editor, block.id, readOnly],
  );

  const applyUpload = useCallback(
    (saved: { src: string; name: string }) => applyImageSource(saved.src, saved.name),
    [applyImageSource],
  );
  const {
    upload: uploadImage,
    pending: uploading,
    error: uploadError,
  } = useAssetUpload(editor, block.id, "image", applyUpload);

  const triggerFilePicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void uploadImage(file);
    };
    input.click();
  }, [uploadImage]);

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

  const downloadImage = useCallback(() => {
    if (displaySrc) downloadAsset(editor, displaySrc, alt || "image");
    setIsOptionsOpen(false);
  }, [editor, displaySrc, alt]);

  const clipboardFailure = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "Clipboard access is unavailable";
      setActionError(message);
      editor.reportError(new GoTipeError("CLIPBOARD_FAILED", message));
    },
    [editor],
  );

  const copyImage = useCallback(async () => {
    if (!src) return;
    try {
      await navigator.clipboard.writeText(src);
    } catch (error) {
      clipboardFailure(error);
    }
    setIsOptionsOpen(false);
  }, [src, clipboardFailure]);

  const copyBlockLink = useCallback(async () => {
    try {
      const link = new URL(window.location.href);
      link.searchParams.set("gotipe-block", block.id);
      await navigator.clipboard.writeText(link.href);
    } catch (error) {
      clipboardFailure(error);
    }
    setIsOptionsOpen(false);
  }, [block.id, clipboardFailure]);

  const duplicateImageBlock = useCallback(() => {
    editor.chain().duplicateBlock(block.id).run();
    setIsOptionsOpen(false);
  }, [editor, block.id]);

  const removeImageBlock = useCallback(() => {
    editor.chain().deleteBlock(block.id).run();
    setIsOptionsOpen(false);
  }, [editor, block.id]);

  const closeImageOptions = useCallback(() => {
    setIsOptionsOpen(false);
  }, []);

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

  const actions: ImageAction[] = [
    {
      id: "alt",
      icon: "caption",
      label: "Edit alternative text",
      onClick: () => {
        setDialogMode("alt");
        closeImageOptions();
      },
    },
    {
      id: "crop",
      icon: "crop",
      label: "Crop image",
      onClick: () => {
        setDialogMode("crop");
        closeImageOptions();
      },
    },
    { id: "replace", icon: "replace", label: "Replace image", onClick: triggerFilePicker },
    { id: "copy", icon: "copy", label: "Copy image URL", onClick: () => void copyImage() },
    { id: "download", icon: "download", label: "Download image", onClick: downloadImage },
    { id: "caption", icon: "caption", label: "Edit caption", onClick: focusCaption },
    { id: "link", icon: "link", label: "Copy link to block", onClick: () => void copyBlockLink() },
    { id: "duplicate", icon: "duplicate", label: "Duplicate image", onClick: duplicateImageBlock },
    {
      id: "up",
      icon: "move",
      label: "Move up",
      onClick: () => {
        editor.chain().moveBlockUp(block.id).run();
        closeImageOptions();
      },
    },
    {
      id: "down",
      icon: "move",
      label: "Move down",
      onClick: () => {
        editor.chain().moveBlockDown(block.id).run();
        closeImageOptions();
      },
    },
    {
      id: "delete",
      icon: "delete",
      label: "Delete image",
      danger: true,
      onClick: removeImageBlock,
    },
  ];

  const renderWidth = draftWidth ?? width;
  const showImageControls =
    !readOnly && Boolean(src) && (isHovered || isFocused || isResizing || isOptionsOpen);
  const toolbarAnchor = useCallback(
    () => imageShellRef.current?.getBoundingClientRect() ?? null,
    [],
  );
  const toolbarPosition = useFloatingPosition({
    open: showImageControls,
    anchor: toolbarAnchor,
    element: toolbarRef,
    placement: "top",
    revision: draftWidth,
  });

  return (
    <figure
      {...rootProps}
      data-block-type={block.type}
      className={["gotipe-image-block", rootProps.className].filter(Boolean).join(" ")}
      contentEditable={false}
      tabIndex={readOnly ? undefined : 0}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false);
      }}
    >
      {src ? (
        <div
          ref={imageShellRef}
          className="gotipe-image-loaded-shell"
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <img
            ref={imageRef}
            src={displaySrc ?? undefined}
            alt={alt}
            style={
              renderWidth
                ? { width: `${renderWidth}px`, maxWidth: "100%", height: "auto" }
                : undefined
            }
          />
          <div
            ref={toolbarRef}
            className={`gotipe-image-toolbar${showImageControls ? " visible" : ""}`}
            style={{
              position: "fixed",
              transform: "none",
              ...toolbarPosition,
              display: readOnly ? "none" : undefined,
              visibility: toolbarPosition ? "visible" : "hidden",
            }}
            data-gotipe-image-toolbar=""
            hidden={readOnly}
            inert={!showImageControls}
          >
            <button
              type="button"
              className="gotipe-image-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setDialogMode("alt");
                setIsOptionsOpen(false);
              }}
              aria-label="Alternative text"
            >
              <ImageToolbarIcon kind="caption" />
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
                setDialogMode("preview");
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
              ref={optionsButtonRef}
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
                onPointerDown={(e) => handleResizeStart(e, "left")}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    nudge(event.key === "ArrowRight" ? 16 : -16);
                  }
                }}
                title="Use Left and Right arrow keys to resize"
                aria-label="Resize image from left"
              />
              <button
                type="button"
                className="gotipe-image-side-handle gotipe-image-side-handle-right"
                onPointerDown={(e) => handleResizeStart(e, "right")}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    nudge(event.key === "ArrowRight" ? 16 : -16);
                  }
                }}
                title="Use Left and Right arrow keys to resize"
                aria-label="Resize image from right"
              />
            </>
          ) : null}
          {isOptionsOpen && !readOnly ? (
            <ImageActionsMenu
              element={optionsMenuRef}
              actions={actions}
              onClose={closeImageOptions}
              style={{
                position: "fixed",
                ...optionsPosition,
                visibility: optionsPosition ? "visible" : "hidden",
                overflow: "auto",
              }}
            />
          ) : null}
        </div>
      ) : (
        <ImageInsert
          editor={editor}
          readOnly={readOnly}
          uploading={uploading}
          onUpload={uploadImage}
          onSource={applyImageSource}
          onPick={triggerFilePicker}
        />
      )}
      {dialogMode && displaySrc && (
        <ImageDialog
          editor={editor}
          block={block}
          src={displaySrc}
          mode={dialogMode}
          onClose={() => setDialogMode(null)}
        />
      )}
      {assetFailed && (
        <p className="gotipe-media-insert-error" role="alert">
          Image unavailable
        </p>
      )}
      {actionError && (
        <p className="gotipe-media-insert-error" role="alert">
          {actionError}
        </p>
      )}
      {src && (isCaptionVisible || caption) ? (
        <ImageCaption
          editor={editor}
          blockId={block.id}
          caption={caption}
          readOnly={readOnly}
          element={captionRef}
          onEmpty={() => setIsCaptionVisible(false)}
        />
      ) : null}
      {uploadError ? (
        <p className="gotipe-media-insert-error" role="alert">
          {uploadError}
        </p>
      ) : null}
    </figure>
  );
}
