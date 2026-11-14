import { type BlockView, type GoTipeEditor, GoTipeError } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePhantom } from "../content/context";
import { useMissingNaturalWidth } from "../content/natural-width";
import { useResolvedAsset } from "../host-assets";
import { useGoTipeI18n } from "../i18n-context";
import { useFloatingPosition } from "../use-floating-position";
import { downloadAsset } from "./download";
import { ImageToolbarIcon, MediaGlyph } from "./icons";
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
  const i18n = useGoTipeI18n();
  const { url: displaySrc, failed: assetFailed } = useResolvedAsset(editor, src);
  // The browser could not show this source: the block shows its failed state (Atlas frame 17)
  // until the source changes or the reader retries.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loadFailed = displaySrc !== null && failedSource === displaySrc;
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
  const noNaturalWidth = useMissingNaturalWidth(
    imageRef,
    displaySrc === null ? null : `${attempt}:${displaySrc}`,
  );
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
    if (displaySrc)
      downloadAsset(editor, displaySrc, alt || "image", i18n.t("media.unsupportedUrl"));
    setIsOptionsOpen(false);
  }, [editor, displaySrc, alt, i18n]);

  const clipboardFailure = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : i18n.t("media.clipboardUnavailable");
      setActionError(message);
      editor.reportError(new GoTipeError("CLIPBOARD_FAILED", message));
    },
    [editor, i18n],
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
      label: i18n.t("media.editAlt"),
      onClick: () => {
        setDialogMode("alt");
        closeImageOptions();
      },
    },
    {
      id: "crop",
      icon: "crop",
      label: i18n.t("media.crop"),
      onClick: () => {
        setDialogMode("crop");
        closeImageOptions();
      },
    },
    {
      id: "replace",
      icon: "replace",
      label: i18n.t("media.replaceImage"),
      onClick: triggerFilePicker,
    },
    { id: "copy", icon: "copy", label: i18n.t("media.copyUrl"), onClick: () => void copyImage() },
    {
      id: "download",
      icon: "download",
      label: i18n.t("media.downloadImage"),
      onClick: downloadImage,
    },
    { id: "caption", icon: "caption", label: i18n.t("media.editCaption"), onClick: focusCaption },
    {
      id: "link",
      icon: "link",
      label: i18n.t("media.copyBlockLink"),
      onClick: () => void copyBlockLink(),
    },
    {
      id: "duplicate",
      icon: "duplicate",
      label: i18n.t("media.duplicateImage"),
      onClick: duplicateImageBlock,
    },
    {
      id: "up",
      icon: "move",
      label: i18n.t("media.moveUp"),
      onClick: () => {
        editor.chain().moveBlockUp(block.id).run();
        closeImageOptions();
      },
    },
    {
      id: "down",
      icon: "move",
      label: i18n.t("media.moveDown"),
      onClick: () => {
        editor.chain().moveBlockDown(block.id).run();
        closeImageOptions();
      },
    },
    {
      id: "delete",
      icon: "delete",
      label: i18n.t("media.deleteImage"),
      danger: true,
      onClick: removeImageBlock,
    },
  ];

  const renderWidth = draftWidth ?? width;
  const showImageControls =
    !readOnly && Boolean(src) && (isHovered || isFocused || isResizing || isOptionsOpen);
  const failed = assetFailed || loadFailed;

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
      {src && failed ? (
        <div className="gotipe-image-error">
          <MediaGlyph kind="warning" />
          <span className="gotipe-image-error-text">
            {i18n.t("media.imageUnavailable")}
            {alt && <span className="gotipe-sr-only">: {alt}</span>}
          </span>
          {!readOnly && (
            <span className="gotipe-image-error-actions">
              {loadFailed && (
                <button
                  type="button"
                  className="gotipe-media-button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setFailedSource(null);
                    setAttempt((value) => value + 1);
                  }}
                >
                  <MediaGlyph kind="retry" />
                  {i18n.t("media.retry")}
                </button>
              )}
              <button
                type="button"
                className="gotipe-media-button is-quiet"
                onMouseDown={(e) => e.preventDefault()}
                onClick={triggerFilePicker}
              >
                {i18n.t("media.replace")}
              </button>
            </span>
          )}
        </div>
      ) : src ? (
        <div
          ref={imageShellRef}
          className="gotipe-image-loaded-shell"
          data-natural-width={noNaturalWidth && !renderWidth ? "none" : undefined}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          <img
            key={attempt}
            ref={imageRef}
            src={displaySrc ?? undefined}
            alt={alt}
            onError={() => setFailedSource(displaySrc)}
            style={
              renderWidth
                ? { width: `${renderWidth}px`, maxWidth: "100%", height: "auto" }
                : undefined
            }
          />
          {/* The theme draws the tools in the image's top corner (Atlas frame 10). */}
          <div
            ref={toolbarRef}
            className={`gotipe-image-toolbar${showImageControls ? " visible" : ""}`}
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
              aria-label={i18n.t("media.altText")}
            >
              <ImageToolbarIcon kind="caption" />
            </button>
            <button
              type="button"
              className="gotipe-image-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={setOriginalImageWidth}
              aria-label={i18n.t("media.originalSize")}
            >
              <ImageToolbarIcon kind="original" />
            </button>
            <button
              type="button"
              className="gotipe-image-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={resetImageWidth}
              aria-label={i18n.t("media.fitWidth")}
            >
              <ImageToolbarIcon kind="fit" />
            </button>
            <button
              type="button"
              className="gotipe-image-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={focusCaption}
              aria-label={i18n.t("media.caption")}
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
              aria-label={i18n.t("media.zoom")}
            >
              <ImageToolbarIcon kind="zoom" />
            </button>
            <button
              type="button"
              className="gotipe-image-toolbar-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={downloadImage}
              aria-label={i18n.t("media.download")}
            >
              <ImageToolbarIcon kind="download" />
            </button>
            <button
              type="button"
              className={`gotipe-image-toolbar-btn${isOptionsOpen ? " active" : ""}`}
              ref={optionsButtonRef}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setIsOptionsOpen((current) => !current)}
              aria-label={i18n.t("media.moreOptions")}
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
                title={i18n.t("media.resizeHint")}
                aria-label={i18n.t("media.resizeLeft")}
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
                title={i18n.t("media.resizeHint")}
                aria-label={i18n.t("media.resizeRight")}
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
      {actionError && (
        <p className="gotipe-media-insert-error gotipe-media-action-error" role="alert">
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
