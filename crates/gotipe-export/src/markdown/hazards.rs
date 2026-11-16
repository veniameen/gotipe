//! The top-level blocks a file is written from, with the protections of the TS writer that need
//! no snapshot (`serializeMarkdown` of `packages/markdown/src/serialize.ts` and `resolveHazards`
//! of `serialization/hazards.ts`): empty paragraphs, headings and raw blocks are left out; a
//! divider that starts the file is `***`, since `---` there opens front matter; of two
//! neighbouring lists with one marker, which read as one list, the later takes another marker
//! (the earlier one, beside a raw list, unless that joins it to the list before it), and of two
//! raw lists the source of the later (or else of the earlier) gets another marker at each item
//! (D-107); raw text that the writer copies as it is and that the end of its file ended gets its
//! end before another block (D-106). The lists among the children of a block stay apart the same
//! way at any depth (`children`, D-105), and so do the blocks written at one level, one after
//! another: a toggle without text is its children (`flat`, D-191). The other protections of
//! `serialize.ts` keep the gaps of a snapshot.
use std::borrow::Cow;
use std::collections::HashMap;

use gotipe_core::{AttrValue, Block, BlockContent};

use crate::markdown_parse::structure::{closing_line, list_items};

/// A top-level block as the file holds it.
pub(super) enum Top<'a> {
    /// The block, with another list marker where its own would join it to its neighbour, or
    /// with its raw source changed.
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

/// The types `block_to_markdown` writes in syntax of its own; it copies the raw text of others.
const OWN_SYNTAX: [&str; 14] = [
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "todoList",
    "codeBlock",
    "blockquote",
    "callout",
    "divider",
    "image",
    "file",
    "embed",
    "math",
    "table",
];

/// A top-level block that is written, with what the protections change in it.
struct Written<'a> {
    block: &'a Block,
    /// The marker a list is written with instead of its own.
    marker: Option<char>,
    /// The source a raw block is written with instead of its own.
    raw: Option<String>,
}

impl<'a> Written<'a> {
    fn new(block: &'a Block) -> Self {
        Self {
            block,
            marker: None,
            raw: None,
        }
    }

    /// The source of a block written as it is: raw text, which the writer copies.
    fn source(&self) -> Option<&str> {
        match (&self.raw, &self.block.content) {
            (Some(raw), _) => Some(raw),
            (None, BlockContent::Raw(source)) => Some(source),
            _ => None,
        }
    }

    /// The block as it is written: with its raw source or its list marker changed.
    fn applied(self) -> Cow<'a, Block> {
        match self {
            Written {
                block,
                raw: Some(raw),
                ..
            } => {
                let mut block = block.clone();
                block.content = BlockContent::Raw(raw);
                Cow::Owned(block)
            }
            Written {
                block,
                marker: Some(marker),
                ..
            } => Cow::Owned(remarked(block, marker)),
            Written { block, .. } => Cow::Borrowed(block),
        }
    }
}

/// The top-level blocks of `blocks` that are written, in order.
pub(super) fn top_blocks(blocks: &[Block]) -> Vec<Top<'_>> {
    let written: Vec<&Block> = blocks.iter().filter(|block| !empty(block)).collect();
    let changed = protect(&written);
    let last = written.len().saturating_sub(1);
    written
        .into_iter()
        .enumerate()
        .map(|(index, block)| {
            if index == 0 && block.block_type == "divider" {
                return Top::Stars;
            }
            let mut block = rebuilt(block, &changed);
            // raw source that the end of its file ended takes in the next block: written as it
            // is, it gets its end (D-106); the writer ends the blocks of its own syntax itself
            if index < last && !OWN_SYNTAX.contains(&block.block_type.as_str()) {
                if let BlockContent::Raw(source) = &block.content {
                    let closer = closing_line(source);
                    if !closer.is_empty() {
                        let closed = format!("{source}{closer}");
                        block.to_mut().content = BlockContent::Raw(closed);
                    }
                }
            }
            Top::Block(block)
        })
        .collect()
}

