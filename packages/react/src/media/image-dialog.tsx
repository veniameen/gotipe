import { type BlockView, type GoTipeEditor, GoTipeError } from "@gotipe/core";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGoTipeI18n } from "../i18n-context";
import { useAssetUpload } from "./use-asset-upload";

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropMessages {
  tooLarge: string;
  unsupported: string;
  encodeFailed: string;
}

async function cropImage(src: string, crop: Crop, messages: CropMessages): Promise<File> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();
  const width = Math.max(1, Math.round((image.naturalWidth * crop.width) / 100));
  const height = Math.max(1, Math.round((image.naturalHeight * crop.height) / 100));
  if (width * height > 16_000_000) throw new Error(messages.tooLarge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(messages.unsupported);
  context.drawImage(
    image,
    (image.naturalWidth * crop.x) / 100,
    (image.naturalHeight * crop.y) / 100,
    (image.naturalWidth * crop.width) / 100,
    (image.naturalHeight * crop.height) / 100,
    0,
    0,
    width,
    height,
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(messages.encodeFailed))),
      "image/png",
    ),
  );
  return new File([blob], "cropped-image.png", { type: "image/png" });
}

const CROP_LABELS = {
  x: "media.cropLeft",
  y: "media.cropTop",
  width: "media.cropWidth",
  height: "media.cropHeight",
} as const;

export function ImageDialog({
  editor,
  block,
  src,
  mode,
  onClose,
}: {
  editor: GoTipeEditor;
  block: BlockView;
  src: string;
  mode: "preview" | "alt" | "crop";
  onClose: () => void;
}) {
  const i18n = useGoTipeI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  const originalSource = useRef(String(block.attrs.src ?? ""));
  const [alt, setAlt] = useState(String(block.attrs.alt ?? ""));
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, width: 100, height: 100 });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    upload,
    pending,
    error: uploadError,
  } = useAssetUpload(editor, block.id, "image", (saved) => {
    editor.chain().setBlockAttrs(block.id, { src: saved.src, alt }).run();
    onClose();
  });
  useEffect(() => {
    active.current = true;
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      active.current = false;
      dialog.current?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  const busy = processing || pending;
  const title = i18n.t(
    mode === "preview" ? "media.previewTitle" : mode === "crop" ? "media.crop" : "media.altTitle",
  );
  async function submit() {
    if (busy || !editor.isEditable || editor.isDestroyed) return;
    setError(null);
    if (mode === "alt") {
      editor.chain().setBlockAttrs(block.id, { alt }).run();
      onClose();
      return;
    }
    setProcessing(true);
    try {
      const file = await cropImage(src, crop, {
        tooLarge: i18n.t("media.cropTooLarge"),
        unsupported: i18n.t("media.cropUnsupported"),
        encodeFailed: i18n.t("media.cropEncodeFailed"),
      });
      if (active.current && !editor.isDestroyed) await upload(file, originalSource.current);
    } catch (cause) {
      if (!active.current || editor.isDestroyed) return;
      const message = cause instanceof Error ? cause.message : i18n.t("media.cropFailed");
      setError(i18n.t("media.cropCors", { message }));
      editor.reportError(new GoTipeError("ASSET_SAVE_FAILED", message));
    } finally {
      if (active.current) setProcessing(false);
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="gotipe-image-dialog"
      aria-label={title}
      contentEditable={false}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <header>
          <strong>{title}</strong>
          <button type="button" onClick={onClose} aria-label={i18n.t("media.closeDialog")}>
            ×
          </button>
        </header>
        <div className="gotipe-image-preview">
          <img src={src} alt={alt} />
          {mode === "crop" && (
            <div
              className="gotipe-image-crop-box"
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.width}%`,
                height: `${crop.height}%`,
              }}
            />
          )}
        </div>
        {mode !== "preview" && (
          <label>
            {i18n.t("media.altText")}
            <input
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              placeholder={i18n.t("media.describe")}
            />
          </label>
        )}
        {mode === "crop" && (
          <>
            <div className="gotipe-crop-fields">
              {(["x", "y", "width", "height"] as const).map((key) => (
                <label key={key}>
                  {i18n.t(CROP_LABELS[key])} (%)
                  <input
                    type="number"
                    min={key === "x" || key === "y" ? 0 : 1}
                    max={100}
                    value={crop[key]}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      setCrop((current) => {
                        const next = {
                          ...current,
                          [key]: Math.max(key === "x" || key === "y" ? 0 : 1, Math.min(100, value)),
                        };
                        next.x = Math.min(next.x, 99);
                        next.y = Math.min(next.y, 99);
                        next.width = Math.min(next.width, 100 - next.x);
                        next.height = Math.min(next.height, 100 - next.y);
                        return next;
                      });
                    }}
                  />
                </label>
              ))}
            </div>
            <p>{i18n.t("media.cropNote")}</p>
          </>
        )}
        {(error || uploadError) && (
          <p role="alert" className="gotipe-media-insert-error">
            {error || uploadError}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose}>
            {i18n.t(mode === "preview" ? "media.close" : "media.cancel")}
          </button>
          {mode !== "preview" && (
            <button type="submit" disabled={busy}>
              {i18n.t(busy ? "media.saving" : "media.save")}
            </button>
          )}
        </footer>
      </form>
    </dialog>,
    editor.element?.parentElement ?? document.body,
  );
}
