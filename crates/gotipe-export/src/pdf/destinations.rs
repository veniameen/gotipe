//! Link actions: external addresses as 7-bit URIs, in-document links as GoTo actions to
//! named destinations placed where the linked block lands after pagination.
use std::collections::HashMap;

use pdf_writer::{types::ActionType, writers::Annotation, Finish, Name, Pdf, Ref, Str};

use super::model::{DrawOp, Page};
use crate::ConvertError;

/// Where each linked block starts: page index, left edge and top in PDF space.
pub(super) struct Destinations {
    positions: HashMap<String, (usize, f32, f32)>,
}

pub(super) fn collect(pages: &[Page]) -> Destinations {
    let mut positions = HashMap::new();
    for (index, page) in pages.iter().enumerate() {
        for op in &page.ops {
            if let DrawOp::Anchor { id, x, y } = op {
                positions
                    .entry(id.clone())
                    .or_insert((index, *x, page.height - *y));
            }
        }
    }
    Destinations { positions }
}

impl Destinations {
    pub fn is_empty(&self) -> bool {
        self.positions.is_empty()
    }

    /// An in-document link works only if its block reached a page.
    pub fn resolves(&self, link: &str) -> bool {
        link.strip_prefix('#')
            .is_none_or(|id| self.positions.contains_key(id))
    }

    /// The catalog's `/Dests` dictionary, keyed by block ID.
    pub fn write(&self, pdf: &mut Pdf, reference: Ref, pages: &[Ref]) -> Result<(), ConvertError> {
        let mut names: Vec<_> = self.positions.iter().collect();
        names.sort_by(|a, b| a.0.cmp(b.0));
        let mut dictionary = pdf.destinations(reference);
        for (id, &(page, x, top)) in names {
            if !x.is_finite() || !top.is_finite() {
                return Err(ConvertError::Encoding(
                    "Invalid PDF link destination".into(),
                ));
            }
            dictionary
                .insert(Name(id.as_bytes()))
                .page(pages[page])
                .xyz(x, top, None);
        }
        dictionary.finish();
        Ok(())
    }
}

/// Sets the annotation's action for a link from [`crate::links::Link::encoded`].
pub(super) fn act(annotation: &mut Annotation, link: &str) -> Result<(), ConvertError> {
    if let Some(id) = link.strip_prefix('#') {
        annotation
            .action()
            .action_type(ActionType::GoTo)
            .destination_named(Name(id.as_bytes()));
        return Ok(());
    }
    let lower = link.to_ascii_lowercase();
    let absolute = lower.starts_with("https://")
        || lower.starts_with("http://")
        || lower.starts_with("mailto:");
    if !absolute || link.chars().any(char::is_control) {
        return Err(ConvertError::Encoding("Unsafe PDF link".into()));
    }
    annotation
        .action()
        .action_type(ActionType::Uri)
        .uri(Str(ascii_uri(link).as_bytes()));
    Ok(())
}

/// A PDF URI is 7-bit ASCII: other bytes of the UTF-8 address are percent-encoded.
fn ascii_uri(link: &str) -> String {
    let mut uri = String::with_capacity(link.len());
    for byte in link.bytes() {
        if (0x21..=0x7e).contains(&byte) {
            uri.push(char::from(byte));
        } else {
            uri.push_str(&format!("%{byte:02X}"));
        }
    }
    uri
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uris_are_seven_bit_ascii_without_double_encoding() {
        assert_eq!(
            ascii_uri("https://пример.test/путь a?q=%41"),
            "https://%D0%BF%D1%80%D0%B8%D0%BC%D0%B5%D1%80.test/%D0%BF%D1%83%D1%82%D1%8C%20a?q=%41"
        );
        assert_eq!(ascii_uri("mailto:a@b.test"), "mailto:a@b.test");
    }
}
