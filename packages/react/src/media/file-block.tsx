import { type BlockView, type GoTipeEditor, toSafeHref } from "@gotipe/core";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePhantom } from "../content/context";
import { useResolvedAsset } from "../host-assets";
import { useFloatingPosition } from "../use-floating-position";
import { downloadAsset } from "./download";
import { PlaceholderFileIcon } from "./icons";
import { formatFileSize, inferFileNameFromUrl, normalizeHttpUrl } from "./links";
import { useAssetUpload } from "./use-asset-upload";
type FileInsertTab = "upload" | "link";

export function FileBlock({
  block,
  editor,
  rootProps,
}: { block: BlockView; editor: GoTipeEditor; rootProps: Record<string, unknown> }) {
  const url = (block.attrs.url as string) || "";
  const { url: displayUrl, failed: assetFailed } = useResolvedAsset(editor, url);
  const readOnly = usePhantom() || !editor.isEditable;
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
      if (file) void uploadFile(file);
    },
    [uploadFile],
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
      {...rootProps}
      data-block-type={block.type}
      className={["gotipe-file-block", rootProps.className].filter(Boolean).join(" ")}
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
              href={displayUrl ? (toSafeHref(displayUrl) ?? undefined) : undefined}
              target="_blank"
              rel="noreferrer noopener"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                if (!displayUrl) return;
                if (displayUrl.startsWith("data:")) downloadAsset(editor, displayUrl, name);
                else editor.openLink(displayUrl, { blockId: block.id, newTab: true });
              }}
            >
              {name || "Untitled file"}
            </a>
            <div className="gotipe-file-card-meta">{fileMeta || "File attachment"}</div>
          </div>
          <div className="gotipe-media-actions">
            <button
              type="button"
              className="gotipe-media-action-btn"
              disabled={readOnly}
              onMouseDown={(e) => e.preventDefault()}
              onClick={triggerFilePicker}
            >
              Replace
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
            disabled={readOnly}
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
          {isInsertPanelOpen && !readOnly ? (
            <div
              ref={insertPanelRef}
              className="gotipe-media-insert-panel"
              aria-label="File source"
              style={{
                position: "fixed",
                ...insertPosition,
                visibility: insertPosition ? "visible" : "hidden",
                overflow: "auto",
              }}
            >
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
                      disabled={uploading}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={triggerFilePicker}
                    >
                      {uploading ? "Uploading…" : "Upload file"}
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
      {uploadError ? (
        <p className="gotipe-media-insert-error" role="alert">
          {uploadError}
        </p>
      ) : null}
      {assetFailed && (
        <p className="gotipe-media-insert-error" role="alert">
          File unavailable
        </p>
      )}
    </figure>
  );
}
