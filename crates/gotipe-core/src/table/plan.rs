//! A table edit planned on a copy of the grid, as `packages/core/src/table/layout.ts`: rows,
//! cells by grid position and the per-column attributes, checked before any step is written.

use std::collections::HashMap;

use gotipe_schema::{AttrValue, Block, BlockContent, BlockId, TextSpan};

use super::grid::{cell_range, range_cells, table_grid, CellRange};
use crate::GoTipeError;

pub const DEFAULT_WIDTH: f64 = 160.0;

#[derive(Debug, Clone)]
pub struct PlannedCell {
    pub block: Block,
    pub fresh: bool,
    pub row: usize,
    pub column: usize,
    pub rows: usize,
    pub columns: usize,
    /// Text appended to the cell, line by line: what merged cells held.
    pub appended: Vec<Vec<TextSpan>>,
}

#[derive(Debug, Clone)]
pub struct PlannedRow {
    pub block: Block,
}

#[derive(Debug, Clone)]
pub struct PlannedTable {
    pub rows: Vec<PlannedRow>,
    pub cells: Vec<PlannedCell>,
    pub columns: usize,
    pub widths: Vec<f64>,
    pub align: Vec<AttrValue>,
    pub removed: bool,
}

pub(crate) fn fail<T>(message: &str) -> Result<T, GoTipeError> {
    Err(GoTipeError::Validation(message.into()))
}

fn empty_cell(header: bool) -> Block {
    Block::new_with_type(
        if header { "tableHeader" } else { "tableCell" },
        BlockContent::RichText(Vec::new()),
    )
}

/// Reads a table as its repaired grid: spans cut to the table and to the cells above. A
/// structural edit fills the holes of short rows so every position has a cell.
pub fn plan_table(table: &Block, fill: bool) -> Result<PlannedTable, GoTipeError> {
    let grid = table_grid(table);
    let blocks: HashMap<&BlockId, &Block> = table
        .children
        .iter()
        .flat_map(|row| row.children.iter().map(|cell| (&cell.id, cell)))
        .collect();
    let list = |name: &str| match table.attrs.get(name) {
        Some(AttrValue::Array(values)) => Some(values.clone()),
        _ => None,
    };
    let widths = list("colWidths");
    let align = list("align");
    let mut plan = PlannedTable {
        rows: table
            .children
            .iter()
            .map(|block| PlannedRow {
                block: block.clone(),
            })
            .collect(),
        cells: grid
            .cells
            .iter()
            .map(|cell| PlannedCell {
                block: (*blocks[&cell.id]).clone(),
                fresh: false,
                row: cell.row,
                column: cell.column,
                rows: cell.rows,
                columns: cell.columns,
                appended: Vec::new(),
            })
            .collect(),
        columns: grid.columns,
        widths: (0..grid.columns)
            .map(
                |index| match widths.as_ref().and_then(|values| values.get(index)) {
                    Some(AttrValue::Number(width)) if width.is_finite() => *width,
                    _ => DEFAULT_WIDTH,
                },
            )
            .collect(),
        align: (0..grid.columns)
            .map(|index| {
                align
                    .as_ref()
                    .and_then(|values| values.get(index).cloned())
                    .unwrap_or(AttrValue::Null)
            })
            .collect(),
        removed: false,
    };
    if fill {
        for row in 0..plan.rows.len() {
            for column in 0..plan.columns {
                if covering(&plan, row, column).is_none() {
                    let header = header_row(&plan, row);
                    add(&mut plan, row, column, header);
                }
            }
        }
    }
    Ok(plan)
}

fn covering(plan: &PlannedTable, row: usize, column: usize) -> Option<usize> {
    plan.cells.iter().position(|cell| {
        cell.row <= row
            && row < cell.row + cell.rows
            && cell.column <= column
            && column < cell.column + cell.columns
    })
}

fn add(plan: &mut PlannedTable, row: usize, column: usize, header: bool) {
    plan.cells.push(PlannedCell {
        block: empty_cell(header),
        fresh: true,
        row,
        column,
        rows: 1,
        columns: 1,
        appended: Vec::new(),
    });
}

