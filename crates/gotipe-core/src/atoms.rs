//! Inline atoms (docs/development/inline-atoms.md): text whose mark is declared `atomic`
//! is one indivisible element. An atom is the maximal run of spans that carry the same
//! atomic marks with equal attributes. `packages/core/src/engine/atoms.ts` is the
//! JavaScript engine's copy; both engines must find the same atoms and move the same
//! offsets. Offsets are UTF-16 code units, as everywhere in the editor contract.
use std::ops::Range;

use gotipe_schema::{BlockContent, BlockId, Document, Mark, Schema, TextSpan};

use crate::selection::{Selection, TextPosition};
use crate::transaction::Step;

fn atom_key<'a>(span: &'a TextSpan, schema: &Schema) -> Vec<&'a Mark> {
    span.marks
        .iter()
        .filter(|mark| schema.is_atomic(&mark.mark_type))
        .collect()
}

/// The atoms of a block's spans, in order, as `[from, to)` UTF-16 ranges.
pub fn atom_ranges(spans: &[TextSpan], schema: &Schema) -> Vec<Range<usize>> {
    let mut atoms: Vec<Range<usize>> = Vec::new();
    let mut previous: Vec<&Mark> = Vec::new();
    let mut offset = 0;
    for span in spans {
        let key = atom_key(span, schema);
        let length = span.text.encode_utf16().count();
        let end = offset + length;
        match atoms.last_mut() {
            Some(last) if !key.is_empty() && last.end == offset && previous == key => {
                last.end = end;
            }
            _ if !key.is_empty() && length > 0 => atoms.push(offset..end),
            _ => {}
        }
        if length > 0 {
            previous = key;
        }
        offset = end;
    }
    atoms
}

/// The atom that strictly contains `offset` (not at one of its edges).
pub fn atom_at(atoms: &[Range<usize>], offset: usize) -> Option<&Range<usize>> {
    atoms
        .iter()
        .find(|atom| atom.start < offset && offset < atom.end)
}

/// `offset`, or the nearer edge of the atom around it; a tie goes to the end.
pub fn nearest_edge(atoms: &[Range<usize>], offset: usize) -> usize {
    match atom_at(atoms, offset) {
        Some(atom) if offset - atom.start < atom.end - offset => atom.start,
        Some(atom) => atom.end,
        None => offset,
    }
}

/// A caret moved to `offset` from `previous` (in the same block): inside an atom it
/// goes on to the edge in the direction of movement, else to the nearer edge.
pub fn snap_offset(atoms: &[Range<usize>], offset: usize, previous: Option<usize>) -> usize {
    match (atom_at(atoms, offset), previous) {
        (Some(atom), Some(previous)) if previous <= atom.start => atom.end,
        (Some(atom), Some(previous)) if previous >= atom.end => atom.start,
        _ => nearest_edge(atoms, offset),
    }
}

/// A non-empty range that touches part of an atom grows to cover the whole atom.
pub fn expand_range(atoms: &[Range<usize>], from: usize, to: usize) -> (usize, usize) {
    if from >= to {
        return (from, to);
    }
    (
        atom_at(atoms, from).map_or(from, |atom| atom.start),
        atom_at(atoms, to).map_or(to, |atom| atom.end),
    )
}

/// Whether the schema declares any atomic mark; without one nothing here does work.
fn has_atoms(schema: &Schema) -> bool {
    schema.marks.values().any(|mark| mark.atomic)
}

/// The atoms of a block with rich text, or none.
fn block_atoms(doc: &Document, block_id: &BlockId, schema: &Schema) -> Vec<Range<usize>> {
    match doc.find_block(block_id).map(|block| &block.content) {
        Some(BlockContent::RichText(spans)) => atom_ranges(spans, schema),
        _ => Vec::new(),
    }
}

