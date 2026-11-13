//! Fragment a measured container at safe glyph/image boundaries to use the
//! current page's remaining space. Semantic scopes remain balanced on both pages.
use super::{
    flow::{self, Row},
    model::DrawOp,
};

fn protected(op: &DrawOp) -> Option<(f32, f32)> {
    match op {
        DrawOp::Text { y, run, style, .. } => Some((
            y - style.rise - run.ascent(),
            y - style.rise + run.descent(),
        )),
        DrawOp::Image { y, height, .. } => Some((*y, y + height)),
        _ => None,
    }
}

fn visible(ops: &[DrawOp]) -> bool {
    ops.iter().any(|op| match op {
        DrawOp::Text { run, .. } => !run.text.is_empty(),
        DrawOp::Image { .. } => true,
        _ => false,
    })
}

pub(crate) fn split_row(row: &Row, available: f32) -> Option<(Row, Row)> {
    if available <= 0.0 || row.height <= available {
        return None;
    }
    let mut intervals: Vec<_> = row.ops.iter().filter_map(protected).collect();
    for (index, op) in row.ops.iter().enumerate() {
        if let DrawOp::Bookmark { y, .. } = op {
            if let Some((_, bottom)) = row.ops[index + 1..].iter().find_map(protected) {
                intervals.push((*y, bottom));
            }
        }
    }
    let mut cut = available;
    loop {
        let next = intervals
            .iter()
            .copied()
            .filter(|(top, bottom)| *top < cut && *bottom > cut)
            .map(|(top, _)| top)
            .fold(cut, f32::min);
        if next == cut {
            break;
        }
        cut = next;
        if cut <= 0.01 {
            return None;
        }
    }
    let mut before = Row {
        height: cut,
        ..Row::default()
    };
    let mut after = Row {
        height: row.height - cut,
        ..Row::default()
    };
    for op in &row.ops {
        match op {
            DrawOp::BeginTag { .. } | DrawOp::EndTag => {
                before.ops.push(op.clone());
                after.ops.push(op.clone());
            }
            DrawOp::Text { y, run, style, .. } => {
                if y - style.rise + run.descent() <= cut + 0.001 {
                    before.ops.push(op.clone());
                } else {
                    after.ops.push(op.clone());
                }
            }
            DrawOp::Image { y, height, .. } => {
                if y + height <= cut + 0.001 {
                    before.ops.push(op.clone());
                } else {
                    after.ops.push(op.clone());
                }
            }
            DrawOp::Bookmark { y, .. } | DrawOp::Anchor { y, .. } => {
                if *y < cut {
                    before.ops.push(op.clone());
                } else {
                    after.ops.push(op.clone());
                }
            }
            DrawOp::Rect {
                x,
                y,
                width,
                height,
                fill,
                stroke,
                line_width,
            } => {
                let top = (*y).max(0.0);
                let bottom = y + height;
                if top < cut {
                    before.ops.push(DrawOp::Rect {
                        x: *x,
                        y: top,
                        width: *width,
                        height: (bottom.min(cut) - top).max(0.0),
                        fill: *fill,
                        stroke: *stroke,
                        line_width: *line_width,
                    });
                }
                if bottom > cut {
                    after.ops.push(DrawOp::Rect {
                        x: *x,
                        y: top.max(cut),
                        width: *width,
                        height: bottom - top.max(cut),
                        fill: *fill,
                        stroke: *stroke,
                        line_width: *line_width,
                    });
                }
            }
            DrawOp::Line {
                x1,
                y1,
                x2,
                y2,
                color,
                width,
            } => {
                if *y1 <= cut && *y2 <= cut {
                    before.ops.push(op.clone());
                } else if *y1 >= cut && *y2 >= cut {
                    after.ops.push(op.clone());
                } else {
                    let x = x1 + (x2 - x1) * (cut - y1) / (y2 - y1);
                    let first = DrawOp::Line {
                        x1: *x1,
                        y1: *y1,
                        x2: x,
                        y2: cut,
                        color: *color,
                        width: *width,
                    };
                    let second = DrawOp::Line {
                        x1: x,
                        y1: cut,
                        x2: *x2,
                        y2: *y2,
                        color: *color,
                        width: *width,
                    };
                    if *y1 < cut {
                        before.ops.push(first);
                        after.ops.push(second);
                    } else {
                        after.ops.push(first);
                        before.ops.push(second);
                    }
                }
            }
        }
    }
    if !visible(&before.ops) {
        return None;
    }
    if !visible(&after.ops) {
        // Trailing padding does not create an otherwise empty page. Retain a
        // container's closing horizontal borders at the cut boundary.
        for op in &after.ops {
            if let DrawOp::Line {
                x1,
                y1,
                x2,
                y2,
                color,
                width,
            } = op
            {
                if y1 == y2 {
                    before.ops.push(DrawOp::Line {
                        x1: *x1,
                        y1: cut,
                        x2: *x2,
                        y2: cut,
                        color: *color,
                        width: *width,
                    });
                }
            }
        }
        after.ops.clear();
        after.height = 0.0;
        after.gap = true;
    } else {
        flow::shift(&mut after.ops, 0.0, -cut);
    }
    Some((before, after))
}

#[cfg(test)]
mod tests {
    use super::super::{
        fonts::Fonts,
        model::{Tag, TextStyle},
    };
    use super::*;

    #[test]
    fn splitting_preserves_whole_lines_balanced_tags_and_remaining_content() {
        let fonts = Fonts::new().unwrap();
        let style = TextStyle::default();
        let mut ops = vec![DrawOp::BeginTag {
            tag: Tag {
                id: 1,
                role: "P".into(),
                alt: None,
                colspan: 1,
                rowspan: 1,
                list_numbering: None,
            },
        }];
        for (text, y) in [("first", 16.0), ("second", 36.0), ("third", 56.0)] {
            ops.push(DrawOp::Text {
                x: 0.0,
                y,
                run: fonts.shape(text, &style).unwrap(),
                style: style.clone(),
            });
        }
        ops.push(DrawOp::EndTag);
        let row = Row {
            height: 64.0,
            ops,
            ..Row::default()
        };
        let (before, after) = split_row(&row, 40.0).unwrap();
        for part in [&before, &after] {
            assert!(matches!(part.ops.first(), Some(DrawOp::BeginTag { .. })));
            assert!(matches!(part.ops.last(), Some(DrawOp::EndTag)));
        }
        let content = |part: &Row| {
            part.ops
                .iter()
                .filter_map(|op| match op {
                    DrawOp::Text { run, .. } => Some(run.text.as_str()),
                    _ => None,
                })
                .collect::<String>()
        };
        assert_eq!(content(&before), "firstsecond");
        assert_eq!(content(&after), "third");
        assert!((before.height + after.height - row.height).abs() < 0.01);
    }
}