/// Every cell over the row is a header, and there is one.
fn header_row(plan: &PlannedTable, row: usize) -> bool {
    let mut over = plan
        .cells
        .iter()
        .filter(|cell| cell.row <= row && row < cell.row + cell.rows)
        .peekable();
    over.peek().is_some() && over.all(|cell| cell.block.block_type == "tableHeader")
}

/// Header rows at the top: rows whose own cells are all headers.
fn leading_header_rows(plan: &PlannedTable) -> usize {
    let mut count = 0;
    while count < plan.rows.len() {
        let mut own = plan
            .cells
            .iter()
            .filter(|cell| cell.row == count)
            .peekable();
        if own.peek().is_none() || own.any(|cell| cell.block.block_type != "tableHeader") {
            break;
        }
        count += 1;
    }
    let mut result = count;
    for cell in &plan.cells {
        if cell.row < count {
            result = result.max(cell.row + cell.rows);
        }
    }
    result
}

pub fn insert_row(plan: &mut PlannedTable, at: usize) {
    // a new row never goes above the header: “Add row above” on the first row keeps it on top
    let index = at.max(leading_header_rows(plan));
    for cell in &mut plan.cells {
        if cell.row >= index {
            cell.row += 1;
        } else if cell.row + cell.rows > index {
            cell.rows += 1;
        }
    }
    let row = Block::new_with_type("tableRow", BlockContent::Empty);
    plan.rows.insert(index, PlannedRow { block: row });
    plan.columns = plan.columns.max(1);
    for column in 0..plan.columns {
        if covering(plan, index, column).is_none() {
            add(plan, index, column, false);
        }
    }
}

pub fn delete_row(plan: &mut PlannedTable, index: usize) {
    plan.cells.retain_mut(|cell| {
        if cell.row == index {
            if cell.rows == 1 {
                return false;
            }
            cell.rows -= 1;
        } else if cell.row < index && cell.row + cell.rows > index {
            cell.rows -= 1;
        } else if cell.row > index {
            cell.row -= 1;
        }
        true
    });
    plan.rows.remove(index);
    plan.removed = plan.rows.is_empty();
}

pub fn insert_column(plan: &mut PlannedTable, index: usize) {
    let headers: Vec<bool> = (0..plan.rows.len())
        .map(|row| header_row(plan, row))
        .collect();
    for cell in &mut plan.cells {
        if cell.column >= index {
            cell.column += 1;
        } else if cell.column + cell.columns > index {
            cell.columns += 1;
        }
    }
    plan.columns += 1;
    for (row, header) in headers.into_iter().enumerate() {
        if covering(plan, row, index).is_none() {
            add(plan, row, index, header);
        }
    }
    plan.widths.insert(index, DEFAULT_WIDTH);
    plan.align.insert(index, AttrValue::Null);
}

pub fn delete_column(plan: &mut PlannedTable, index: usize) {
    plan.cells.retain_mut(|cell| {
        if cell.column == index {
            if cell.columns == 1 {
                return false;
            }
            cell.columns -= 1;
        } else if cell.column < index && cell.column + cell.columns > index {
            cell.columns -= 1;
        } else if cell.column > index {
            cell.column -= 1;
        }
        true
    });
    plan.columns -= 1;
    plan.widths.remove(index);
    plan.align.remove(index);
    plan.removed = plan.columns == 0;
}

fn spans_of(block: &Block) -> Vec<TextSpan> {
    match &block.content {
        BlockContent::RichText(spans) => spans.clone(),
        _ => Vec::new(),
    }
}

