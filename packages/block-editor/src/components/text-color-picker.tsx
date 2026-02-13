import type { GoTipeEditor } from "@gotipe/core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface TextColorPickerProps {
  editor: GoTipeEditor;
}

interface ColorOption {
  name: string;
  bg: string;
  text: string;
}

const HIGHLIGHT_COLORS: ColorOption[] = [
  { name: "Blue", bg: "#dbeafe", text: "#1e40af" },
  { name: "Green", bg: "#dcfce7", text: "#166534" },
  { name: "Yellow", bg: "#fef9c3", text: "#854d0e" },
  { name: "Red", bg: "#fecaca", text: "#991b1b" },
  { name: "Purple", bg: "#f3e8ff", text: "#6b21a8" },
];

const TEXT_COLORS: ColorOption[] = [
  { name: "Gray", bg: "transparent", text: "#6b7280" },
  { name: "Brown", bg: "transparent", text: "#92400e" },
  { name: "Orange", bg: "transparent", text: "#c2410c" },
  { name: "Blue", bg: "transparent", text: "#1d4ed8" },
  { name: "Red", bg: "transparent", text: "#dc2626" },
];

function getCurrentColor(editor: GoTipeEditor): string | null {
  const state = editor.getViewState();
  const { anchor } = state.selection;
  const block = state.blocks.find((b) => b.id === anchor.blockId);
  if (!block || !Array.isArray(block.content)) return null;
  let pos = 0;
  for (const span of block.content) {
    const end = pos + span.text.length;
    if (anchor.offset >= pos && anchor.offset < end) {
      const highlight = span.marks.find((m) => m.type === "highlight");
      if (highlight) return (highlight.attrs as Record<string, string>)?.color ?? null;
      const textColor = span.marks.find((m) => m.type === "textColor");
      if (textColor) return (textColor.attrs as Record<string, string>)?.color ?? null;
      return null;
    }
    pos = end;
  }
  return null;
}

export function TextColorPicker({ editor }: TextColorPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentColor = getCurrentColor(editor);

  const handleHighlight = useCallback(
    (color: ColorOption) => {
      editor.chain().setMark("highlight", { color: color.bg, textColor: color.text }).run();
      setOpen(false);
    },
    [editor],
  );

  const handleTextColor = useCallback(
    (color: ColorOption) => {
      editor.chain().setMark("textColor", { color: color.text }).run();
      setOpen(false);
    },
    [editor],
  );

  const handleReset = useCallback(() => {
    editor.chain().unsetMark("highlight").unsetMark("textColor").run();
    setOpen(false);
  }, [editor]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Text color"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "32px",
          height: "32px",
          border: "none",
          borderRadius: "var(--gt-radius-lg, 12px)",
          background: "transparent",
          cursor: "pointer",
          flexDirection: "column",
          gap: "1px",
        }}
      >
        <span style={{ fontSize: "14px", fontWeight: 600, color: currentColor ?? "var(--gt-text-secondary)", lineHeight: 1 }}>
          A
        </span>
        <span
          style={{
            width: "14px",
            height: "3px",
            borderRadius: "1px",
            background: currentColor ?? "var(--gt-text-secondary)",
          }}
        />
      </button>

      {open && (
        <div className="gotipe-text-color-picker" data-gotipe-color-picker="">
          {/* Highlight section */}
          <div
            style={{
              fontSize: "11px",
              color: "var(--gt-text-tertiary)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "4px 0",
            }}
          >
            Highlight
          </div>
          <div className="gotipe-text-color-picker-grid">
            {HIGHLIGHT_COLORS.map((color) => (
              <button
                key={`hl-${color.name}`}
                type="button"
                className="gotipe-text-color-swatch"
                title={color.name}
                aria-label={`Highlight ${color.name}`}
                style={{ background: color.bg }}
                onClick={() => handleHighlight(color)}
              />
            ))}
          </div>

          {/* Text color section */}
          <div
            style={{
              fontSize: "11px",
              color: "var(--gt-text-tertiary)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "8px 0 4px",
            }}
          >
            Text
          </div>
          <div className="gotipe-text-color-picker-grid">
            {TEXT_COLORS.map((color) => (
              <button
                key={`tc-${color.name}`}
                type="button"
                className="gotipe-text-color-swatch"
                title={color.name}
                aria-label={`Text color ${color.name}`}
                style={{
                  background: "transparent",
                  border: "1px solid var(--gt-border-light, rgba(0,0,0,0.05))",
                  color: color.text,
                  fontWeight: 700,
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() => handleTextColor(color)}
              >
                A
              </button>
            ))}
          </div>

          {/* Reset */}
          <button
            type="button"
            className="gotipe-text-color-reset"
            onClick={handleReset}
          >
            Reset color
          </button>
        </div>
      )}
    </div>
  );
}
