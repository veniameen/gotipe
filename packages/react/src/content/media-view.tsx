import { toSafeHref } from "@gotipe/core";
import { useRef, useState } from "react";
import { useResolvedAsset } from "../host-assets";
import { useGoTipeI18n } from "../i18n-context";
import { downloadAsset } from "../media/download";
import { MediaGlyph, PlaceholderFileIcon, PlaceholderImageIcon } from "../media/icons";
import { formatFileSize } from "../media/links";
import { type MediaBlockProps, useMediaBlocks } from "./media-blocks";
import { useMissingNaturalWidth } from "./natural-width";

function rootClass(base: string, rootProps: Record<string, unknown>): string {
  return [base, rootProps.className].filter(Boolean).join(" ");
}

function Placeholder({ kind, label }: { kind: "image" | "file"; label: string }) {
  return (
    <div className="gotipe-media-placeholder-shell">
      <div className={`gotipe-${kind}-placeholder gotipe-media-placeholder`}>
        <span className="gotipe-media-placeholder-icon" aria-hidden="true">
          {kind === "image" ? <PlaceholderImageIcon /> : <PlaceholderFileIcon />}
        </span>
        <span className="gotipe-media-placeholder-label">{label}</span>
      </div>
    </div>
  );
}

/** An image as the reader sees it: picture, failed state and caption, with no editing tools. */
function ImageView({ block, editor, rootProps }: MediaBlockProps) {
  const src = (block.attrs.src as string) || "";
  const alt = (block.attrs.alt as string) || "";
  const width = block.attrs.width as number | undefined;
  const caption = (block.attrs.caption as string) || "";
  const i18n = useGoTipeI18n();
  const { url, failed: assetFailed } = useResolvedAsset(editor, src);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const failed = assetFailed || (url !== null && failedSource === url);
  const image = useRef<HTMLImageElement | null>(null);
  const noNaturalWidth = useMissingNaturalWidth(image, url);
  return (
    <figure
      {...rootProps}
      data-block-type={block.type}
      className={rootClass("gotipe-image-block", rootProps)}
      contentEditable={false}
    >
      {src && failed ? (
        <div className="gotipe-image-error">
          <MediaGlyph kind="warning" />
          <span className="gotipe-image-error-text">
            {i18n.t("media.imageUnavailable")}
            {alt && <span className="gotipe-sr-only">: {alt}</span>}
          </span>
        </div>
      ) : src ? (
        <div
          className="gotipe-image-loaded-shell"
          data-natural-width={noNaturalWidth && !width ? "none" : undefined}
        >
          <img
            ref={image}
            src={url ?? undefined}
            alt={alt}
            onError={() => setFailedSource(url)}
            style={width ? { width: `${width}px`, maxWidth: "100%", height: "auto" } : undefined}
          />
        </div>
      ) : (
        <Placeholder kind="image" label={i18n.t("media.addImage")} />
      )}
      {src && caption ? (
        <figcaption>
          <div aria-label={i18n.t("media.captionLabel")}>{caption}</div>
        </figcaption>
      ) : null}
    </figure>
  );
}

/** A file card with its name and size; the name opens or downloads the file. */
function FileView({ block, editor, rootProps }: MediaBlockProps) {
  const i18n = useGoTipeI18n();
  const url = (block.attrs.url as string) || "";
  const name = (block.attrs.name as string) || "";
  const size = typeof block.attrs.size === "number" ? (block.attrs.size as number) : undefined;
  const mimeType = (block.attrs.mime_type as string) || "";
  const { url: displayUrl, failed } = useResolvedAsset(editor, url);
  const meta = [mimeType, formatFileSize(size, i18n)].filter(Boolean).join(" • ");
  return (
    <figure
      {...rootProps}
      data-block-type={block.type}
      className={rootClass("gotipe-file-block", rootProps)}
      contentEditable={false}
    >
      {url ? (
        <div className={`gotipe-file-card${failed ? " is-failed" : ""}`}>
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
            <div className="gotipe-file-card-meta">
              {failed ? i18n.t("media.fileUnavailable") : meta || i18n.t("media.fileAttachment")}
            </div>
          </div>
        </div>
      ) : (
        <Placeholder kind="file" label={i18n.t("media.addFile")} />
      )}
    </figure>
  );
}

/** Image and file blocks: the editing views of `@gotipe/react/media` when provided, else read-only. */
export function MediaBlock(props: MediaBlockProps) {
  const media = useMediaBlocks();
  const kind = props.block.type === "file" ? "file" : "image";
  if (media) {
    const View = media[kind];
    return <View {...props} />;
  }
  return kind === "file" ? <FileView {...props} /> : <ImageView {...props} />;
}
