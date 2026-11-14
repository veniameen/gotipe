//! Mark interpretation, Unicode-aware wrapping and line layout.
use super::{
    flow::Row,
    fonts::{FontStyle, Fonts},
    model::{Color, DrawOp, TextStyle},
};
use crate::{links::Targets, ConvertError};
use gotipe_core::{AttrValue, Block, BlockContent};
use unicode_bidi::BidiInfo;
use unicode_segmentation::UnicodeSegmentation;

#[derive(Clone)]
pub(crate) struct Span {
    pub text: String,
    pub style: TextStyle,
}

pub(crate) fn color(value: &str) -> Color {
    let hex = crate::document_checks::color_hex(value).unwrap_or_else(|| "000000".into());
    std::array::from_fn(|i| {
        u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap_or(0) as f32 / 255.0
    })
}

pub(crate) fn spans(block: &Block, base: &TextStyle, links: &Targets) -> Vec<Span> {
    match &block.content {
        BlockContent::Empty => Vec::new(),
        BlockContent::Raw(text) => vec![Span {
            text: text.clone(),
            style: base.clone(),
        }],
        BlockContent::RichText(source) => source
            .iter()
            .map(|span| {
                let mut style = base.clone();
                let mut bold =
                    matches!(base.font, FontStyle::SerifBold | FontStyle::SerifBoldItalic);
                let mut italic = matches!(
                    base.font,
                    FontStyle::SerifItalic | FontStyle::SerifBoldItalic
                );
                let mut mono = base.font == FontStyle::Mono;
                for mark in &span.marks {
                    match mark.mark_type.as_str() {
                        "bold" => bold = true,
                        "italic" => italic = true,
                        "code" => mono = true,
                        "underline" => style.underline = true,
                        "strikethrough" => style.strike = true,
                        "superscript" => {
                            style.rise = base.size * 0.4;
                            style.size = base.size * 0.7;
                        }
                        "subscript" => {
                            style.rise = -base.size * 0.2;
                            style.size = base.size * 0.7;
                        }
                        "link" => {
                            if let Some(AttrValue::String(url)) = mark.attrs.get("href") {
                                style.link = links.link(url).map(|link| link.encoded());
                            }
                        }
                        "textColor" | "highlight" => {
                            let value = match mark.attrs.get("color") {
                                Some(AttrValue::String(value)) => value.as_str(),
                                _ => "yellow",
                            };
                            if mark.mark_type == "highlight" {
                                style.highlight = Some(color(value));
                            } else {
                                style.color = color(value);
                            }
                        }
                        _ => {} // validate_marks rejects unsupported marks before layout.
                    }
                }
                style.font = if mono {
                    match (bold, italic) {
                        (true, true) => FontStyle::MonoBoldItalic,
                        (true, false) => FontStyle::MonoBold,
                        (false, true) => FontStyle::MonoItalic,
                        _ => FontStyle::Mono,
                    }
                } else {
                    match (bold, italic) {
                        (true, true) => FontStyle::SerifBoldItalic,
                        (true, false) => FontStyle::SerifBold,
                        (false, true) => FontStyle::SerifItalic,
                        _ => FontStyle::Serif,
                    }
                };
                Span {
                    text: span.text.clone(),
                    style,
                }
            })
            .collect(),
    }
}

fn push_span(line: &mut Vec<Span>, text: &str, style: &TextStyle) {
    if let Some(last) = line.last_mut().filter(|last| last.style == *style) {
        last.text.push_str(text);
    } else {
        line.push(Span {
            text: text.into(),
            style: style.clone(),
        });
    }
}

/// Horizontal alignment of a paragraph's or heading's lines (`align`, the `TextAlign`
/// extension). `Start` is the reading direction's own edge, as before alignment existed.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum Align {
    #[default]
    Start,
    Left,
    Center,
    Right,
    Justify,
}

