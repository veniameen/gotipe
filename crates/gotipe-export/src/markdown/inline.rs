//! Rich text of a block as Markdown, as `writeInline` of `packages/markdown` writes it: the same
//! units, decisions and escapes, so both writers write the same bytes (D-97). A "\n" of the
//! document is a hard break (`\` and a line ending) where its line has text and more text
//! follows, `&#10;` where it has not (D-88); the block writer puts the continuation prefix after
//! each line ending.
use gotipe_core::{Block, BlockContent, TextSpan};

use super::{
    autolink_escapes::escape_autolinks,
    characters::{self, Lines},
    escapes,
    spans::normalize,
    units::{units, Kind, Options, Pair, Unit, Units},
    Emoji,
};
use crate::markdown_parse::atoms;

/// How a line break of the text is written.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Break {
    /// `\` and a line ending.
    Hard,
    /// `&#10;`: no text before it on its line, or none after it.
    Reference,
    /// `<br>`, in a heading or a table cell.
    Tag,
}

/// CommonMark's class of a character next to emphasis: 1 whitespace (and the edges of the
/// text), 2 punctuation, 0 any other.
pub(super) fn class(c: Option<char>) -> u8 {
    match c {
        None => 1,
        Some(
            '\t'
            | '\n'
            | '\u{c}'
            | '\r'
            | ' '
            | '\u{a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}',
        ) => 1,
        Some(c) if punctuation(c) => 2,
        Some(_) => 0,
    }
}

fn punctuation(c: char) -> bool {
    let mut buffer = [0; 4];
    re!(r"^[\p{P}\p{S}]$").is_match(c.encode_utf8(&mut buffer))
}

/// Inline code; a cell writes `|` as `\|`.
fn render_code(text: &str, o: &Options) -> String {
    if o.kind == Kind::Cell {
        text.replace('|', "\\|")
    } else {
        text.to_owned()
    }
}

