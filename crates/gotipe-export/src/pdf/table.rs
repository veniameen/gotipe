//! Logical cell occupancy and paginatable table rows, including row/column spans.
use super::{
    flow::{self, Row},
    layout::{number, Layout},
    model::{DrawOp, Tag},
};
use crate::ConvertError;
use gotipe_core::Block;
use std::collections::VecDeque;

struct Cell<'a> {
    node: &'a Block,
    x: usize,
    y: usize,
    columns: usize,
    rows: usize,
}
struct Active {
    x: f32,
    width: f32,
    end: usize,
    header: bool,
    rows: VecDeque<Row>,
    started: bool,
    row_tag: Tag,
}

pub(crate) fn layout(
    context: &Layout<'_>,
    table: &Block,
    width: f32,
    depth: usize,
) -> Result<Vec<Row>, ConvertError> {
    let mut occupied = Vec::<usize>::new();
    let mut cells = Vec::new();
    let mut columns = 0;
    let mut row_count = table.children.len();
    for (y, row) in table.children.iter().enumerate() {
        if row.block_type != "tableRow" {
            return Err(ConvertError::Encoding(
                "PDF table requires tableRow children".into(),
            ));
        }
        let mut x = 0;
        for cell in &row.children {
            if !["tableCell", "tableHeader"].contains(&cell.block_type.as_str()) {
                return Err(ConvertError::Encoding(
                    "PDF table row requires cells".into(),
                ));
            }
            while occupied.get(x).is_some_and(|end| *end > y) {
                x += 1;
            }
            let colspan = number(cell, "colspan", 1).clamp(1, 100);
            let rowspan = number(cell, "rowspan", 1).clamp(1, 100);
            if occupied.iter().skip(x).take(colspan).any(|end| *end > y) {
                return Err(ConvertError::Encoding("Overlapping PDF table spans".into()));
            }
            let end = x + colspan;
            if end > 1024 {
                return Err(ConvertError::Encoding(
                    "PDF table column limit exceeded".into(),
                ));
            }
            occupied.resize(occupied.len().max(end), 0);
            occupied[x..end].fill(y + rowspan);
            cells.push(Cell {
                node: cell,
                x,
                y,
                columns: colspan,
                rows: rowspan,
            });
            columns = columns.max(end);
            row_count = row_count.max(y + rowspan);
            x = end;
        }
    }
    if columns == 0 {
        return Ok(Vec::new());
    }
    let unit = width / columns as f32;
    let padding = 4.0_f32.min(unit * 0.15);
    let nested = Layout {
        max_height: context.max_height - padding * 2.0,
        ..*context
    };
    let mut active = Vec::<Active>::new();
    let mut output = Vec::new();
    for y in 0..row_count {
        let row_tag = context.tag("TR");
        for cell in cells.iter().filter(|cell| cell.y == y) {
            let cell_width = unit * cell.columns as f32;
            let mut rows = nested.block(cell.node, cell_width - padding * 2.0, depth + 1)?;
            flow::trim_gaps(&mut rows);
            if let Some(first) = rows.first_mut() {
                flow::shift(&mut first.ops, 0.0, padding);
                first.height += padding;
            }
            if let Some(last) = rows.last_mut() {
                last.height += padding;
            }
            active.push(Active {
                x: unit * cell.x as f32,
                width: cell_width,
                end: y + cell.rows,
                header: cell.node.block_type == "tableHeader",
                rows: rows.into(),
                started: false,
                row_tag: row_tag.clone(),
            });
        }
        let row_start = output.len();
        loop {
            let mut row = Row::default();
            let mut consumed = Vec::new();
            let needed = active
                .iter()
                .filter(|cell| cell.end == y + 1)
                .map(|cell| cell.rows.iter().map(|row| row.height).sum::<f32>())
                .fold(context.size * 1.35, f32::max);
            let budget = needed.min(context.max_height);
            for cell in &mut active {
                let fragment = flow::take_rows(&mut cell.rows, budget);
                row.height = row.height.max(fragment.height);
                consumed.push(fragment);
            }
            let finished = active
                .iter()
                .filter(|cell| cell.end == y + 1)
                .all(|cell| cell.rows.is_empty());
            if row.height == 0.0 && !finished {
                return Err(ConvertError::Encoding(
                    "PDF table content is taller than the printable page".into(),
                ));
            }
            row.height = row.height.max(context.size * 0.4);
            for (cell, mut item) in active.iter_mut().zip(consumed) {
                let end = cell.x + cell.width;
                if cell.header {
                    row.ops.push(DrawOp::Rect {
                        x: cell.x,
                        y: 0.0,
                        width: cell.width,
                        height: row.height,
                        fill: Some([0.94; 3]),
                        stroke: None,
                        line_width: 0.0,
                    });
                }
                super::semantics::wrap_ops(&mut item.ops, &cell.row_tag);
                row.ops.extend(item.shifted(cell.x + padding, 0.0).ops);
                let stroke = |x1, y1, x2, y2| DrawOp::Line {
                    x1,
                    y1,
                    x2,
                    y2,
                    color: [0.35; 3],
                    width: 0.5,
                };
                row.ops.push(stroke(cell.x, 0.0, cell.x, row.height));
                row.ops.push(stroke(end, 0.0, end, row.height));
                if !cell.started {
                    row.ops.push(stroke(cell.x, 0.0, end, 0.0));
                    cell.started = true;
                }
                if cell.end == y + 1 && finished {
                    row.ops.push(stroke(cell.x, row.height, end, row.height));
                }
            }
            output.push(row);
            if finished {
                break;
            }
        }
        let total = flow::height(&output[row_start..]);
        // Normal rows move together; exceptionally tall rows split at visual lines.
        if total <= context.max_height {
            output[row_start].keep = total;
        }
        active.retain(|cell| cell.end > y + 1);
    }
    output.push(Row::gap(context.size * 0.5));
    Ok(output)
}
