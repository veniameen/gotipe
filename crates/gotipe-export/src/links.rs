//! Links in standalone PDF and DOCX files.
//!
//! A downloaded file has no page to resolve a relative reference against, and a
//! viewer resolves one against the file's own location. Only absolute web and mail
//! addresses become external links, and `#<blockId>` an internal link when that block
//! is shown in the same file. Every other reference (a relative path, an unknown
//! fragment, an inline `data:` upload, another scheme) keeps its visible text without a
//! link. A URL never makes an export fail.
use gotipe_core::{AttrValue, Block, BlockContent};
use std::collections::HashSet;

/// Where a clickable reference leads.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Link<'a> {
    /// An absolute `http(s)` or `mailto:` address.
    External(&'a str),
    /// The ID of a block shown in the same file.
    Internal(&'a str),
}

impl Link<'_> {
    /// The form PDF text styles carry: the address, or `#` and the block ID.
    pub fn encoded(&self) -> String {
        match self {
            Link::External(address) => (*address).to_owned(),
            Link::Internal(id) => format!("#{id}"),
        }
    }
}

/// The blocks of one document that in-document links may lead to.
pub(crate) struct Targets {
    shown: HashSet<String>,
    linked: HashSet<String>,
}

impl Targets {
    pub fn new(blocks: &[Block]) -> Self {
        let mut targets = Targets {
            shown: HashSet::new(),
            linked: HashSet::new(),
        };
        targets.collect_shown(blocks);
        let mut linked = HashSet::new();
        targets.collect_linked(blocks, &mut linked);
        targets.linked = linked;
        targets
    }

    fn collect_shown(&mut self, blocks: &[Block]) {
        for block in blocks {
            if !placeholder(block) {
                self.shown.insert(block.id.0.clone());
            }
            self.collect_shown(&block.children);
        }
    }

    fn collect_linked(&self, blocks: &[Block], linked: &mut HashSet<String>) {
        for block in blocks {
            let mut note = |url: &str| {
                if let Some(Link::Internal(id)) = self.link(url) {
                    linked.insert(id.to_owned());
                }
            };
            if matches!(block.block_type.as_str(), "file" | "embed") {
                note(attr(block, "url"));
            }
            if let BlockContent::RichText(spans) = &block.content {
                for mark in spans.iter().flat_map(|span| &span.marks) {
                    if let (true, Some(AttrValue::String(href))) =
                        (mark.mark_type == "link", mark.attrs.get("href"))
                    {
                        note(href);
                    }
                }
            }
            self.collect_linked(&block.children, linked);
        }
    }

    /// What a document URL becomes: a link, or `None` when it stays plain text.
    pub fn link<'a>(&self, url: &'a str) -> Option<Link<'a>> {
        let value = url.trim();
        if value.is_empty() || value.chars().any(char::is_control) {
            return None;
        }
        if let Some(id) = value.strip_prefix('#') {
            return self.shown.contains(id).then_some(Link::Internal(id));
        }
        let lower = value.to_ascii_lowercase();
        let absolute = lower.starts_with("https://")
            || lower.starts_with("http://")
            || lower.starts_with("mailto:");
        absolute.then_some(Link::External(value))
    }

    /// Whether a link leads to this block, which then needs a destination.
    pub fn is_linked(&self, id: &str) -> bool {
        self.linked.contains(id)
    }
}

fn attr<'a>(block: &'a Block, key: &str) -> &'a str {
    match block.attrs.get(key) {
        Some(AttrValue::String(value)) => value,
        _ => "",
    }
}

/// The image, file and embed placeholders the editor inserts before an upload show nothing.
fn placeholder(block: &Block) -> bool {
    match block.block_type.as_str() {
        "image" => crate::assets::source(block).is_none() && attr(block, "caption").is_empty(),
        "file" | "embed" => attachment_label(block).is_empty(),
        _ => false,
    }
}