pub(super) fn write_inline(spans: &[TextSpan], o: &Options) -> String {
    let spans = normalize(spans);
    let Units { units, mut pairs } = units(&spans, o);
    let n = units.len();
    let content =
        |unit: &Unit| matches!(unit, Unit::Text(_) | Unit::Verbatim { .. } | Unit::Code(_));

    // 1. line breaks: written as such where the line already has text (not only delimiters or
    // tags: `<em>` alone on a line would start an HTML block) and more text follows
    let mut content_after = vec![false; n + 1];
    for k in (0..n).rev() {
        content_after[k] = content_after[k + 1] || content(&units[k]);
    }
    let mut breaks: Vec<Option<Break>> = vec![None; n];
    let mut line_has_content = false;
    for k in 0..n {
        if !matches!(units[k], Unit::Newline) {
            line_has_content |= content(&units[k]);
            continue;
        }
        if matches!(o.kind, Kind::Heading | Kind::Cell) {
            breaks[k] = Some(Break::Tag);
        } else if line_has_content && content_after[k + 1] {
            breaks[k] = Some(Break::Hard);
            line_has_content = false;
            continue;
        } else {
            breaks[k] = Some(Break::Reference);
        }
        line_has_content = true;
    }
    let is_break = |k: usize| breaks.get(k).copied().flatten() == Some(Break::Hard);
    let multiline =
        matches!(o.kind, Kind::Block | Kind::Midline) && breaks.contains(&Some(Break::Hard));

    // 2. lines
    let mut line_index = vec![0; n];
    let mut at_line_start = vec![false; n];
    let mut line_start_of = vec![0; n];
    let (mut line, mut start, mut first) = (0, true, 0);
    for k in 0..n {
        if start {
            first = k;
        }
        line_index[k] = line;
        at_line_start[k] = start;
        line_start_of[k] = first;
        start = is_break(k);
        line += usize::from(start);
    }
    let strips_leading =
        |k: usize| at_line_start[k] && (o.kind != Kind::Midline || line_index[k] > 0);
    let block_rules = |k: usize| {
        at_line_start[k] && (o.kind == Kind::Block || o.kind == Kind::Midline && line_index[k] > 0)
    };

    // 3. whitespace that a reader would drop is written as a reference
    let reference: Vec<bool> = (0..n)
        .map(|k| {
            matches!(units[k], Unit::Text(' ' | '\t'))
                && (strips_leading(k) || k + 1 == n || is_break(k + 1))
        })
        .collect();

    let fixed = |k: usize, pairs: &[Pair]| -> String {
        match &units[k] {
            Unit::Syntax { text, .. } | Unit::Verbatim { text, .. } | Unit::Code(text) => {
                text.clone()
            }
            Unit::Emphasis { pair, open } => {
                let pair = &pairs[*pair];
                match (pair.tag, open) {
                    (true, true) => pair.open_tag,
                    (true, false) => pair.close_tag,
                    _ => pair.delim,
                }
                .into()
            }
            Unit::Newline => match breaks[k] {
                Some(Break::Hard) => "\n",
                Some(Break::Reference) => "&#10;",
                _ => "<br>",
            }
            .into(),
            Unit::Text(_) => String::new(),
        }
    };
    let class_at = |k: Option<usize>, first: bool, pairs: &[Pair]| -> u8 {
        let Some(k) = k.filter(|k| *k < n) else {
            return 1;
        };
        match &units[k] {
            Unit::Emphasis { .. } => 2,
            Unit::Text(_) if reference[k] => 2,
            Unit::Text(c) => class(Some(*c)),
            Unit::Newline if is_break(k) => 1,
            Unit::Newline => 2,
            _ => {
                let text = fixed(k, pairs);
                if text.is_empty() {
                    1
                } else if first {
                    class(text.chars().next())
                } else {
                    class(text.chars().next_back())
                }
            }
        }
    };

    // 4. emphasis delimiters or tags. Neighbouring delimiters of one character are one run, so
    // flanking is checked per run; a run of closers and openers (`*a***b**`) is ambiguous and
    // its openers fall back to tags. To a fixed point: a pair switched to tags changes its runs.
    if o.tier >= 2 {
        for pair in &mut pairs {
            pair.tag = true;
        }
    } else {
        let mut changed = true;
        let mut guard = 0;
        while changed && guard < n + 2 {
            guard += 1;
            changed = false;
            let mut k = 0;
            while k < n {
                let Unit::Emphasis { pair, .. } = units[k] else {
                    k += 1;
                    continue;
                };
                if pairs[pair].tag {
                    k += 1;
                    continue;
                }
                let delim = pairs[pair].delim.as_bytes()[0];
                let mut end = k;
                while let Some(Unit::Emphasis { pair, .. }) = units.get(end) {
                    if pairs[*pair].tag || pairs[*pair].delim.as_bytes()[0] != delim {
                        break;
                    }
                    end += 1;
                }
                let before = class_at(k.checked_sub(1), false, &pairs);
                let after = class_at(Some(end), true, &pairs);
                let has_close = units[k..end]
                    .iter()
                    .any(|unit| matches!(unit, Unit::Emphasis { open: false, .. }));
                let left = after != 1 && (after != 2 || before != 0);
                let right = before != 1 && (before != 2 || after != 0);
                for unit in &units[k..end] {
                    if let Unit::Emphasis { pair, open } = unit {
                        let bad = if *open { has_close || !left } else { !right };
                        if bad && !pairs[*pair].tag {
                            pairs[*pair].tag = true;
                            changed = true;
                        }
                    }
                }
                k = end;
            }
        }
    }

    // 5. how each typed character is written, left to right
    let mut rend: Vec<String> = (0..n)
        .map(|k| match &units[k] {
            Unit::Code(text) => render_code(text, o),
            Unit::Text(_) => String::new(),
            _ => fixed(k, &pairs),
        })
        .collect();
    characters::decide(
        &units,
        &mut rend,
        &Lines {
            o,
            reference: &reference,
            breaks: &breaks,
            line_index: &line_index,
            at_line_start: &at_line_start,
            line_start_of: &line_start_of,
            multiline,
            block_rules: &block_rules,
        },
    );

    // 5b. typed text that would read as an autolink literal (D-97)
    escape_autolinks(&units, &mut rend);
    // 6. backslashes, dollars and colons
    escapes::following(&units, &mut rend, &is_break, o.emoji);

    // 7. the Markdown
    let mut out = String::new();
    for (k, written) in rend.iter().enumerate() {
        if is_break(k) {
            out.push('\\');
            out.push_str(o.newline);
        } else {
            out.push_str(written);
        }
    }
    out
}

/// The Markdown of a block's content written as `kind`.
pub(super) fn content_to_markdown(content: &BlockContent, o: &Options) -> String {
    match content {
        BlockContent::RichText(spans) => write_inline(spans, o),
        BlockContent::Raw(raw) => raw.clone(),
        BlockContent::Empty => String::new(),
    }
}

/// The names and addresses of the custom emoji in `block` and its children.
pub(super) fn collect_emoji(block: &Block, emoji: &mut Emoji) {
    if let BlockContent::RichText(spans) = &block.content {
        for mark in spans.iter().flat_map(|span| &span.marks) {
            if mark.mark_type == "customEmoji" {
                let name = atoms::attr(mark, "name").unwrap_or_default();
                let src = atoms::attr(mark, "src").unwrap_or_default();
                emoji.insert(name.to_owned(), src.to_owned());
            }
        }
    }
    for child in &block.children {
        collect_emoji(child, emoji);
    }
}
