//! The span rule every writer shares with the editor's grid (`tableGrid` in @gotipe/core,
//! `table_grid` in gotipe-core) and the HTML serializers: `colspan`/`rowspan` is an integer from
//! 1 to 1000 — a number, or text that reads as one — and anything else counts as 1.
use gotipe_core::{AttrValue, Block};

/// The largest span: HTML's limit for `colspan`.
pub(crate) const SPAN_LIMIT: usize = 1000;

pub(crate) fn cell_span(cell: &Block, name: &str) -> usize {
    let value = match cell.attrs.get(name) {
        Some(AttrValue::Number(value)) => *value,
        Some(AttrValue::String(text)) => text.trim().parse::<f64>().unwrap_or(f64::NAN),
        _ => f64::NAN,
    };
    if value.is_finite() && value.fract() == 0.0 && (1.0..=SPAN_LIMIT as f64).contains(&value) {
        value as usize
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn spans_are_integers_from_one_to_the_limit() {
        let cell = |value: AttrValue| Block {
            attrs: HashMap::from([("colspan".into(), value)]),
            ..Block::new_with_type("tableCell", gotipe_core::BlockContent::Empty)
        };
        for (value, span) in [
            (AttrValue::Number(2.0), 2),
            (AttrValue::Number(2.7), 1),
            (AttrValue::Number(0.0), 1),
            (AttrValue::Number(-3.0), 1),
            (AttrValue::Number(1000.0), 1000),
            (AttrValue::Number(1001.0), 1),
            (AttrValue::Number(f64::INFINITY), 1),
            (AttrValue::String(" 3 ".into()), 3),
            (AttrValue::String("".into()), 1),
            (AttrValue::Null, 1),
        ] {
            assert_eq!(
                cell_span(&cell(value.clone()), "colspan"),
                span,
                "{value:?}"
            );
        }
    }
}
