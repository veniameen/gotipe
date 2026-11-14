//! The grid of a table as HTML lays it out, as `packages/core/src/table/grid.ts`: a cell takes
//! `colspan` columns and `rowspan` rows from the first free position of its row, and the positions
//! it covers have no cell of their own.

use gotipe_schema::{AttrValue, Block, BlockId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GridCell {
    pub id: BlockId,
    /// The cell's top-left position.
    pub row: usize,
    pub column: usize,
    pub rows: usize,
    pub columns: usize,
}

/// A rectangle of the grid, both corners included.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CellRange {
    pub top: usize,
    pub left: usize,
    pub bottom: usize,
    pub right: usize,
}

#[derive(Debug, Clone)]
pub struct TableGrid {
    pub rows: usize,
    pub columns: usize,
    /// Cells in reading order: by row, then by column.
    pub cells: Vec<GridCell>,
    /// Why the stored table needed repair to be laid out (a span that is not a whole number from
    /// 1 to 1000, past the last row, or over a cell from above). It is laid out repaired anyway,
    /// and the next table edit writes the repaired spans.
    pub problem: Option<&'static str>,
    cover: Vec<Vec<Option<usize>>>,
}

impl TableGrid {
    /// The cell covering a position; none outside the table or in a hole of a short row.
    pub fn at(&self, row: usize, column: usize) -> Option<&GridCell> {
        let index = (*self.cover.get(row)?.get(column)?)?;
        self.cells.get(index)
    }
    pub fn find(&self, id: &BlockId) -> Option<&GridCell> {
        self.cells.iter().find(|cell| &cell.id == id)
    }
}

/// The largest span, HTML's limit for `colspan`. Every writer shares the rule of `cell_span`.
pub const SPAN_LIMIT: usize = 1000;

/// A stored span: an integer from 1 to the limit — a number, or text that reads as one — and
/// anything else (2.7, 0, a negative, beyond the limit) counts as 1, as `cellSpan` in TS.
pub fn cell_span(value: Option<&AttrValue>) -> usize {
    let number = match value {
        Some(AttrValue::Number(number)) => *number,
        Some(AttrValue::String(text)) => text.trim().parse::<f64>().unwrap_or(f64::NAN),
        _ => f64::NAN,
    };
    if number.is_finite() && number.fract() == 0.0 && (1.0..=SPAN_LIMIT as f64).contains(&number) {
        number as usize
    } else {
        1
    }
}

/// A stored span that is not already the number it counts as.
fn canonical(value: Option<&AttrValue>) -> bool {
    match value {
        None => true,
        Some(AttrValue::Number(number)) => *number == cell_span(value) as f64,
        _ => false,
    }
}

/// Lays the table out as HTML does, repaired as browsers draw it: a cell over rows stops at the
/// last row, a cell over columns stops before a position a cell from above already covers.
pub fn table_grid(table: &Block) -> TableGrid {
    let rows = table.children.len();
    let mut cells = Vec::new();
    let mut cover: Vec<Vec<Option<usize>>> = vec![Vec::new(); rows];
    let mut occupied: Vec<usize> = Vec::new();
    let mut columns = 0;
    let mut problem = None;
    for (y, row) in table.children.iter().enumerate() {
        let mut x = 0;
        for node in &row.children {
            while occupied.get(x).copied().unwrap_or(0) > y {
                x += 1;
            }
            if !canonical(node.attrs.get("rowspan")) || !canonical(node.attrs.get("colspan")) {
                problem.get_or_insert(
                    "A table cell has a span that is not a whole number from 1 to 1000",
                );
            }
            let want_rows = cell_span(node.attrs.get("rowspan"));
            let want_columns = cell_span(node.attrs.get("colspan"));
            let mut width = 0;
            while width < want_columns && occupied.get(x + width).copied().unwrap_or(0) <= y {
                width += 1;
            }
            let cell = GridCell {
                id: node.id.clone(),
                row: y,
                column: x,
                rows: want_rows.min(rows - y),
                columns: width,
            };
            if cell.rows < want_rows {
                problem.get_or_insert("A table cell reaches past the last row");
            }
            if cell.columns < want_columns {
                problem.get_or_insert("Table cells overlap");
            }
            let index = cells.len();
            if occupied.len() < x + cell.columns {
                occupied.resize(x + cell.columns, 0);
            }
            for column in x..x + cell.columns {
                occupied[column] = y + cell.rows;
                for line in cover.iter_mut().take(y + cell.rows).skip(y) {
                    if line.len() <= column {
                        line.resize(column + 1, None);
                    }
                    line[column] = Some(index);
                }
            }
            x += cell.columns;
            columns = columns.max(x);
            cells.push(cell);
        }
    }
    TableGrid {
        rows,
        columns,
        cells,
        problem,
        cover,
    }
}

/// The distinct cells that have a position inside the rectangle, in reading order.
pub fn range_cells<'a>(grid: &'a TableGrid, range: &CellRange) -> Vec<&'a GridCell> {
    let mut found: Vec<&GridCell> = Vec::new();
    for row in range.top..=range.bottom {
        for column in range.left..=range.right {
            if let Some(cell) = grid.at(row, column) {
                if !found.iter().any(|seen| seen.id == cell.id) {
                    found.push(cell);
                }
            }
        }
    }
    found.sort_by_key(|cell| (cell.row, cell.column));
    found
}

/// The smallest rectangle that holds both positions and every cell it cuts through.
pub fn cell_range(grid: &TableGrid, a: (usize, usize), b: (usize, usize)) -> CellRange {
    let mut range = CellRange {
        top: a.0.min(b.0),
        left: a.1.min(b.1),
        bottom: a.0.max(b.0).min(grid.rows.saturating_sub(1)),
        right: a.1.max(b.1).min(grid.columns.saturating_sub(1)),
    };
    loop {
        let mut next = range;
        for cell in range_cells(grid, &range) {
            next.top = next.top.min(cell.row);
            next.left = next.left.min(cell.column);
            next.bottom = next.bottom.max(cell.row + cell.rows - 1);
            next.right = next.right.max(cell.column + cell.columns - 1);
        }
        if next == range {
            return range;
        }
        range = next;
    }
}
