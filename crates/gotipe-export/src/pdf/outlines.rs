//! Heading navigation tree. Entries reference the page chosen by pagination.
use pdf_writer::{Pdf, Ref, TextStr};

use super::{
    model::{DrawOp, Page},
    writer::Ids,
};
use crate::ConvertError;

struct Entry<'a> {
    reference: Ref,
    title: &'a str,
    level: u8,
    page: Ref,
    x: f32,
    top: f32,
    parent: Option<usize>,
    children: Vec<usize>,
}

pub(super) fn write(
    pdf: &mut Pdf,
    ids: &mut Ids,
    pages: &[Page],
    references: &[Ref],
) -> Result<Option<Ref>, ConvertError> {
    let mut entries: Vec<Entry<'_>> = Vec::new();
    let mut roots = Vec::new();
    let mut ancestors: Vec<usize> = Vec::new();
    for (page, &reference) in pages.iter().zip(references) {
        for operation in &page.ops {
            let DrawOp::Bookmark { title, level, x, y } = operation else {
                continue;
            };
            if !x.is_finite() || !y.is_finite() || !(1..=6).contains(level) {
                return Err(ConvertError::Encoding(
                    "Invalid PDF heading destination".into(),
                ));
            }
            while ancestors
                .last()
                .is_some_and(|&index| entries[index].level >= *level)
            {
                ancestors.pop();
            }
            let index = entries.len();
            let parent = ancestors.last().copied();
            if let Some(parent) = parent {
                entries[parent].children.push(index);
            } else {
                roots.push(index);
            }
            entries.push(Entry {
                reference: ids.next(),
                title,
                level: *level,
                page: reference,
                x: *x,
                top: page.height - *y,
                parent,
                children: Vec::new(),
            });
            ancestors.push(index);
        }
    }
    let Some(&first) = roots.first() else {
        return Ok(None);
    };
    let tree = ids.next();
    pdf.outline(tree)
        .first(entries[first].reference)
        .last(entries[*roots.last().unwrap()].reference)
        .count(
            i32::try_from(roots.len())
                .map_err(|_| ConvertError::Encoding("Too many PDF headings".into()))?,
        );
    for (index, entry) in entries.iter().enumerate() {
        let siblings = entry
            .parent
            .map_or(roots.as_slice(), |parent| &entries[parent].children);
        let position = siblings.iter().position(|&item| item == index).unwrap();
        let mut item = pdf.outline_item(entry.reference);
        item.title(TextStr(entry.title)).parent(
            entry
                .parent
                .map_or(tree, |parent| entries[parent].reference),
        );
        item.dest().page(entry.page).xyz(entry.x, entry.top, None);
        if position > 0 {
            item.prev(entries[siblings[position - 1]].reference);
        }
        if let Some(&next) = siblings.get(position + 1) {
            item.next(entries[next].reference);
        }
        if let (Some(&first), Some(&last)) = (entry.children.first(), entry.children.last()) {
            item.first(entries[first].reference)
                .last(entries[last].reference)
                .count(
                    -i32::try_from(entry.children.len())
                        .map_err(|_| ConvertError::Encoding("Too many PDF headings".into()))?,
                );
        }
    }
    Ok(Some(tree))
}
