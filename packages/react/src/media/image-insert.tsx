import type { GoTipeEditor, ImageSource, ImageSourceItem } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFloatingPosition } from "../use-floating-position";
import { PlaceholderImageIcon } from "./icons";
import { normalizeHttpUrl } from "./links";

function Catalog({
  source,
  onSource,
}: { source: ImageSource; onSource: (src: string, alt: string) => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ImageSourceItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus("loading");
    try {
      const result = await source.search(query.trim(), controller.signal);
      if (controller.signal.aborted) return;
      setItems(result.slice(0, 40).filter((item) => normalizeHttpUrl(item.src)));
      setStatus("ready");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Image search failed");
      setStatus("error");
    }
  }
  return (
    <>
      <form
        className="gotipe-media-link-form"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          type="search"
          aria-label={`Search ${source.label}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search images"
        />
        <button type="submit" disabled={status === "loading"}>
          Search
        </button>
      </form>
      {status === "loading" && <p role="status">Searching…</p>}
      {status === "error" && (
        <p role="alert" className="gotipe-media-insert-error">
          {error}
        </p>
      )}
      {status === "ready" && !items.length && <p>No images found</p>}
      <div className="gotipe-image-catalog">
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => onSource(item.src, item.alt)}
            title={item.alt}
          >
            <img
              src={normalizeHttpUrl(item.thumbnail ?? item.src) ?? undefined}
              alt={item.alt}
              loading="lazy"
            />
            {item.attribution && <small>{item.attribution}</small>}
          </button>
        ))}
      </div>
    </>
  );
}

export function ImageInsert({
  editor,
  readOnly,
  uploading,
  onUpload,
  onSource,
  onPick,
}: {
  editor: GoTipeEditor;
  readOnly: boolean;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
  onSource: (src: string, alt: string) => void;
  onPick: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("upload");
  const [dragOver, setDragOver] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const shell = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const anchor = useCallback(() => shell.current?.getBoundingClientRect() ?? null, []);
  const position = useFloatingPosition({ open: open && !readOnly, anchor, element: panel });
  const sources = (editor.host.imageSources ?? []).filter(
    (source) => source.id !== "upload" && source.id !== "link",
  );
  const source = sources.find((item) => item.id === tab);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!shell.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  return (
    <div className="gotipe-media-placeholder-shell" ref={shell}>
      <button
        type="button"
        className={`gotipe-image-placeholder gotipe-media-placeholder${dragOver ? " dragover" : ""}`}
        aria-label="Add an image"
        disabled={readOnly}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={() => {
          setOpen((value) => !value);
          setTab("upload");
        }}
        onDragOver={(event) => {
          if (readOnly) return;
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragOver(false);
          const file = event.dataTransfer.files[0];
          if (file && !readOnly) void onUpload(file);
        }}
      >
        <span className="gotipe-media-placeholder-icon" aria-hidden="true">
          <PlaceholderImageIcon />
        </span>
        <span className="gotipe-media-placeholder-label">Add an image</span>
      </button>
      {open && !readOnly && (
        <div
          ref={panel}
          className="gotipe-media-insert-panel"
          aria-label="Image source"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
              shell.current?.querySelector("button")?.focus();
            }
          }}
          style={{
            position: "fixed",
            ...position,
            visibility: position ? "visible" : "hidden",
            overflow: "auto",
          }}
        >
          <div className="gotipe-media-insert-tabs" role="tablist" aria-label="Image source tabs">
            {[{ id: "upload", label: "Upload" }, { id: "link", label: "Link" }, ...sources].map(
              (item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`gotipe-media-tab${tab === item.id ? " active" : ""}`}
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => {
                    setTab(item.id);
                    setError("");
                  }}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>
          <div className="gotipe-media-insert-content">
            {tab === "upload" && (
              <>
                <button
                  type="button"
                  className="gotipe-media-upload-button"
                  disabled={uploading}
                  onClick={onPick}
                >
                  {uploading ? "Uploading…" : "Upload image"}
                </button>
                <p className="gotipe-media-insert-note">
                  PNG, JPEG, GIF or WebP. You can also drop an image here.
                </p>
              </>
            )}
            {tab === "link" && (
              <form
                className="gotipe-media-link-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const normalized = normalizeHttpUrl(link);
                  if (!normalized) {
                    setError("Enter a valid image URL");
                    return;
                  }
                  onSource(normalized, "");
                }}
              >
                <input
                  type="url"
                  aria-label="Image URL"
                  placeholder="https://example.com/image.png"
                  value={link}
                  onChange={(event) => {
                    setLink(event.target.value);
                    setError("");
                  }}
                />
                <button type="submit">Insert</button>
              </form>
            )}
            {source && <Catalog key={source.id} source={source} onSource={onSource} />}
            {error && (
              <p role="alert" className="gotipe-media-insert-error">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