/// The children of a block, written one after another, with the protection of lists of the top
/// level at any depth (`siblingBlocks` of the TS writer, D-105, D-191). A child that writes no
/// line of its own keeps no lists apart.
pub(super) fn children<'a>(blocks: impl Iterator<Item = &'a Block>) -> Vec<Cow<'a, Block>> {
    let blocks: Vec<&Block> = blocks.filter(|block| !writes_no_line(block)).collect();
    let changed = protect(&blocks);
    blocks
        .into_iter()
        .map(|block| rebuilt(block, &changed))
        .collect()
}

/// The blocks the protection of lists changed, by their place in the document, as they are
/// written.
type Changed = HashMap<*const Block, Block>;

/// What the protection of lists changes among `blocks` and the blocks written at their level
/// after each of them (`flat`).
fn protect(blocks: &[&Block]) -> Changed {
    let mut written = vec![];
    for block in blocks {
        flat(block, &mut written);
    }
    separate(&mut written);
    written
        .into_iter()
        .filter_map(|item| {
            let at = std::ptr::from_ref(item.block);
            match item.applied() {
                Cow::Owned(block) => Some((at, block)),
                Cow::Borrowed(_) => None,
            }
        })
        .collect()
}

/// The blocks `block` is written as, one after another, as `flat` of the TS writer (D-191): the
/// children of a block that does not hold them in its syntax follow it at its level, and a block
/// that writes nothing before them is only its children.
fn flat<'a>(block: &'a Block, written: &mut Vec<Written<'a>>) {
    if !transparent(block) {
        written.push(Written::new(block));
    }
    if !inside(block) {
        for child in block.children.iter().filter(|child| !writes_no_line(child)) {
            flat(child, written);
        }
    }
}

/// `block` with what the protection of lists changed in it and in the blocks below it at its
/// level.
fn rebuilt<'a>(block: &'a Block, changed: &Changed) -> Cow<'a, Block> {
    let mut out = changed
        .get(&std::ptr::from_ref(block))
        .map_or(Cow::Borrowed(block), |own| Cow::Owned(own.clone()));
    if !inside(block) {
        for (index, child) in block.children.iter().enumerate() {
            if let Cow::Owned(child) = rebuilt(child, changed) {
                out.to_mut().children[index] = child;
            }
        }
    }
    out
}

/// Whether `block` holds its children in its syntax: a list its items, a table its rows, a quote.
fn inside(block: &Block) -> bool {
    is_list(block)
        || matches!(
            block.block_type.as_str(),
            "table" | "blockquote" | "callout"
        )
}

/// Whether `block` writes nothing before its children: a block without syntax of its own (a
/// paragraph, a toggle, columns) without text, as `transparent` of the TS writer (D-191).
fn transparent(block: &Block) -> bool {
    !is_list(block) && !own_line(block) && !writes_text(block)
}

/// The blocks written in syntax of their own: without text they still write a line.
fn own_line(block: &Block) -> bool {
    matches!(
        block.block_type.as_str(),
        "heading"
            | "codeBlock"
            | "blockquote"
            | "callout"
            | "divider"
            | "image"
            | "file"
            | "embed"
            | "math"
            | "table"
    )
}

/// Of two neighbouring lists with one marker, which read as one list, the later takes another
/// marker (the earlier one, beside a raw list, unless that joins it to the list before it), and
/// of two raw lists the source of the later (or else of the earlier) gets another marker.
fn separate(written: &mut [Written]) {
    for index in 1..written.len() {
        let Some(before) = signature(&written[index - 1]) else {
            continue;
        };
        if signature(&written[index]) != Some(before) {
            continue;
        }
        if is_list(written[index].block) {
            let next = written.get(index + 1).and_then(signature);
            written[index].marker = Some(alternate(before, next));
        } else if is_list(written[index - 1].block) {
            // a numbered list has one other delimiter: where it would join the list before it,
            // the raw list after it takes another marker instead
            let earlier = index.checked_sub(2).and_then(|at| signature(&written[at]));
            let marker = alternate(before, earlier);
            if earlier == Some(with_marker(before, marker))
                && remark_raw(written, index, before, Some(index + 1), false)
            {
                continue;
            }
            written[index - 1].marker = Some(marker);
        } else if !remark_raw(written, index, before, Some(index + 1), false) {
            remark_raw(written, index - 1, before, index.checked_sub(2), true);
        }
    }
}