/// `step` with its offsets moved off atoms: text and splits go to the nearer edge,
/// deletions and marks cover whole atoms. Other steps, blocks without rich text and
/// offsets outside the text are returned unchanged, so the step reports its own error.
pub fn normalize_step(step: &Step, doc: &Document, schema: &Schema) -> Step {
    if !has_atoms(schema) {
        return step.clone();
    }
    let block_id = match step {
        Step::InsertText { block_id, .. }
        | Step::SplitBlock { block_id, .. }
        | Step::DeleteText { block_id, .. }
        | Step::AddMark { block_id, .. }
        | Step::RemoveMark { block_id, .. } => block_id,
        _ => return step.clone(),
    };
    let atoms = block_atoms(doc, block_id, schema);
    let mut step = step.clone();
    if atoms.is_empty() {
        return step;
    }
    match &mut step {
        Step::InsertText { offset, .. } | Step::SplitBlock { offset, .. } => {
            *offset = nearest_edge(&atoms, *offset);
        }
        Step::DeleteText { from, to, .. }
        | Step::AddMark { from, to, .. }
        | Step::RemoveMark { from, to, .. } => {
            (*from, *to) = expand_range(&atoms, *from, *to);
        }
        _ => {}
    }
    step
}

/// A text point: its block and UTF-16 offset.
type Point<'a> = (&'a BlockId, usize);

/// The anchor and head of a text selection; a cursor is both.
fn anchor_head(selection: &Selection) -> Option<(Point<'_>, Point<'_>)> {
    match selection {
        Selection::Cursor { block_id, offset } => Some(((block_id, *offset), (block_id, *offset))),
        Selection::Text { block_id, from, to } => Some(((block_id, *from), (block_id, *to))),
        Selection::Range { anchor, head } => Some((
            (&anchor.block_id, anchor.offset),
            (&head.block_id, head.offset),
        )),
        Selection::Block { .. } | Selection::Multi { .. } => None,
    }
}

/// `selection` with every text point outside atoms, as `editor/atom-selection.ts` does.
/// A caret moves as one point from the previous head; a range's anchor and head move from
/// the previous anchor and head. A point inside an atom goes on to the edge in its
/// direction of movement from that point in the same block, otherwise to the nearer edge.
/// A range that lies within one atom selects the whole atom, keeping its direction.
pub fn snap_selection(
    selection: Selection,
    previous: Option<&Selection>,
    doc: &Document,
    schema: &Schema,
) -> Selection {
    if !has_atoms(schema) {
        return selection;
    }
    let before = previous.and_then(anchor_head);
    let snap = |head: bool, block_id: &BlockId, offset: usize| {
        let atoms = block_atoms(doc, block_id, schema);
        let previous = before
            .map(|(anchor, last)| if head { last } else { anchor })
            .filter(|(id, _)| *id == block_id)
            .map(|(_, offset)| offset);
        snap_offset(&atoms, offset, previous)
    };
    // The whole atom when both ends lie within one atom and one is inside it.
    let whole = |block_id: &BlockId, anchor: usize, head: usize| {
        if anchor == head {
            return None;
        }
        let atoms = block_atoms(doc, block_id, schema);
        let atom = atom_at(&atoms, head).or(atom_at(&atoms, anchor))?;
        let covers = |offset: usize| atom.start <= offset && offset <= atom.end;
        (covers(anchor) && covers(head)).then_some(if anchor < head {
            (atom.start, atom.end)
        } else {
            (atom.end, atom.start)
        })
    };
    match selection {
        Selection::Cursor { block_id, offset } => {
            let offset = snap(true, &block_id, offset);
            Selection::Cursor { block_id, offset }
        }
        Selection::Text { block_id, from, to } => {
            let (from, to) = whole(&block_id, from, to)
                .unwrap_or_else(|| (snap(false, &block_id, from), snap(true, &block_id, to)));
            Selection::Text { block_id, from, to }
        }
        Selection::Range { anchor, head } => {
            let same = (anchor.block_id == head.block_id)
                .then(|| whole(&head.block_id, anchor.offset, head.offset))
                .flatten();
            let (anchor_offset, head_offset) = same.unwrap_or_else(|| {
                (
                    snap(false, &anchor.block_id, anchor.offset),
                    snap(true, &head.block_id, head.offset),
                )
            });
            Selection::Range {
                anchor: TextPosition {
                    block_id: anchor.block_id,
                    offset: anchor_offset,
                },
                head: TextPosition {
                    block_id: head.block_id,
                    offset: head_offset,
                },
            }
        }
        other => other,
    }
}

#[cfg(test)]
mod tests;
