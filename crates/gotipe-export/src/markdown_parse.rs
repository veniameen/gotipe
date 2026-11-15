//! Own bounded Markdown reader, sharing the public document semantics of @gotipe/markdown.
pub(crate) mod atoms;
pub(crate) mod autolinks;
mod blocks;
mod convert;
mod decode;
mod definitions;
mod inline;
mod links;
mod lists;
mod nodes;
mod rich;
mod source;
pub(crate) mod structure;
mod syntax;
mod table_html;
pub use atoms::MarkdownAtoms;
use gotipe_core::{AttrValue, Document};
use nodes::Node;
use source::{Line, Source};
use std::collections::HashSet;

pub(crate) fn parse(md: &str, atoms: &MarkdownAtoms) -> Document {
    let base = front_matter(md);
    let mut reader = blocks::Reader::default();
    let mut nodes = reader.blocks(&source::lines(&md[base..], base), 0, 0);
    fn fill(nodes: &mut [Node], references: &HashSet<String>, atoms: &MarkdownAtoms) {
        for node in nodes {
            if let Some(source) = node.source.take() {
                let budget =
                    std::cell::Cell::new(source.text.len().saturating_mul(24).saturating_add(1000));
                node.children = inline::read(
                    &source,
                    &links::Context {
                        in_cell: node.in_cell,
                        ..links::Context::new(references, &budget, atoms)
                    },
                    0,
                );
            } else {
                fill(&mut node.children, references, atoms)
            }
        }
    }
    fill(&mut nodes, &reader.references, atoms);
    let mut doc = Document {
        blocks: nodes
            .iter()
            .map(|n| convert::block(n, rich::Read { source: md, atoms }))
            .collect(),
        version: 0,
    };
    atoms::number_atoms(&mut doc.blocks, &mut 0);
    let original =
        serde_json::to_string(&serde_json::to_value(&doc).expect("serializable document"))
            .expect("serializable model");
    if let Some(first) = doc.blocks.first_mut() {
        first.attrs.insert(
            "markdownDocumentSource".into(),
            AttrValue::String(md.into()),
        );
        first
            .attrs
            .insert("markdownDocumentModel".into(), AttrValue::String(original));
    }
    doc
}
fn front_matter(text: &str) -> usize {
    let bom = if text.starts_with('\u{feff}') { 3 } else { 0 };
    let body = &text[bom..];
    let Some(open) = re!(r"^---[ \t]*(?:\r\n|\r|\n)").find(body) else {
        return bom;
    };
    let closing_marker = re!(r"^(?:---|\.\.\.)[ \t]*$");
    let start = bom + open.end();
    for line in source::lines(&text[start..], start) {
        if closing_marker.is_match(&line.text) {
            return line.end + line.eol.len();
        }
    }
    bom
}