impl Align {
    pub(crate) fn of(value: &str) -> Self {
        match value {
            "left" => Self::Left,
            "center" => Self::Center,
            "right" => Self::Right,
            "justify" => Self::Justify,
            _ => Self::Start,
        }
    }
}

/// A space a line may stretch at: breakable whitespace, not a no-break space.
fn stretchable(text: &str) -> bool {
    !text.is_empty()
        && text
            .chars()
            .all(|c| c.is_whitespace() && c != '\u{a0}' && c != '\u{202f}')
}

/// A styled part of one line split into words and the spaces between them.
fn pieces(part: &str) -> Vec<(usize, &str)> {
    let mut result = Vec::new();
    let mut start = 0;
    let mut space = None;
    for (index, grapheme) in part.grapheme_indices(true) {
        let is_space = stretchable(grapheme);
        if space.is_some_and(|previous| previous != is_space) {
            result.push((start, &part[start..index]));
            start = index;
        }
        space = Some(is_space);
    }
    if start < part.len() {
        result.push((start, &part[start..]));
    }
    result
}

/// `last`: the line ends the paragraph or a hard break, so a justified line is not stretched.
fn line(
    fonts: &Fonts,
    source: &[Span],
    base_size: f32,
    width: f32,
    align: Align,
    last: bool,
) -> Result<Row, ConvertError> {
    let text: String = source.iter().map(|span| span.text.as_str()).collect();
    let bidi = BidiInfo::new(&text, None);
    let mut chunks = Vec::new();
    let mut offsets = Vec::new();
    let mut offset = 0;
    for span in source {
        offsets.push(offset);
        offset += span.text.len();
    }
    // An aligned line places words and spaces separately: spaces at its edges do not count,
    // and a justified line widens the spaces between its words.
    let split = align != Align::Start;
    let mut spaces = Vec::new();
    if let Some(paragraph) = bidi.paragraphs.first() {
        let (levels, runs) = bidi.visual_runs(paragraph, paragraph.range.clone());
        for run in runs {
            let rtl = levels[run.start].is_rtl();
            let mut parts = Vec::new();
            for (span, start) in source.iter().zip(&offsets) {
                let lo = run.start.max(*start);
                let hi = run.end.min(start + span.text.len());
                if lo < hi {
                    if split {
                        for (at, piece) in pieces(&text[lo..hi]) {
                            parts.push((piece, &span.style, lo + at));
                        }
                    } else {
                        parts.push((&text[lo..hi], &span.style, lo));
                    }
                }
            }
            if rtl {
                parts.reverse();
            }
            for (part, style, offset) in parts {
                spaces.push(split && stretchable(part));
                chunks.push((fonts.shape_direction(part, style, rtl)?, style, offset));
            }
        }
    }
    let ascent = chunks.iter().fold(base_size * 0.8, |a, (run, style, _)| {
        a.max(run.ascent() + style.rise)
    });
    let descent = chunks.iter().fold(base_size * 0.25, |d, (run, style, _)| {
        d.max(run.descent() - style.rise)
    });
    let leading = base_size * 0.25;
    let height = (ascent + descent + leading).max(base_size * 1.35);
    let widths: Vec<f32> = chunks.iter().map(|(run, _, _)| run.width()).collect();
    let used: f32 = widths.iter().sum();
    // The visible words: from the first to the last chunk that is not a space.
    let first = spaces.iter().position(|space| !space);
    let end = spaces.iter().rposition(|space| !space);
    let (mut x, gap) = match (align, first, end) {
        (Align::Start, ..) | (_, None, _) | (_, _, None) => (
            if bidi.paragraphs.first().is_some_and(|p| p.level.is_rtl()) {
                (width - used).max(0.0)
            } else {
                0.0
            },
            0.0,
        ),
        (align, Some(first), Some(end)) => {
            let before: f32 = widths[..first].iter().sum();
            let visible: f32 = widths[first..=end].iter().sum();
            let room = (width - visible).max(0.0);
            let inner = spaces[first..=end].iter().filter(|space| **space).count();
            let (left, gap) = match align {
                Align::Center => (room / 2.0, 0.0),
                Align::Right => (room, 0.0),
                Align::Justify if !last && inner > 0 => (0.0, room / inner as f32),
                _ => (0.0, 0.0),
            };
            (left - before, gap)
        }
    };
    let mut ops = Vec::new();
    for (index, (run, style, offset)) in chunks.into_iter().enumerate() {
        let advance = run.width();
        ops.push((
            offset,
            DrawOp::Text {
                x,
                y: ascent + leading * 0.5,
                run,
                style: style.clone(),
            },
        ));
        x += advance;
        if spaces[index]
            && first.is_some_and(|first| index > first)
            && end.is_some_and(|end| index < end)
        {
            x += gap;
        }
    }
    // Placement is visual, but the PDF content stream retains source reading order.
    ops.sort_by_key(|(offset, _)| *offset);
    Ok(Row {
        height,
        ops: ops.into_iter().map(|(_, op)| op).collect(),
        ..Row::default()
    })
}

