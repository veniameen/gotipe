import {
  type GoTipeEditor,
  GoTipeError,
  type ImageSource,
  type ImageSourceItem,
} from "@gotipe/core";
import type React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useGoTipeI18n } from "../i18n-context";
import { useMediaOptions } from "../media-options";
import { useFloatingPosition } from "../use-floating-position";
import { MediaGlyph, PlaceholderImageIcon } from "./icons";
import { normalizeHttpUrl } from "./links";

function Catalog({
  editor,
  source,
  onSource,
}: {
  editor: GoTipeEditor;
  source: ImageSource;
  onSource: (src: string, alt: string) => void;
}) {
  const i18n = useGoTipeI18n();
  const { inlineErrors } = useMediaOptions();
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
      const message = cause instanceof Error ? cause.message : i18n.t("media.searchFailed");
      setError(message);
      setStatus("error");
      // the panel says it itself; without that text the host is told instead
      if (!inlineErrors)
        editor.reportError(
          new GoTipeError("ASSET_RESOLVE_FAILED", message, { source: source.id, query, cause }),
        );
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
          aria-label={i18n.t("media.searchSource", { source: source.label })}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={i18n.t("media.searchImages")}
        />
        <button type="submit" disabled={status === "loading"}>
          {i18n.t("media.search")}
        </button>
      </form>
      {status === "loading" && <p role="status">{i18n.t("media.searching")}</p>}
      {status === "error" && inlineErrors && (
        <p role="alert" className="gotipe-media-insert-error">
          {error}
        </p>
      )}
      {status === "ready" && !items.length && <p>{i18n.t("media.noImages")}</p>}
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

/** Keeps the editor's selection where it is while a control of the block is pressed. */
const hold = (event: React.MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

/**
 * Atlas frame 10, the empty block: the image glyph, what the block offers, and its two answers on
 * the block itself — upload (the main one) and a link, which opens the address field (and the
 * host's image catalogs, when there are any). A file can also be dropped on the block.
 * With `links: false` (`MediaOptions`) the second button opens only the catalogs, if any.
 */
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
  const i18n = useGoTipeI18n();
  const { links, inlineErrors } = useMediaOptions();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("link");
  const [dragOver, setDragOver] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const shell = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const linkButton = useRef<HTMLButtonElement>(null);
  const address = useRef<HTMLInputElement>(null);
  const anchor = useCallback(() => shell.current?.getBoundingClientRect() ?? null, []);
  const position = useFloatingPosition({ open: open && !readOnly, anchor, element: panel });
  const placed = Boolean(position);
  const sources = (editor.host.imageSources ?? []).filter(
    (source) => source.id !== "upload" && source.id !== "link",
  );
  const source = sources.find((item) => item.id === tab);
  const tabs = links ? [{ id: "link", label: i18n.t("media.link") }, ...sources] : sources;
  // without links the button names the catalogs: the only one by its label
  const browseLabel = sources.length === 1 ? sources[0]?.label : i18n.t("media.imageSource");
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!shell.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  // The address field takes the caret once the panel has its place (it is hidden until then).
  useEffect(() => {
    if (open && placed && tab === "link") address.current?.focus({ preventScroll: true });
  }, [open, placed, tab]);
  return (
    <div className="gotipe-media-placeholder-shell" ref={shell}>
      <div
        className={`gotipe-image-placeholder gotipe-media-placeholder${dragOver ? " dragover" : ""}`}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) hold(event);
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
        <span className="gotipe-media-placeholder-label">{i18n.t("media.addImage")}</span>
        <span className="gotipe-media-placeholder-actions">
          <button
            type="button"
            className="gotipe-media-button is-primary"
            aria-label={i18n.t(uploading ? "media.uploading" : "media.uploadImage")}
            title={i18n.t("media.imageNote")}
            disabled={readOnly || uploading}
            onMouseDown={hold}
            onClick={onPick}
          >
            <MediaGlyph kind="upload" />
            {i18n.t(uploading ? "media.uploading" : "media.upload")}
          </button>
          {tabs.length > 0 && (
            <button
              type="button"
              ref={linkButton}
              className="gotipe-media-button"
              aria-label={links ? i18n.t("media.addImageByLink") : browseLabel}
              aria-expanded={open}
              disabled={readOnly}
              onMouseDown={hold}
              onClick={() => {
                setOpen((value) => !value);
                setTab(tabs[0]?.id ?? "link");
                setError("");
              }}
            >
              {links && <MediaGlyph kind="link" />}
              {links ? i18n.t("media.byLink") : browseLabel}
            </button>
          )}
        </span>
      </div>
      {open && !readOnly && (
        <div
          ref={panel}
          className="gotipe-media-insert-panel"
          aria-label={i18n.t("media.imageSource")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
              linkButton.current?.focus();
            }
          }}
          style={{
            position: "fixed",
            ...position,
            visibility: position ? "visible" : "hidden",
            overflow: "auto",
          }}
        >
          {tabs.length > 1 && (
            <div
              className="gotipe-media-insert-tabs"
              role="tablist"
              aria-label={i18n.t("media.imageSourceTabs")}
            >
              {tabs.map((item) => (
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
              ))}
            </div>
          )}
          <div className="gotipe-media-insert-content">
            {links && tab === "link" && (
              <form
                noValidate
                className="gotipe-media-link-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const normalized = normalizeHttpUrl(link);
                  if (!normalized) {
                    const message = i18n.t("media.invalidImageUrl");
                    setError(message);
                    if (!inlineErrors)
                      editor.reportError(
                        new GoTipeError("LINK_BLOCKED", message, { url: link, kind: "image" }),
                      );
                    address.current?.focus();
                    return;
                  }
                  onSource(normalized, "");
                }}
              >
                <input
                  ref={address}
                  type="url"
                  aria-label={i18n.t("media.imageUrl")}
                  aria-invalid={error ? true : undefined}
                  aria-errormessage={error && inlineErrors ? errorId : undefined}
                  title={(inlineErrors && error) || undefined}
                  placeholder="https://example.com/image.png"
                  value={link}
                  onChange={(event) => {
                    setLink(event.target.value);
                    setError("");
                  }}
                />
                <button type="submit">{i18n.t("media.insert")}</button>
              </form>
            )}
            {source && (
              <Catalog key={source.id} editor={editor} source={source} onSource={onSource} />
            )}
            {/* A wrong address marks the field; the reason is its tooltip and is read aloud. */}
            {error && inlineErrors && tab === "link" && (
              <p id={errorId} role="alert" className="gotipe-sr-only">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
