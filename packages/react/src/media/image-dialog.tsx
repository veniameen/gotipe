import { type BlockView, type GoTipeEditor, GoTipeError } from "@gotipe/core";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAssetUpload } from "./use-asset-upload";

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function cropImage(src: string, crop: Crop): Promise<File> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = src;
  await image.decode();
  const width = Math.max(1, Math.round((image.naturalWidth * crop.width) / 100));
  const height = Math.max(1, Math.round((image.naturalHeight * crop.height) / 100));
  if (width * height > 16_000_000)
    throw new Error("The crop exceeds 16 megapixels. Choose a smaller area.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot crop images");
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
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the cropped image"))),
      "image/png",
    ),
  );
  return new File([blob], "cropped-image.png", { type: "image/png" });
}

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
  const title =
    mode === "preview" ? "Image preview" : mode === "crop" ? "Crop image" : "Image description";
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
      const file = await cropImage(src, crop);
      if (active.current && !editor.isDestroyed) await upload(file, originalSource.current);
    } catch (cause) {
      if (!active.current || editor.isDestroyed) return;
      const message = cause instanceof Error ? cause.message : "Could not crop image";
      setError(`${message}. For a remote image, its server must allow cross-origin access.`);
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
          <button type="button" onClick={onClose} aria-label="Close image dialog">
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
            Alternative text
            <input
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              placeholder="Describe the image"
            />
          </label>
        )}
        {mode === "crop" && (
          <>
            <div className="gotipe-crop-fields">
              {(["x", "y", "width", "height"] as const).map((key) => (
                <label key={key}>
                  {{ x: "Left", y: "Top", width: "Width", height: "Height" }[key]} (%)
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
            <p>
              The selected area is saved as PNG. Animated images use the first frame. Undo restores
              the original image.
            </p>
          </>
        )}
        {(error || uploadError) && (
          <p role="alert" className="gotipe-media-insert-error">
            {error || uploadError}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose}>
            {mode === "preview" ? "Close" : "Cancel"}
          </button>
          {mode !== "preview" && (
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          )}
        </footer>
      </form>
    </dialog>,
    editor.element?.parentElement ?? document.body,
  );
}
