import type { BlockView, GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";

const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

type HandlePosition = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLE_POSITIONS: HandlePosition[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const HANDLE_CURSORS: Record<HandlePosition, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

function getHandleStyle(pos: HandlePosition): React.CSSProperties {
  const base: React.CSSProperties = { cursor: HANDLE_CURSORS[pos] };
  switch (pos) {
    case "nw":
      return { ...base, top: -4, left: -4 };
    case "n":
      return { ...base, top: -4, left: "50%", transform: "translateX(-50%)" };
    case "ne":
      return { ...base, top: -4, right: -4 };
    case "e":
      return { ...base, top: "50%", right: -4, transform: "translateY(-50%)" };
    case "se":
      return { ...base, bottom: -4, right: -4 };
    case "s":
      return { ...base, bottom: -4, left: "50%", transform: "translateX(-50%)" };
    case "sw":
      return { ...base, bottom: -4, left: -4 };
    case "w":
      return { ...base, top: "50%", left: -4, transform: "translateY(-50%)" };
  }
}

export function ImageView({
  block,
  editor,
}: { block: BlockView; editor: GoTipeEditor }) {
  const [selected, setSelected] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const startRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    handle: HandlePosition;
    shiftKey: boolean;
  } | null>(null);

  const src = block.attrs.src as string;
  const alt = block.attrs.alt as string;
  const width = block.attrs.width as number | undefined;
  const height = block.attrs.height as number | undefined;
  const caption = block.attrs.caption as string;

  const handleFileUpload = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files).slice(0, MAX_FILES);
      for (const file of fileArray) {
        if (file.size > MAX_FILE_SIZE) continue;
        if (!file.type.startsWith("image/")) continue;

        setUploading(true);
        setUploadProgress(0);

        // Simulate upload progress (real implementation would use editor's upload handler)
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          // Animate progress
          let progress = 0;
          const interval = setInterval(() => {
            progress += 20;
            setUploadProgress(progress);
            if (progress >= 100) {
              clearInterval(interval);
              editor
                .chain()
                .setBlockAttrs(block.id, {
                  src: url,
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                })
                .run();
              setUploading(false);
              setUploadProgress(0);
            }
          }, 50);
        };
        img.src = url;
        break; // Only process first file for this block
      }
    },
    [editor, block.id],
  );

  const handlePlaceholderClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = false;
    input.onchange = () => {
      if (input.files?.length) handleFileUpload(input.files);
    };
    input.click();
  }, [handleFileUpload]);

  const handleDropZone = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files);
      }
    },
    [handleFileUpload],
  );

  // Resize handlers
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, handle: HandlePosition) => {
      e.preventDefault();
      e.stopPropagation();
      if (!imgRef.current) return;

      const rect = imgRef.current.getBoundingClientRect();
      startRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height,
        handle,
        shiftKey: e.shiftKey,
      };
      setResizing(true);
    },
    [],
  );

  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!startRef.current) return;
      const { x, y, width: startW, height: startH, handle } = startRef.current;
      const dx = e.clientX - x;
      const dy = e.clientY - y;
      const aspectRatio = startW / startH;
      const freeResize = e.shiftKey;

      let newW = startW;
      let newH = startH;

      // Calculate new dimensions based on handle position
      if (handle.includes("e")) newW = startW + dx;
      if (handle.includes("w")) newW = startW - dx;
      if (handle.includes("s")) newH = startH + dy;
      if (handle.includes("n")) newH = startH - dy;

      // Aspect ratio lock (unless Shift held)
      if (!freeResize) {
        if (handle === "n" || handle === "s") {
          newW = newH * aspectRatio;
        } else {
          newH = newW / aspectRatio;
        }
      }

      // Enforce minimums
      newW = Math.max(50, newW);
      newH = Math.max(50, newH);

      editor
        .chain()
        .setBlockAttrs(block.id, {
          width: Math.round(newW),
          height: Math.round(newH),
        })
        .run();
    };

    const handleMouseUp = () => {
      setResizing(false);
      startRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizing, editor, block.id]);

  const handleCaptionInput = useCallback(
    (e: React.FormEvent<HTMLElement>) => {
      const text = (e.target as HTMLElement).textContent ?? "";
      editor.chain().setBlockAttrs(block.id, { caption: text }).run();
    },
    [editor, block.id],
  );

  return (
    <figure
      data-block-id={block.id}
      data-block-type="image"
      className={`gotipe-image-block ${selected ? "selected" : ""}`}
      onClick={() => setSelected(true)}
      onBlur={() => !resizing && setSelected(false)}
    >
      {src ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          <img
            ref={imgRef}
            src={src}
            alt={alt || ""}
            style={{
              width: width ? `${width}px` : "100%",
              height: height ? `${height}px` : "auto",
            }}
          />
          {/* 8-point resize handles — shown when selected */}
          {selected &&
            HANDLE_POSITIONS.map((pos) => (
              <div
                key={pos}
                className="gotipe-image-resize-handle"
                style={getHandleStyle(pos)}
                onMouseDown={(e) => handleResizeStart(e, pos)}
                role="separator"
                aria-label={`Resize ${pos}`}
              />
            ))}
        </div>
      ) : (
        <button
          type="button"
          className={`gotipe-image-placeholder ${dragOver ? "drag-over" : ""}`}
          aria-label="Upload image"
          onClick={handlePlaceholderClick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDropZone}
        >
          Click or drag to upload image
        </button>
      )}

      {/* Upload progress bar */}
      {uploading && (
        <div
          className="gotipe-image-progress"
          style={{ width: `${uploadProgress}%` }}
        />
      )}

      {/* Editable caption */}
      <figcaption
        contentEditable
        suppressContentEditableWarning
        data-caption=""
        onInput={handleCaptionInput}
        aria-label="Image caption"
      >
        {caption || ""}
      </figcaption>
    </figure>
  );
}
