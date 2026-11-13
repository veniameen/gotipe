//! How a mark joins the marks of a text span. `packages/core/src/engine/mark-rules.ts`
//! is the JavaScript engine's copy; both engines must produce the same spans.
use gotipe_schema::{Mark, Schema};

/// Apply `mark` to the marks of one span. A mark of the same type is replaced in
/// place, so the new attributes win; other marks of its exclusive group are removed;
/// otherwise the mark is appended. Without a schema there are no exclusive groups.
pub(super) fn apply_mark(marks: &mut Vec<Mark>, mark: &Mark, schema: Option<&Schema>) {
    let group = schema.and_then(|schema| schema.exclusive_group(&mark.mark_type));
    let excluded = |existing: &Mark| {
        group.is_some()
            && schema.and_then(|schema| schema.exclusive_group(&existing.mark_type)) == group
    };
    let mut placed = false;
    let mut result = Vec::with_capacity(marks.len() + 1);
    for existing in marks.drain(..) {
        if existing.mark_type == mark.mark_type {
            if !placed {
                result.push(mark.clone());
                placed = true;
            }
        } else if !excluded(&existing) {
            result.push(existing);
        }
    }
    if !placed {
        result.push(mark.clone());
    }
    *marks = result;
}

/// Marks of inserted text, applied in order: the last of a type or of an
/// exclusive group wins.
pub(super) fn normalize_marks(marks: &[Mark], schema: Option<&Schema>) -> Vec<Mark> {
    let mut result = Vec::with_capacity(marks.len());
    for mark in marks {
        apply_mark(&mut result, mark, schema);
    }
    result
}