/// A block that writes no line but blanks of its own, so it keeps no lists apart: raw source of
/// blanks, a list without items, and a block without syntax of its own (a paragraph, a toggle,
/// columns) without text whose children write none (D-157), as `writesNoLine` of the TS writer.
pub(super) fn writes_no_line(block: &Block) -> bool {
    match block.block_type.as_str() {
        // as the TS writer, which writes raw source only from a string
        "markdownRaw" => !matches!(block.content, BlockContent::Raw(_)) || !writes_text(block),
        _ if is_list(block) => block.children.is_empty(),
        // syntax of its own is a line without text too
        _ if own_line(block) => super::omitted(block),
        _ => !writes_text(block) && block.children.iter().all(writes_no_line),
    }
}

/// Whether the content of a block without syntax of its own writes a line: rich text with a
/// character, or source with more than blanks.
fn writes_text(block: &Block) -> bool {
    match &block.content {
        BlockContent::Raw(source) => !source.trim_matches([' ', '\t', '\r', '\n']).is_empty(),
        _ => has_text(block),
    }
}

/// Gives the raw list at `index`, of `signature`, another marker at each of its items than its
/// neighbour's and, where it can, than the one of the list at `other` (D-107): raw source is
/// written as it is, so its own marker would join it to the neighbour. A list `behind` it is
/// never joined: the loop does not come back to it.
fn remark_raw(
    written: &mut [Written],
    index: usize,
    signature_of: Signature,
    other: Option<usize>,
    behind: bool,
) -> bool {
    let Some(source) = written[index].source().map(str::to_owned) else {
        return false;
    };
    let avoid = other.and_then(|at| written.get(at)).and_then(signature);
    let first = alternate(signature_of, avoid);
    let rest = match signature_of {
        Signature::Numbered(_) => vec![],
        Signature::Bullet(bullet) => ['-', '*', '+']
            .into_iter()
            .filter(|&other| other != first && other != bullet)
            .collect(),
    };
    for marker in std::iter::once(first).chain(rest) {
        if behind && avoid == Some(with_marker(signature_of, marker)) {
            continue;
        }
        if let Some(raw) = remarked_source(&source, marker) {
            written[index].raw = Some(raw);
            return true;
        }
    }
    false
}

/// `source`, a list, with `marker` as the bullet or numbering delimiter of each of its items;
/// `None` where it would not read as the same items: a line of three `*` is a thematic break,
/// not an item.
fn remarked_source(source: &str, marker: char) -> Option<String> {
    let items = list_items(source)?;
    let mut out = String::with_capacity(source.len());
    let mut from = 0;
    for &(start, _) in &items {
        let at = start
            + source[start..]
                .bytes()
                .take_while(u8::is_ascii_digit)
                .count();
        if !matches!(
            source.as_bytes().get(at),
            Some(b'-' | b'*' | b'+' | b'.' | b')')
        ) {
            return None;
        }
        out.push_str(&source[from..at]);
        out.push(marker);
        from = at + 1;
    }
    out.push_str(&source[from..]);
    (list_items(&out)? == items).then_some(out)
}

/// `cannotInterrupt` of the TS writer: a numbered list that does not start at 1, or a list whose
/// first item has no text (a task's `[ ]` is text), cannot interrupt a paragraph, so after the
/// text of a list item it starts after a blank line.
pub(super) fn cannot_interrupt(list: &Block) -> bool {
    match list.block_type.as_str() {
        "orderedList" if super::lists::list_start(list) != 1 => true,
        "bulletList" | "orderedList" => list.children.first().is_none_or(|item| !has_text(item)),
        "todoList" => list.children.is_empty(),
        _ => false,
    }
}

