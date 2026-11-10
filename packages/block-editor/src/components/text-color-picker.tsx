import { type GoTipeEditor, toSafeColor } from "@gotipe/core";
import { useEditorState } from "@gotipe/react";
import { currentMarks } from "./formatting/selection";
import { useFormattingMenu } from "./formatting/use-formatting-menu";

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

export function TextColorPicker({ editor }: TextColorPickerProps) {
  useEditorState(editor, (value) => value);
  const menu = useFormattingMenu(editor);
  const marks = currentMarks(editor);
  const active =
    marks.find((mark) => mark.type === "textColor") ??
    marks.find((mark) => mark.type === "highlight");
  const currentColor = toSafeColor(active?.attrs.color);
  const handleHighlight = (color: ColorOption) =>
    menu.run((chain) => chain.setMark("highlight", { color: color.bg }));
  const handleTextColor = (color: ColorOption) =>
    menu.run((chain) => chain.setMark("textColor", { color: color.text }));
  const handleReset = () =>
    menu.run((chain) => chain.unsetMark("highlight").unsetMark("textColor"));
  return (
    <div>
      <button
        type="button"
        ref={menu.trigger}
        disabled={!menu.editable}
        onClick={() => (menu.open ? menu.close() : menu.show())}
        aria-haspopup="dialog"
        aria-expanded={menu.open}
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
        <span
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: currentColor ?? "var(--gt-text-secondary)",
            lineHeight: 1,
          }}
        >
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

      {menu.open && (
        <div
          ref={menu.popup}
          className="gotipe-text-color-picker"
          role="dialog"
          aria-label="Text and highlight colors"
          data-gotipe-color-picker=""
          data-gotipe-formatting-popup=""
          style={menu.style}
          onKeyDown={menu.keydown}
        >
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
                aria-pressed={marks.some(
                  (mark) => mark.type === "highlight" && toSafeColor(mark.attrs.color) === color.bg,
                )}
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
                aria-pressed={marks.some(
                  (mark) =>
                    mark.type === "textColor" && toSafeColor(mark.attrs.color) === color.text,
                )}
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

          {menu.error && <p role="alert">{menu.error}</p>}
          {/* Reset */}
          <button type="button" className="gotipe-text-color-reset" onClick={handleReset}>
            Reset color
          </button>
        </div>
      )}
    </div>
  );
}
