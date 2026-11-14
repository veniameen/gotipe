//! The top-level blocks a file is written from, with the protections of the TS writer that need
//! no snapshot (`serializeMarkdown` and `resolveHazards` of `packages/markdown/src/serialize.ts`):
//! empty paragraphs, headings and raw blocks are left out; a divider that starts the file is
//! `***`, since `---` there opens front matter; and of two neighbouring lists with one marker,
//! which read as one list, the later takes another marker (the earlier one, beside a raw list).
//! The other protections of `serialize.ts` keep the gaps of a snapshot.
use std::borrow::Cow;

use gotipe_core::{AttrValue, Block, BlockContent};

/// A top-level block as the file holds it.
pub(super) enum Top<'a> {
    /// The block, with another list marker where its own would join it to its neighbour.
    Block(Cow<'a, Block>),
    /// A divider that starts the file.
    Stars,
}

/// The kind of a list and its marker: the bullet (`-`, `*`, `+`) or the numbering delimiter
/// (`.`, `)`). Neighbouring lists of one signature read as one list.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Signature {
    Bullet(char),
    Numbered(char),
}

/// The top-level blocks of `blocks` that are written, in order.
pub(super) fn top_blocks(blocks: &[Block]) -> Vec<Top<'_>> {
    let mut written: Vec<(&Block, Option<char>)> = blocks
        .iter()
        .filter(|block| !empty(block))
        .map(|block| (block, None))
        .collect();
    for index in 1..written.len() {
        let Some(before) = signature(written[index - 1]) else {
            continue;
        };
        if signature(written[index]) != Some(before) {
            continue;
        }
        if is_list(written[index].0) {
            let next = written.get(index + 1).and_then(|&next| signature(next));
            written[index].1 = Some(alternate(before, next));
        } else if is_list(written[index - 1].0) {
            let earlier = index.checked_sub(2).and_then(|at| signature(written[at]));
            written[index - 1].1 = Some(alternate(before, earlier));
        }
    }
    written
        .into_iter()
        .enumerate()
        .map(|(index, (block, marker))| match marker {
            _ if index == 0 && block.block_type == "divider" => Top::Stars,
            Some(marker) => Top::Block(Cow::Owned(remarked(block, marker))),
            None => Top::Block(Cow::Borrowed(block)),
        })
        .collect()
}

/// `cannotInterrupt` of the TS writer: a numbered list that does not start at 1, or a list whose
/// first item has no text (a task's `[ ]` is text), cannot interrupt a paragraph, so after the
/// text of a list item it starts after a blank line.
pub(super) fn cannot_interrupt(list: &Block) -> bool {
    match list.block_type.as_str() {
        "orderedList" if super::list_start(list) != 1 => true,
        "bulletList" | "orderedList" => list.children.first().is_none_or(|item| !has_text(item)),
        "todoList" => list.children.is_empty(),
        _ => false,
    }
}

/// `isBlockEmpty` of the TS writer: a block it leaves out at the top level.
fn empty(block: &Block) -> bool {
    match (block.block_type.as_str(), &block.content) {
        ("paragraph" | "heading", _) => !has_text(block),
        ("markdownRaw", BlockContent::Raw(source)) => source.is_empty(),
        ("markdownRaw", _) => true,
        _ => super::omitted(block),
    }
}

/// Whether the rich text of `block` itself has a character.
fn has_text(block: &Block) -> bool {
    match &block.content {
        BlockContent::RichText(spans) => spans.iter().any(|span| !span.text.is_empty()),
        _ => false,
    }
}

pub(super) fn is_list(block: &Block) -> bool {
    matches!(
        block.block_type.as_str(),
        "bulletList" | "orderedList" | "todoList"
    )
}

/// The signature of a list, written with `marker` when it is set; of a raw list, its source's.
fn signature((block, marker): (&Block, Option<char>)) -> Option<Signature> {
    let attr = |name: &str| match block.attrs.get(name) {
        Some(AttrValue::String(value)) => value.as_str(),
        _ => "",
    };
    match block.block_type.as_str() {
        "markdownRaw" if attr("kind") == "list" => match &block.content {
            BlockContent::Raw(source) => source_signature(source),
            _ => None,
        },
        "orderedList" => Some(Signature::Numbered(
            marker.unwrap_or(if attr("delimiter") == ")" { ')' } else { '.' }),
        )),
        "bulletList" | "todoList" => {
            Some(Signature::Bullet(marker.unwrap_or(match attr("marker") {
                "+" => '+',
                "*" => '*',
                _ => '-',
            })))
        }
        _ => None,
    }
}

/// The signature of the list that `source` starts with.
fn source_signature(source: &str) -> Option<Signature> {
    let line = source.trim_start_matches([' ', '\t']);
    let mut chars = line.chars();
    match chars.next()? {
        bullet @ ('-' | '*' | '+') => matches!(chars.next(), None | Some(' ' | '\t' | '\r' | '\n'))
            .then_some(Signature::Bullet(bullet)),
        _ => {
            let digits = line.bytes().take_while(u8::is_ascii_digit).count();
            match line.as_bytes().get(digits) {
                Some(&delimiter @ (b'.' | b')')) if (1..=9).contains(&digits) => {
                    Some(Signature::Numbered(char::from(delimiter)))
                }
                _ => None,
            }
        }
    }
}

/// Another marker than the one of `signature`, and than the one of `avoid`, a list next to it.
fn alternate(signature: Signature, avoid: Option<Signature>) -> char {
    match signature {
        Signature::Numbered('.') => ')',
        Signature::Numbered(_) => '.',
        Signature::Bullet(bullet) => ['-', '*', '+']
            .into_iter()
            .find(|&other| other != bullet && avoid != Some(Signature::Bullet(other)))
            .unwrap_or(if bullet == '-' { '*' } else { '-' }),
    }
}

/// `list` written with `marker` as its bullet or its numbering delimiter.
fn remarked(list: &Block, marker: char) -> Block {
    let mut list = list.clone();
    let name = if list.block_type == "orderedList" {
        "delimiter"
    } else {
        "marker"
    };
    list.attrs
        .insert(name.into(), AttrValue::String(marker.to_string()));
    list
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_raw_list_is_known_by_the_marker_its_source_starts_with() {
        assert_eq!(source_signature("- a"), Some(Signature::Bullet('-')));
        assert_eq!(source_signature("  *\tb"), Some(Signature::Bullet('*')));
        assert_eq!(source_signature("+"), Some(Signature::Bullet('+')));
        assert_eq!(source_signature("+\r\n  c"), Some(Signature::Bullet('+')));
        assert_eq!(source_signature("12) a"), Some(Signature::Numbered(')')));
        assert_eq!(
            source_signature("123456789. a"),
            Some(Signature::Numbered('.'))
        );
        assert_eq!(source_signature("1234567890. a"), None);
        assert_eq!(source_signature("-a"), None);
        assert_eq!(source_signature("a"), None);
    }

    #[test]
    fn the_other_marker_avoids_the_next_list_too() {
        assert_eq!(alternate(Signature::Bullet('-'), None), '*');
        assert_eq!(
            alternate(Signature::Bullet('-'), Some(Signature::Bullet('*'))),
            '+'
        );
        assert_eq!(alternate(Signature::Bullet('*'), None), '-');
        assert_eq!(alternate(Signature::Numbered('.'), None), ')');
        assert_eq!(alternate(Signature::Numbered(')'), None), '.');
    }
}