/// Visible text of a file or embed block: its name, otherwise a readable address.
/// An inline upload without a name shows its media type instead of the encoded bytes.
pub(crate) fn attachment_label(block: &Block) -> String {
    let name = attr(block, "name");
    let label = if name.trim().is_empty() {
        let url = attr(block, "url").trim();
        data_media_type(url).unwrap_or(url)
    } else {
        name
    };
    label.chars().filter(|c| !c.is_control()).collect()
}

fn data_media_type(url: &str) -> Option<&str> {
    let rest = url
        .get(..5)
        .filter(|scheme| scheme.eq_ignore_ascii_case("data:"))
        .map(|_| &url[5..])?;
    let media = rest.split([',', ';']).next().unwrap_or("").trim();
    let token = |b: u8| b.is_ascii_alphanumeric() || b"!#$&^_.+-/".contains(&b);
    Some(
        if (1..=127).contains(&media.len()) && media.bytes().all(token) {
            media
        } else {
            "text/plain"
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::input::document_from_json;

    fn label(attrs: serde_json::Value) -> String {
        let json = serde_json::json!({ "blocks": [{ "id": "f", "type": "file", "attrs": attrs }] });
        attachment_label(&document_from_json(&json.to_string()).unwrap().blocks[0])
    }

    #[test]
    fn only_absolute_addresses_and_shown_blocks_are_link_targets() {
        let document = document_from_json(
            &serde_json::json!({ "blocks": [
                {"id": "intro", "type": "heading", "content": [{"text": "Intro"}]},
                {"id": "empty", "type": "image", "attrs": {"src": "", "caption": ""}},
                {"id": "p", "type": "paragraph", "content": [
                    {"text": "to intro", "marks": [{"type": "link", "attrs": {"href": " #intro "}}]},
                    {"text": "to nothing", "marks": [{"type": "link", "attrs": {"href": "#empty"}}]}
                ], "children": [
                    {"id": "f", "type": "file", "attrs": {"url": "#p", "name": "Up"}}
                ]}
            ]})
            .to_string(),
        )
        .unwrap();
        let targets = Targets::new(&document.blocks);
        for url in [
            "https://example.test/a?b=1&c",
            " HTTP://example.test ",
            "mailto:team@example.test",
        ] {
            assert_eq!(targets.link(url), Some(Link::External(url.trim())), "{url}");
        }
        assert_eq!(targets.link("#intro"), Some(Link::Internal("intro")));
        assert_eq!(targets.link("#intro").unwrap().encoded(), "#intro");
        for url in [
            "",
            "   ",
            "#",
            "#missing",
            "#empty",
            "guide.md",
            "./guide.md",
            "/docs/guide",
            "//cdn.example.test/x",
            "?q=1",
            "data:application/pdf;base64,AAAA",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "tel:+123",
            "https://example.test/\u{7}",
        ] {
            assert_eq!(targets.link(url), None, "{url:?}");
        }
        assert!(targets.is_linked("intro") && targets.is_linked("p"));
        assert!(!targets.is_linked("empty") && !targets.is_linked("f"));
    }

    #[test]
    fn attachments_show_their_name_or_a_readable_address() {
        assert_eq!(
            label(
                serde_json::json!({"name": "Отчёт.pdf", "url": "data:application/pdf;base64,AAAA"})
            ),
            "Отчёт.pdf"
        );
        assert_eq!(
            label(serde_json::json!({"name": "", "url": "data:application/pdf;base64,AAAA"})),
            "application/pdf"
        );
        assert_eq!(
            label(serde_json::json!({"url": "DATA:;base64,AAAA"})),
            "text/plain"
        );
        assert_eq!(
            label(serde_json::json!({"url": "data:\u{4e2d}/x,AAAA"})),
            "text/plain"
        );
        assert_eq!(
            label(serde_json::json!({"url": "docs/guide.md"})),
            "docs/guide.md"
        );
        assert_eq!(
            label(serde_json::json!({"url": "https://a.test/\nb"})),
            "https://a.test/b"
        );
        assert_eq!(label(serde_json::json!({"name": "", "url": ""})), "");
        assert_eq!(label(serde_json::json!({})), "");
    }
}