/// One cell over the rectangle; the others' text follows the top-left cell's, line by line.
/// Returns the ID of the merged cell.
pub fn merge_cells(
    plan: &mut PlannedTable,
    from: (usize, usize),
    to: (usize, usize),
) -> Result<BlockId, GoTipeError> {
    let grid = table_grid(&planned(plan));
    let range = CellRange {
        top: from.0.min(to.0),
        left: from.1.min(to.1),
        bottom: from.0.max(to.0),
        right: from.1.max(to.1),
    };
    if range.bottom >= plan.rows.len() || range.right >= plan.columns {
        return fail("Table position is out of range");
    }
    if cell_range(&grid, from, to) != range {
        return fail("The range cuts through a merged cell; select the whole merged cell");
    }
    let inside: Vec<BlockId> = range_cells(&grid, &range)
        .into_iter()
        .map(|cell| cell.id.clone())
        .collect();
    if inside.len() < 2 {
        return fail("Select at least two cells to merge");
    }
    let mut lines = Vec::new();
    for id in &inside[1..] {
        let cell = plan.cells.iter().find(|cell| &cell.block.id == id).unwrap();
        let mut spans = spans_of(&cell.block);
        spans.extend(cell.appended.iter().flatten().cloned());
        if spans.iter().any(|span| !span.text.is_empty()) {
            lines.push(spans);
        }
    }
    plan.cells
        .retain(|cell| cell.block.id == inside[0] || !inside.contains(&cell.block.id));
    let target = plan
        .cells
        .iter_mut()
        .find(|cell| cell.block.id == inside[0])
        .unwrap();
    target.rows = range.bottom - range.top + 1;
    target.columns = range.right - range.left + 1;
    target.appended.extend(lines);
    Ok(inside[0].clone())
}

/// The merged cell back to one cell per position; its text stays in the top-left one.
pub fn split_cell(plan: &mut PlannedTable, row: usize, column: usize) -> Result<(), GoTipeError> {
    let Some(index) = covering(plan, row, column) else {
        return fail("Table position is out of range");
    };
    let cell = &mut plan.cells[index];
    // a cell whose stored span the grid had to cut is repaired: its span is written as drawn
    let stored = ["rowspan", "colspan"]
        .iter()
        .any(|name| matches!(cell.block.attrs.get(*name), Some(value) if value != &AttrValue::Number(1.0)));
    if cell.rows == 1 && cell.columns == 1 && !stored {
        return fail("The cell is not merged");
    }
    let (top, left, rows, columns) = (cell.row, cell.column, cell.rows, cell.columns);
    let header = cell.block.block_type == "tableHeader";
    cell.rows = 1;
    cell.columns = 1;
    for y in top..top + rows {
        for x in left..left + columns {
            if y != top || x != left {
                add(plan, y, x, header);
            }
        }
    }
    Ok(())
}

/// The table the plan describes, cells in reading order with their spans.
pub fn planned(plan: &PlannedTable) -> Block {
    let mut table = Block::new_with_type("table", BlockContent::Empty);
    table.children = plan
        .rows
        .iter()
        .enumerate()
        .map(|(y, row)| {
            let mut own: Vec<&PlannedCell> =
                plan.cells.iter().filter(|cell| cell.row == y).collect();
            own.sort_by_key(|cell| cell.column);
            let mut block = row.block.clone();
            block.children = own
                .into_iter()
                .map(|cell| {
                    let mut block = cell.block.clone();
                    for (name, value) in [("colspan", cell.columns), ("rowspan", cell.rows)] {
                        if value > 1 || block.attrs.contains_key(name) {
                            block
                                .attrs
                                .insert(name.into(), AttrValue::Number(value as f64));
                        }
                    }
                    block
                })
                .collect();
            block
        })
        .collect();
    table
}

/// The plan is a table HTML lays out at the same positions, with no overlap and, after a
/// structural edit, no gap.
pub fn check_plan(plan: &PlannedTable, complete: bool) -> Result<(), GoTipeError> {
    if plan.removed {
        return Ok(());
    }
    let grid = table_grid(&planned(plan));
    if let Some(problem) = grid.problem {
        return fail(problem);
    }
    for cell in &plan.cells {
        match grid.find(&cell.block.id) {
            Some(placed) if placed.row == cell.row && placed.column == cell.column => {}
            _ => return fail("The table edit would move cells out of their columns"),
        }
    }
    if complete {
        for row in 0..grid.rows {
            for column in 0..grid.columns {
                if grid.at(row, column).is_none() {
                    return fail("The table edit would leave a position without a cell");
                }
            }
        }
    }
    if grid.columns != plan.columns {
        return fail("The table edit would change the column count");
    }
    Ok(())
}
