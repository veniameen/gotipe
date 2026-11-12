//! Atomic visual rows shared by paragraphs, tables and parallel columns.
//! Layout never cuts through a glyph or image when a page fills up.
use super::model::{DrawOp, Page};
use crate::ConvertError;
use std::collections::VecDeque;

#[derive(Clone, Debug, Default)]
pub(crate) struct Row {
    pub height: f32,
    pub ops: Vec<DrawOp>,
    /// Reserve this much following content when it can fit on one page.
    pub keep: f32,
    pub gap: bool,
}

impl Row {
    pub fn gap(height: f32) -> Self {
        Self {
            height,
            gap: true,
            ..Self::default()
        }
    }
    pub fn shifted(mut self, x: f32, y: f32) -> Self {
        shift(&mut self.ops, x, y);
        self
    }
}

pub(crate) fn shift(ops: &mut [DrawOp], dx: f32, dy: f32) {
    for op in ops {
        match op {
            DrawOp::BeginTag { .. } | DrawOp::EndTag => {}
            DrawOp::Text { x, y, .. }
            | DrawOp::Rect { x, y, .. }
            | DrawOp::Bookmark { x, y, .. }
            | DrawOp::Image { x, y, .. } => {
                *x += dx;
                *y += dy;
            }
            DrawOp::Line { x1, y1, x2, y2, .. } => {
                *x1 += dx;
                *x2 += dx;
                *y1 += dy;
                *y2 += dy;
            }
        }
    }
}

pub(crate) fn height(rows: &[Row]) -> f32 {
    rows.iter().map(|row| row.height).sum()
}

pub(crate) fn trim_gaps(rows: &mut Vec<Row>) {
    while rows.last().is_some_and(|row| row.gap) {
        rows.pop();
    }
    let leading = rows.iter().take_while(|row| row.gap).count();
    rows.drain(..leading);
}

pub(crate) fn take_rows(rows: &mut VecDeque<Row>, budget: f32) -> Row {
    let mut fragment = Row::default();
    while let Some(child) = rows.front() {
        if fragment.height + child.height > budget + 0.01
            || (fragment.height > 0.0
                && child.keep <= budget
                && fragment.height + child.keep > budget + 0.01)
        {
            break;
        }
        let child = rows.pop_front().expect("front was checked");
        let height = child.height;
        fragment.ops.extend(child.shifted(0.0, fragment.height).ops);
        fragment.height += height;
    }
    fragment
}

/// Pack each lane independently. A neighboring image must not increase the
/// leading between text lines. Fragments end only between complete visual rows.
pub(crate) fn parallel(
    lanes: Vec<(f32, Vec<Row>)>,
    max_height: f32,
) -> Result<Vec<Row>, ConvertError> {
    let mut lanes: Vec<_> = lanes
        .into_iter()
        .map(|(x, rows)| (x, VecDeque::from(rows)))
        .collect();
    let mut result = Vec::new();
    while lanes.iter().any(|(_, rows)| !rows.is_empty()) {
        let mut row = Row::default();
        for (x, rows) in &mut lanes {
            let fragment = take_rows(rows, max_height);
            row.height = row.height.max(fragment.height);
            row.ops.extend(fragment.shifted(*x, 0.0).ops);
        }
        if row.height == 0.0 {
            return Err(ConvertError::Encoding(
                "PDF column content is taller than the printable page".into(),
            ));
        }
        result.push(row);
    }
    Ok(result)
}

pub(crate) struct PageGeometry {
    pub width: f32,
    pub height: f32,
    pub left: f32,
    pub top: f32,
    pub bottom: f32,
}

pub(crate) fn paginate(
    rows: Vec<Row>,
    geometry: &PageGeometry,
    decorations: &[DrawOp],
) -> Result<Vec<Page>, ConvertError> {
    let capacity = geometry.bottom - geometry.top;
    let mut pages = Vec::new();
    let mut page = Page {
        width: geometry.width,
        height: geometry.height,
        ops: decorations.to_vec(),
    };
    let mut y = geometry.top;
    let mut pending = VecDeque::from(rows);
    while let Some(mut row) = pending.pop_front() {
        if row.gap && y == geometry.top {
            continue;
        }
        if row.height > capacity + 0.01 || !row.height.is_finite() {
            return Err(ConvertError::Encoding(
                "PDF content is taller than the printable page".into(),
            ));
        }
        let reservation = row.height.max(row.keep).min(capacity);
        if y > geometry.top && y + reservation > geometry.bottom + 0.01 {
            let partial = if row.keep == 0.0 {
                super::pagination::split_row(&row, geometry.bottom - y)
            } else {
                None
            };
            if let Some((first, rest)) = partial {
                row = first;
                if rest.height > 0.0 {
                    pending.push_front(rest);
                }
            } else {
                pages.push(page);
                if pages.len() >= 10_000 {
                    return Err(ConvertError::Encoding("PDF page limit exceeded".into()));
                }
                page = Page {
                    width: geometry.width,
                    height: geometry.height,
                    ops: decorations.to_vec(),
                };
                y = geometry.top;
                if row.gap {
                    continue;
                }
            }
        }
        shift(&mut row.ops, geometry.left, y);
        page.ops.extend(row.ops);
        y += row.height;
    }
    pages.push(page);
    Ok(pages)
}
