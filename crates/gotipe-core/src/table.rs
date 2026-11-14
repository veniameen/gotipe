//! Table edits, as `editTable` in `packages/core/src/tables.ts`: one validated transaction and one
//! undo step for a structural edit, a merge or a split, including every cell a span covers.

mod grid;
mod plan;
mod steps;

pub use grid::{cell_range, cell_span, range_cells, table_grid, CellRange, GridCell, TableGrid};

use gotipe_schema::{Block, BlockId};
use serde::{Deserialize, Serialize};

use crate::selection::Selection;
use crate::state::EditorState;
use crate::transaction::Transaction;
use crate::GoTipeError;
use plan::fail;

/// A position in the grid, counted from zero.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CellPosition {
    pub row: usize,
    pub column: usize,
}

/// The JSON form is the same as the TypeScript `TableEdit`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum TableEdit {
    InsertRow {
        index: usize,
    },
    InsertColumn {
        index: usize,
    },
    /// `count` rows from `index`, as one step; all of them take the table away.
    DeleteRow {
        index: usize,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        count: Option<usize>,
    },
    DeleteColumn {
        index: usize,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        count: Option<usize>,
    },
    ResizeColumn {
        index: usize,
        width: f64,
    },
    /// One cell over the rectangle between two grid positions; it must not cut a merged cell.
    MergeCells {
        from: CellPosition,
        to: CellPosition,
    },
    /// The merged cell over this grid position back to one cell per position.
    SplitCell {
        row: usize,
        column: usize,
    },
}

fn check_index(index: usize, count: usize, limit: usize) -> Result<(), GoTipeError> {
    if count < 1 || index > limit || count > limit - index {
        return fail("Table position is out of range");
    }
    Ok(())
}

fn ids(table: &Block) -> Vec<Vec<BlockId>> {
    table
        .children
        .iter()
        .map(|row| row.children.iter().map(|cell| cell.id.clone()).collect())
        .collect()
}

/// The transaction of a table edit; none when nothing changes. The planned table is checked
/// before any step is written, and the staged result is compared with the plan.
pub fn edit_table(
    state: &EditorState,
    table_id: &BlockId,
    edit: &TableEdit,
) -> Result<Option<Transaction>, GoTipeError> {
    let Some(table) = state.doc().find_block(table_id) else {
        return fail("Table no longer exists");
    };
    if table.block_type != "table" {
        return fail("Table no longer exists");
    }
    // a stored table that needs repair (a span past the last row, overlapping cells) is read as
    // drawn; the edit writes the repaired spans
    let grid = table_grid(table);
    let structural = !matches!(edit, TableEdit::ResizeColumn { .. });
    let mut result = plan::plan_table(table, structural)?;
    let mut focus = None;
    match *edit {
        TableEdit::InsertRow { index } => {
            check_index(index, 1, grid.rows + 1)?;
            plan::insert_row(&mut result, index);
        }
        TableEdit::InsertColumn { index } => {
            check_index(index, 1, grid.columns + 1)?;
            plan::insert_column(&mut result, index);
        }
        TableEdit::DeleteRow { index, count } => {
            let count = count.unwrap_or(1);
            check_index(index, count, grid.rows)?;
            for _ in 0..count {
                if !result.removed {
                    plan::delete_row(&mut result, index);
                }
            }
        }
        TableEdit::DeleteColumn { index, count } => {
            let count = count.unwrap_or(1);
            check_index(index, count, grid.columns)?;
            for _ in 0..count {
                if !result.removed {
                    plan::delete_column(&mut result, index);
                }
            }
        }
        TableEdit::ResizeColumn { index, width } => {
            check_index(index, 1, grid.columns)?;
            if !width.is_finite() {
                return fail("Column width must be finite");
            }
            result.widths[index] = width.round().clamp(64.0, 1600.0);
        }
        TableEdit::MergeCells { from, to } => {
            focus = Some(plan::merge_cells(
                &mut result,
                (from.row, from.column),
                (to.row, to.column),
            )?);
        }
        TableEdit::SplitCell { row, column } => plan::split_cell(&mut result, row, column)?,
    }
    plan::check_plan(&result, structural)?;
    let steps = steps::table_steps(table, &result);
    if steps.is_empty() {
        return Ok(None);
    }
    let mut transaction = Transaction::new();
    transaction.steps = steps;
    if result.removed {
        return Ok(Some(transaction));
    }
    let staged = state.apply(transaction.clone())?;
    let written = staged.doc().find_block(table_id);
    let expected = ids(&plan::planned(&result));
    if written.is_none_or(|table| table_grid(table).problem.is_some() || ids(table) != expected) {
        return Err(GoTipeError::Validation(
            "The table edit did not produce the planned table".into(),
        ));
    }
    // the caret goes to the end of a merged cell
    if let Some(id) = focus {
        if let Some(cell) = staged.doc().find_block(&id) {
            transaction = transaction.with_selection(Selection::Cursor {
                offset: cell.text_length(),
                block_id: id,
            });
        }
    }
    Ok(Some(transaction))
}