/// Whether the first line of `block` reads as more of the text before it, the item's or that of
/// the last line of a nested list or a quote, as `continuesText` of the TS writer (D-116): a
/// paragraph, a link line, a table, `$$` and raw HTML do not interrupt it; raw source of a list
/// or a quote does. Lists have `cannot_interrupt`.
pub(super) fn continues_text(block: &Block) -> bool {
    match block.block_type.as_str() {
        "markdownRaw" => !matches!(
            block.attrs.get("kind"),
            Some(AttrValue::String(kind)) if kind == "list" || kind == "blockquote"
        ),
        "heading" | "codeBlock" | "blockquote" | "callout" | "divider" => false,
        _ => !is_list(block),
    }
}

/// Whether `block` or a block inside it is source written as it is with a line that opens a fence
/// or HTML, as `copiesOpener` of the TS writer: only such a block can run on to the end of its
/// file (D-106, D-111). The writer ends a code block and a formula itself.
pub(super) fn copies_opener(block: &Block) -> bool {
    let copied = match &block.content {
        BlockContent::Raw(source) => {
            !matches!(block.block_type.as_str(), "codeBlock" | "math") && opens(source)
        }
        _ => false,
    };
    copied || block.children.iter().any(copies_opener)
}

/// Whether a line of `source` starts a fence or HTML, after at most three spaces.
fn opens(source: &str) -> bool {
    source.split(['\r', '\n']).any(|line| {
        let rest = line.trim_start_matches(' ');
        line.len() - rest.len() <= 3
            && (rest.starts_with("```") || rest.starts_with("~~~") || rest.starts_with('<'))
    })
}

/// Whether the last line of `block` ends it, so that a line after it starts a block of its own.
pub(super) fn closed(block: &Block) -> bool {
    matches!(
        block.block_type.as_str(),
        "heading" | "codeBlock" | "math" | "divider"
    )
}

/// `isBlockEmpty` of the TS writer: a block it leaves out at the top level. A block that writes no
/// line, a list without items (D-124), raw source of blanks or a toggle without text and children,
/// keeps no lists apart (D-123) and takes no blank lines (D-157). A heading without text is left
/// out too, but not the blocks under it (D-190).
fn empty(block: &Block) -> bool {
    match block.block_type.as_str() {
        "heading" => !has_text(block) && block.children.iter().all(writes_no_line),
        _ => writes_no_line(block),
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

/// The signature of a list, written with its `marker` when it is set; of a raw list, of the
/// source it is written with.
fn signature(item: &Written) -> Option<Signature> {
    let block = item.block;
    let attr = |name: &str| match block.attrs.get(name) {
        Some(AttrValue::String(value)) => value.as_str(),
        _ => "",
    };
    match block.block_type.as_str() {
        "markdownRaw" if attr("kind") == "list" => item.source().and_then(source_signature),
        "orderedList" => Some(Signature::Numbered(
            item.marker
                .unwrap_or(if attr("delimiter") == ")" { ')' } else { '.' }),
        )),
        "bulletList" | "todoList" => Some(Signature::Bullet(item.marker.unwrap_or(
            match attr("marker") {
                "+" => '+',
                "*" => '*',
                _ => '-',
            },
        ))),
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

/// The signature of a list of the kind of `signature` written with `marker`.
fn with_marker(signature: Signature, marker: char) -> Signature {
    match signature {
        Signature::Bullet(_) => Signature::Bullet(marker),
        Signature::Numbered(_) => Signature::Numbered(marker),
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
    fn a_raw_list_takes_another_marker_at_each_of_its_items() {
        assert_eq!(
            remarked_source("- a\n\n  b\n- c", '*').as_deref(),
            Some("* a\n\n  b\n* c")
        );
        assert_eq!(
            remarked_source("1. a\r\n2. b", ')').as_deref(),
            Some("1) a\r\n2) b")
        );
        // a nested list keeps its marker
        assert_eq!(
            remarked_source("- a\n  - n", '+').as_deref(),
            Some("+ a\n  - n")
        );
        // `* * *` is a thematic break, not an item
        assert_eq!(remarked_source("- * *\n\n  c", '*'), None);
        assert_eq!(remarked_source("a", '*'), None);
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
