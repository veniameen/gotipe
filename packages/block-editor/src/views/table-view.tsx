import type { BlockView, GoTipeEditor } from "@gotipe/core";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface CellCoord {
  row: number;
  col: number;
}

export function TableView({
  block,
  editor,
  children,
}: { block: BlockView; editor: GoTipeEditor; children?: React.ReactNode }) {
  const [selectedCell, setSelectedCell] = useState<CellCoord | null>(null);
  const [resizingCol, setResizingCol] = useState<number | null>(null);
  const [colWidths, setColWidths] = useState<number[]>([]);
  const tableRef = useRef<HTMLTableElement>(null);
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null);

  const rows = block.children ?? [];
  const numCols = rows[0]?.children?.length ?? 0;

  // Initialize column widths
  useEffect(() => {
    if (colWidths.length === 0 && numCols > 0) {
      setColWidths(Array(numCols).fill(150));
    }
  }, [numCols, colWidths.length]);

  // Tab/Shift+Tab cell navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Tab") return;
      e.preventDefault();

      if (!selectedCell) {
        setSelectedCell({ row: 0, col: 0 });
        return;
      }

      const { row, col } = selectedCell;
      const numRows = rows.length;

      if (e.shiftKey) {
        // Previous cell
        if (col > 0) {
          setSelectedCell({ row, col: col - 1 });
        } else if (row > 0) {
          setSelectedCell({ row: row - 1, col: numCols - 1 });
        }
      } else {
        // Next cell
        if (col < numCols - 1) {
          setSelectedCell({ row, col: col + 1 });
        } else if (row < numRows - 1) {
          setSelectedCell({ row: row + 1, col: 0 });
        } else {
          // Tab in last cell → add new row
          editor
            .chain()
            .setBlockAttrs(block.id, { _addRow: Date.now() })
            .run();
          setSelectedCell({ row: numRows, col: 0 });
        }
      }
    },
    [selectedCell, rows.length, numCols, editor, block.id],
  );

  const handleCellClick = useCallback((row: number, col: number) => {
    setSelectedCell({ row, col });
  }, []);

  // Add row
  const handleAddRow = useCallback(() => {
    editor
      .chain()
      .setBlockAttrs(block.id, { _addRow: Date.now() })
      .run();
  }, [editor, block.id]);

  // Add column
  const handleAddCol = useCallback(() => {
    editor
      .chain()
      .setBlockAttrs(block.id, { _addCol: Date.now() })
      .run();
    setColWidths((prev) => [...prev, 150]);
  }, [editor, block.id]);

  // Column resize
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, colIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      resizeStartRef.current = {
        x: e.clientX,
        width: colWidths[colIndex] ?? 150,
      };
      setResizingCol(colIndex);
    },
    [colWidths],
  );

  useEffect(() => {
    if (resizingCol === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current || resizingCol === null) return;
      const dx = e.clientX - resizeStartRef.current.x;
      const newWidth = Math.max(100, resizeStartRef.current.width + dx);
      setColWidths((prev) => {
        const next = [...prev];
        next[resizingCol] = newWidth;
        return next;
      });
    };

    const handleMouseUp = () => {
      setResizingCol(null);
      resizeStartRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingCol]);

  // Focus selected cell
  useEffect(() => {
    if (!selectedCell || !tableRef.current) return;
    const { row, col } = selectedCell;
    const cell = tableRef.current.querySelector<HTMLElement>(
      `tr:nth-child(${row + 1}) > :nth-child(${col + 1})`,
    );
    if (cell) {
      cell.focus();
    }
  }, [selectedCell]);

  return (
    <div
      data-block-id={block.id}
      data-block-type="table"
      className="gotipe-table-wrapper"
      style={{ position: "relative" }}
      onKeyDown={handleKeyDown}
    >
      <table ref={tableRef}>
        {/* Column groups for widths */}
        <colgroup>
          {colWidths.map((w, i) => (
            <col key={i} style={{ width: `${w}px` }} />
          ))}
        </colgroup>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={row.id}>
              {(row.children ?? []).map((cell, colIdx) => {
                const isHeader = cell.type === "tableHeader" || rowIdx === 0;
                const isSelected =
                  selectedCell?.row === rowIdx && selectedCell?.col === colIdx;
                const CellTag = isHeader ? "th" : "td";
                const cellContent = Array.isArray(cell.content)
                  ? cell.content.map((s) => s.text).join("")
                  : (cell.content ?? "");

                return (
                  <CellTag
                    key={cell.id}
                    className={isSelected ? "gotipe-table-cell-selected" : ""}
                    style={{
                      fontWeight: isHeader ? 600 : undefined,
                      background: isHeader && !isSelected
                        ? "var(--gt-bg-hover)"
                        : undefined,
                      position: "relative",
                    }}
                    onClick={() => handleCellClick(rowIdx, colIdx)}
                    tabIndex={-1}
                    contentEditable
                    suppressContentEditableWarning
                  >
                    {cellContent}
                    {/* Column resize handle on right edge */}
                    {colIdx < numCols - 1 && (
                      <div
                        className={`gotipe-table-col-resize ${resizingCol === colIdx ? "active" : ""}`}
                        onMouseDown={(e) => handleResizeStart(e, colIdx)}
                        role="separator"
                        aria-label="Resize column"
                      />
                    )}
                  </CellTag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add row button — right edge */}
      <button
        type="button"
        className="gotipe-table-add-row"
        onClick={handleAddRow}
        aria-label="Add row"
        style={{ right: -28, top: "50%", transform: "translateY(-50%)" }}
      >
        +
      </button>

      {/* Add column button — top edge */}
      <button
        type="button"
        className="gotipe-table-add-col"
        onClick={handleAddCol}
        aria-label="Add column"
        style={{ top: -28, left: "50%", transform: "translateX(-50%)" }}
      >
        +
      </button>
    </div>
  );
}
