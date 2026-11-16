import { type BlockView, type GoTipeEditor, toSafeHref } from "@gotipe/core";
import type React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePhantom } from "../content/context";
import { useResolvedAsset } from "../host-assets";
import { useGoTipeI18n } from "../i18n-context";
import { useFloatingPosition } from "../use-floating-position";
import { downloadAsset } from "./download";
import { MediaGlyph, PlaceholderFileIcon } from "./icons";
import { formatFileSize, inferFileNameFromUrl, normalizeHttpUrl } from "./links";
import { useAssetUpload } from "./use-asset-upload";

export function FileBlock({
  block,
  editor,
  rootProps,
}: { block: BlockView; editor: GoTipeEditor; rootProps: Record<string, unknown> }) {
  const i18n = useGoTipeI18n();
  const linkErrorId = useId();
  const url = (block.attrs.url as string) || "";
  const { url: displayUrl, failed: assetFailed } = useResolvedAsset(editor, url);
  const readOnly = usePhantom() || !editor.isEditable;
  const name = (block.attrs.name as string) || "";
  const size = typeof block.attrs.size === "number" ? (block.attrs.size as number) : undefined;
  const mimeType = (block.attrs.mime_type as string) || "";

  const [dragOver, setDragOver] = useState(false);
  const [isInsertPanelOpen, setIsInsertPanelOpen] = useState(false);
  const [linkUrlValue, setLinkUrlValue] = useState("");
  const [linkNameValue, setLinkNameValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const insertShellRef = useRef<HTMLDivElement | null>(null);
  const insertPanelRef = useRef<HTMLDivElement | null>(null);
  const insertAnchor = useCallback(
    () => insertShellRef.current?.getBoundingClientRect() ?? null,
    [],
  );
  const insertPosition = useFloatingPosition({
    open: isInsertPanelOpen && !readOnly,
    anchor: insertAnchor,
    element: insertPanelRef,
  });

  const applyFile = useCallback(
    (next: { url: string; name: string; size?: number | null; mime_type?: string }) => {
      if (readOnly || editor.isDestroyed || !editor.isEditable) return;
      editor.chain().setBlockAttrs(block.id, next).run();
      setIsInsertPanelOpen(false);
      setLinkUrlValue("");
      setLinkNameValue("");
      setLinkError(null);
    },
    [editor, block.id, readOnly],
  );

  const applyUpload = useCallback(
    (saved: { src: string; name: string }, file: File) =>
      applyFile({ url: saved.src, name: saved.name, size: file.size, mime_type: file.type }),
    [applyFile],
  );
  const {
    upload: uploadFile,
    pending: uploading,
    error: uploadError,
  } = useAssetUpload(editor, block.id, "file", applyUpload);

  const triggerFilePicker = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void uploadFile(file);
    };
    input.click();
  }, [uploadFile]);

  const submitLink = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const normalized = normalizeHttpUrl(linkUrlValue);
      if (!normalized) {
        setLinkError(i18n.t("media.invalidFileUrl"));
        return;
      }
      const resolvedName =
        linkNameValue.trim() || inferFileNameFromUrl(normalized, i18n.t("media.linkedFile"));
      applyFile({
        url: normalized,
        name: resolvedName,
        size: null,
        mime_type: "",
      });
    },
    [applyFile, linkNameValue, linkUrlValue, i18n],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void uploadFile(file);
    },
    [uploadFile],
  );

  const fileMeta = [mimeType, formatFileSize(size, i18n)].filter(Boolean).join(" • ");

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
      {...rootProps}
      data-block-type={block.type}
      className={["gotipe-file-block", rootProps.className].filter(Boolean).join(" ")}
      contentEditable={false}
    >
      {url ? (
        <div className={`gotipe-file-card${assetFailed ? " is-failed" : ""}`}>
          <span className="gotipe-file-card-icon" aria-hidden="true">
            <PlaceholderFileIcon />
          </span>
          <div className="gotipe-file-card-main">
            <a
              className="gotipe-file-card-name"
              href={displayUrl ? (toSafeHref(displayUrl) ?? undefined) : undefined}
              target="_blank"
              rel="noreferrer noopener"
              onMouseDown={(e) => e.stopPropagation()}
              onClickCapture={(event) => {
                // The card opens its file itself: the click stops before the editor's link
                // handler on the surface would open the same address a second time (D-210).
                event.preventDefault();
                event.stopPropagation();
                if (!displayUrl) return;
                if (displayUrl.startsWith("data:"))
                  downloadAsset(editor, displayUrl, name, i18n.t("media.unsupportedUrl"));
                else editor.openLink(displayUrl, { blockId: block.id, newTab: true });
              }}
            >
              {name || i18n.t("media.untitledFile")}
            </a>
            {/* a file that cannot be reached marks its own card, no line under it */}
            <div className="gotipe-file-card-meta">
              {assetFailed
                ? i18n.t("media.fileUnavailable")
                : fileMeta || i18n.t("media.fileAttachment")}
            </div>
          </div>
          <div className="gotipe-media-actions">
            <button
              type="button"
              className="gotipe-media-action-btn"
              disabled={readOnly}
              onMouseDown={(e) => e.preventDefault()}
              onClick={triggerFilePicker}
            >
              {i18n.t("media.replace")}
            </button>
            <button
              type="button"
              className="gotipe-media-action-btn"
              disabled={readOnly}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (readOnly) return;
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
              {i18n.t("media.remove")}
            </button>
          </div>
        </div>
      ) : (
        <div className="gotipe-media-placeholder-shell" ref={insertShellRef}>
          {/* like an empty image (Atlas frame 10): what the block holds and its two ways in */}
          <div
            className={`gotipe-file-placeholder gotipe-media-placeholder${dragOver ? " dragover" : ""}`}
            onDragOver={(e) => {
              if (readOnly) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <span className="gotipe-media-placeholder-icon" aria-hidden="true">
              <PlaceholderFileIcon />
            </span>
            <span className="gotipe-media-placeholder-label">{i18n.t("media.addFile")}</span>
            <span className="gotipe-media-placeholder-actions">
              <button
                type="button"
                className="gotipe-media-button is-primary"
                aria-label={i18n.t(uploading ? "media.uploading" : "media.uploadFile")}
                disabled={readOnly || uploading}
                onMouseDown={(e) => e.preventDefault()}
                onClick={triggerFilePicker}
              >
                <MediaGlyph kind="upload" />
                {i18n.t(uploading ? "media.uploading" : "media.upload")}
              </button>
              <button
                type="button"
                className="gotipe-media-button"
                aria-label={i18n.t("media.addFileByLink")}
                aria-expanded={isInsertPanelOpen}
                disabled={readOnly}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsInsertPanelOpen((open) => !open);
                }}
              >
                <MediaGlyph kind="link" />
                {i18n.t("media.byLink")}
              </button>
            </span>
          </div>
          {isInsertPanelOpen && !readOnly ? (
            <div
              ref={insertPanelRef}
              className="gotipe-media-insert-panel"
              aria-label={i18n.t("media.fileSource")}
              style={{
                position: "fixed",
                ...insertPosition,
                visibility: insertPosition ? "visible" : "hidden",
                overflow: "auto",
              }}
            >
              {/* uploading starts from the block itself; the panel only takes an address */}
              <div className="gotipe-media-insert-content">
                <form
                  noValidate
                  className="gotipe-media-link-form gotipe-media-link-form--file"
                  onSubmit={submitLink}
                >
                  <input
                    type="url"
                    aria-label={i18n.t("media.fileUrl")}
                    aria-invalid={linkError ? true : undefined}
                    aria-errormessage={linkError ? linkErrorId : undefined}
                    title={linkError ?? undefined}
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
                    aria-label={i18n.t("media.fileName")}
                    placeholder={i18n.t("media.fileName")}
                    value={linkNameValue}
                    onChange={(e) => setLinkNameValue(e.target.value)}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                  <button type="submit" onMouseDown={(e) => e.preventDefault()}>
                    {i18n.t("media.insert")}
                  </button>
                </form>
                {/* A wrong address marks the field; the reason is its tooltip and is read aloud. */}
                {linkError ? (
                  <p id={linkErrorId} role="alert" className="gotipe-sr-only">
                    {linkError}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
      {uploadError ? (
        <p className="gotipe-media-insert-error" role="alert">
          {uploadError}
        </p>
      ) : null}
      {assetFailed && (
        <p className="gotipe-sr-only" role="alert">
          {i18n.t("media.fileUnavailable")}
        </p>
      )}
    </figure>
  );
}
