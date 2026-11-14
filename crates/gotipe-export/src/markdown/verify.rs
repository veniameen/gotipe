//! The rendering of a block that reads back as the block, as `renderVerified` of
//! `packages/markdown/src/serialize.ts` chooses it: delimiters and bare addresses (tier 0),
//! `<url>` autolinks (1), then tags for emphasis and `[t](u)` links (2). With no rendering that
//! reads back, the first one.
use gotipe_core::{AttrValue, Block, BlockContent, Mark, TextSpan};

use super::{
    spans::{carried, normalize},
    Emoji,
};
use crate::markdown_parse::{self, MarkdownAtoms};

const RICH_TYPES: [&str; 8] = [
    "paragraph",
    "heading",
    "listItem",
    "todoItem",
    "blockquote",
    "callout",
    "tableCell",
    "tableHeader",
];

fn walk<'a>(block: &'a Block, visit: &mut impl FnMut(&'a Block)) {
    visit(block);
    for child in &block.children {
        walk(child, visit);
    }
}

fn spans(block: &Block) -> &[TextSpan] {
    match &block.content {
        BlockContent::RichText(spans) => spans,
        _ => &[],
    }
}

/// The tiers to try for `block`, `verificationTiers` of the TypeScript writer.
fn tiers(block: &Block) -> &'static [u8] {
    let mut rich = matches!(block.block_type.as_str(), "image" | "file");
    let (mut links, mut marks) = (false, false);
    walk(block, &mut |block| {
        rich |= RICH_TYPES.contains(&block.block_type.as_str())
            || matches!(block.content, BlockContent::RichText(_));
        for mark in spans(block).iter().flat_map(|span| &span.marks) {
            marks = true;
            links |= mark.mark_type == "link";
        }
    });
    match (rich, links, marks) {
        (false, ..) => &[1],
        (true, true, _) => &[0, 1, 2],
        (true, false, true) => &[1, 2],
        (true, false, false) => &[1],
    }
}

/// Rich text as text and marks, which can be compared.
type Text = Vec<(String, Vec<Mark>)>;

/// `spans` as their Markdown reads back, by what the writer writes on purpose: a line ending
/// of the text is "\n" (D-94), a line break inside inline code has no code mark (D-89), and a
/// line break of a link destination is `%0A` (`asWritten` of the TypeScript writer).
fn as_written(spans: &[TextSpan]) -> Vec<TextSpan> {
    let mut out = vec![];
    for span in spans {
        let text = span.text.replace("\r\n", "\n").replace('\r', "\n");
        let marks: Vec<Mark> = span
            .marks
            .iter()
            .map(|mark| match mark.attrs.get("href") {
                Some(AttrValue::String(href)) if mark.mark_type == "link" => {
                    let mut mark = mark.clone();
                    let href = href.replace("\r\n", "%0A").replace(['\r', '\n'], "%0A");
                    mark.attrs.insert("href".into(), AttrValue::String(href));
                    mark
                }
                _ => mark.clone(),
            })
            .collect();
        if !marks.iter().any(|mark| mark.mark_type == "code") || !text.contains('\n') {
            out.push(TextSpan { text, marks });
            continue;
        }
        let plain: Vec<Mark> = marks
            .iter()
            .filter(|mark| mark.mark_type != "code")
            .cloned()
            .collect();
        for (number, part) in text.split('\n').enumerate() {
            if number > 0 {
                out.push(TextSpan {
                    text: "\n".into(),
                    marks: plain.clone(),
                });
            }
            if !part.is_empty() {
                out.push(TextSpan {
                    text: part.into(),
                    marks: marks.clone(),
                });
            }
        }
    }
    out
}

/// The blocks of `block` in order with their rich text as Markdown carries it.
fn shape(block: &Block) -> Vec<(&str, Text)> {
    let mut out = vec![];
    walk(block, &mut |block| {
        let text = normalize(&carried(&as_written(spans(block))))
            .into_iter()
            .map(|span| (span.text, span.marks))
            .collect();
        out.push((block.block_type.as_str(), text))
    });
    out
}

/// Whether `markdown`, the rendering of `block`, reads back as `block`, with the atoms it holds
/// and the custom emoji the document registers.
fn reads_back(block: &Block, markdown: &str, emoji: &Emoji) -> bool {
    let mut atoms = MarkdownAtoms {
        custom_emoji: emoji.clone(),
        ..MarkdownAtoms::default()
    };
    walk(block, &mut |block| {
        for mark in spans(block).iter().flat_map(|span| &span.marks) {
            match mark.mark_type.as_str() {
                "mention" => atoms.mention = true,
                "inlineMath" => atoms.inline_math = true,
                "inlineImage" => atoms.inline_image = true,
                _ => {}
            }
        }
    });
    let read = markdown_parse::parse(markdown, &atoms);
    read.blocks.len() == 1 && shape(&read.blocks[0]) == shape(block)
}

/// The first rendering of `block` (`render` at a tier) that reads back as the block.
pub(super) fn first_reading_back(
    block: &Block,
    emoji: &Emoji,
    render: impl Fn(u8) -> String,
) -> String {
    let tiers = tiers(block);
    let mut first = None;
    for &tier in tiers {
        let markdown = render(tier);
        if tiers.len() == 1 || reads_back(block, &markdown, emoji) {
            return markdown;
        }
        first.get_or_insert(markdown);
    }
    first.unwrap_or_default()
}