fn break_after(grapheme: &str) -> bool {
    grapheme
        .chars()
        .any(|c| c.is_whitespace() && c != '\u{a0}' && c != '\u{202f}')
        || grapheme
            .chars()
            .any(|c| matches!(c as u32, 0x2e80..=0x9fff | 0xac00..=0xd7af | 0xf900..=0xfaff))
        || matches!(grapheme, "-" | "\u{200b}")
}

pub(crate) fn wrap(
    fonts: &Fonts,
    source: &[Span],
    width: f32,
    base_size: f32,
    align: Align,
) -> Result<Vec<Row>, ConvertError> {
    if width < 1.0 || !width.is_finite() {
        return Err(ConvertError::Encoding(
            "PDF content area is too narrow".into(),
        ));
    }
    let mut rows = Vec::new();
    let mut current = Vec::new();
    let mut used = 0.0;
    for span in source {
        let text = span
            .text
            .replace("\r\n", "\n")
            .replace(
                [
                    '\r', '\u{1c}', '\u{1d}', '\u{1e}', '\u{85}', '\u{2028}', '\u{2029}',
                ],
                "\n",
            )
            .replace('\t', "    ");
        let mut token = String::new();
        let mut tokens = Vec::new();
        for grapheme in text.graphemes(true) {
            if grapheme == "\n" {
                if !token.is_empty() {
                    tokens.push(std::mem::take(&mut token));
                }
                tokens.push("\n".into());
            } else {
                token.push_str(grapheme);
                if break_after(grapheme) {
                    tokens.push(std::mem::take(&mut token));
                }
            }
        }
        if !token.is_empty() {
            tokens.push(token);
        }
        for token in tokens {
            if token == "\n" {
                rows.push(line(fonts, &current, base_size, width, align, true)?);
                current.clear();
                used = 0.0;
                continue;
            }
            let token_width = fonts.shape(&token, &span.style)?.width();
            if used > 0.0 && used + token_width > width + 0.01 {
                rows.push(line(fonts, &current, base_size, width, align, false)?);
                current.clear();
                used = 0.0;
            }
            if token_width <= width + 0.01 {
                push_span(&mut current, &token, &span.style);
                used += token_width;
            } else {
                for cluster in token.graphemes(true) {
                    let advance = fonts.shape(cluster, &span.style)?.width();
                    if advance > width + 0.01 {
                        return Err(ConvertError::Encoding(
                            "PDF content area is too narrow for a text cluster".into(),
                        ));
                    }
                    if used > 0.0 && used + advance > width + 0.01 {
                        rows.push(line(fonts, &current, base_size, width, align, false)?);
                        current.clear();
                        used = 0.0;
                    }
                    push_span(&mut current, cluster, &span.style);
                    used += advance;
                }
            }
        }
    }
    // Empty paragraphs and a trailing hard break retain their line box.
    rows.push(line(fonts, &current, base_size, width, align, true)?);
    Ok(rows)
}
