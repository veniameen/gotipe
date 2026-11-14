//! Rich text of a block as Markdown: marks, verbatim source and inline atoms
//! (docs/development/inline-atoms.md). Atoms are written as `packages/markdown` writes them.
use gotipe_core::{AttrValue, Block, BlockContent, Mark, TextSpan};

use super::{
    code_fence, destination, escape_entities, escape_text, link_destination, title_suffix, Emoji,
};
use crate::markdown_parse::atoms;

/// Markdown under construction and the byte offsets of its typed dollars and colons: text of
/// the document, as opposed to the `$` of a formula, the `:` of an emoji or verbatim source.
#[derive(Default)]
struct Written {
    text: String,
    dollars: Vec<usize>,
    colons: Vec<usize>,
    /// Escaped document text, as opposed to syntax or verbatim source.
    typed: bool,
}

impl Written {
    fn verbatim(text: String) -> Self {
        Self {
            text,
            ..Self::default()
        }
    }

    /// Document text with Markdown's own characters escaped.
    fn typed(text: &str) -> Self {
        let text = escape_text(text);
        let at = |c| text.match_indices(c).map(|(index, _)| index).collect();
        Self {
            dollars: at('$'),
            colons: at(':'),
            typed: true,
            text,
        }
    }

    /// The ASCII letter or digit at byte `at` written as a character reference, so that it
    /// does not touch a custom emoji.
    fn reference(&mut self, at: usize) {
        let reference = format!("&#{};", self.text.as_bytes()[at]);
        self.text.replace_range(at..at + 1, &reference);
        for offset in self.dollars.iter_mut().chain(&mut self.colons) {
            if *offset > at {
                *offset += reference.len() - 1;
            }
        }
    }

    /// `open` and `close` around everything from byte `from` to byte `to`.
    fn wrap(&mut self, from: usize, to: usize, open: &str, close: &str) {
        self.text.insert_str(to, close);
        self.text.insert_str(from, open);
        for offset in self.dollars.iter_mut().chain(&mut self.colons) {
            *offset += open.len();
        }
    }

    fn around(mut self, open: &str, close: &str) -> Self {
        let end = self.text.len();
        self.wrap(0, end, open, close);
        self
    }

    fn append(&mut self, other: Written) {
        let base = self.text.len();
        self.dollars
            .extend(other.dollars.iter().map(|dollar| base + dollar));
        self.colons
            .extend(other.colons.iter().map(|colon| base + colon));
        self.text.push_str(&other.text);
    }

    /// A typed `$` that would open a formula for a reader of inline formulas is escaped;
    /// `$5 and $6` stays as typed. Right to left: a later escape changes what follows.
    /// A table cell is one line, its breaks are written as `<br>`.
    fn finish(mut self, cell: bool, emoji: &Emoji) -> String {
        // Typed `:name:` of a registered custom emoji is escaped, left to right: a reader of
        // custom emoji would take it for one.
        for index in 0..self.colons.len() {
            let at = self.colons[index];
            let start = self.text[..at]
                .rfind('\n')
                .filter(|_| !cell)
                .map_or(0, |n| n + 1);
            let end = self.text[at..]
                .find('\n')
                .filter(|_| !cell)
                .map_or(self.text.len(), |n| at + n);
            let line = self.text[start..end].replace('\n', ">");
            if atoms::emoji_at(&line, at - start, emoji).is_some() {
                self.text.insert(at, '\\');
                for offset in self.dollars.iter_mut().chain(&mut self.colons) {
                    if *offset >= at {
                        *offset += 1;
                    }
                }
            }
        }
        let mut index = self.dollars.len();
        while index > 0 {
            // A run of typed dollars, the last one first.
            let last = index - 1;
            let mut first = last;
            while first > 0 && self.dollars[first - 1] + 1 == self.dollars[first] {
                first -= 1;
            }
            let rest = &self.text[self.dollars[last]..];
            let line = match rest.find('\n') {
                Some(end) if !cell => rest[..end].to_owned(),
                _ => rest.replace('\n', ">"),
            };
            // Two or more typed dollars in a row are text for the reader as well, unless the
            // `$` of a formula follows them: joined with it they would make the formula text.
            if line[1..].starts_with('$') || first == last && atoms::math_end(&line, 0).is_some() {
                for dollar in (first..=last).rev() {
                    self.text.insert(self.dollars[dollar], '\\');
                }
            }
            index = first;
        }
        self.text
    }
}

pub(super) fn content_to_markdown(content: &BlockContent, emoji: &Emoji) -> String {
    match content {
        BlockContent::RichText(spans) => spans_to_markdown(spans).finish(false, emoji),
        BlockContent::Raw(raw) => raw.clone(),
        BlockContent::Empty => String::new(),
    }
}

/// The text of a table cell before its `|` and line breaks are escaped.
pub(super) fn cell_to_markdown(content: &BlockContent, emoji: &Emoji) -> String {
    match content {
        BlockContent::RichText(spans) => spans_to_markdown(spans).finish(true, emoji),
        other => content_to_markdown(other, emoji),
    }
}

/// Document text outside rich text (the alt of an image block).
pub(super) fn typed(text: &str) -> String {
    Written::typed(text).finish(false, &Emoji::new())
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

/// `linkTitle` of @gotipe/markdown. Line breaks are references: a blank line in a title
/// would end the paragraph.
fn link_title(title: &str) -> String {
    format!(
        "\"{}\"",
        escape_entities(&title.replace('\\', "\\\\").replace('"', "\\\""))
            .replace('\r', "&#13;")
            .replace('\n', "&#10;")
    )
}

/// An atom written whole, or `None` when its attributes or text cannot be: then it is text.
/// The flag says that it is a formula, whose closing `$` a digit must not follow.
/// `sole`: the atom is all the text of its block.
fn atom(
    mark: &Mark,
    text: &str,
    inner: Written,
    next: Option<&TextSpan>,
    sole: bool,
) -> Option<(Written, bool)> {
    let verbatim = |text: String| Some((Written::verbatim(text), false));
    match mark.mark_type.as_str() {
        "mention" => {
            let href = atoms::mention_href(mark)?;
            let title = match atoms::attr(mark, "label") {
                Some(label)
                    if !label.is_empty()
                        && label != atoms::mention_label(atoms::mention_kind(mark), text) =>
                {
                    format!(" {}", link_title(label))
                }
                _ => String::new(),
            };
            Some((inner.around("[", &format!("]({href}{title})")), false))
        }
        "inlineMath" => {
            // `$x$5` is not a formula: a digit of text after it is written as a reference,
            // and verbatim source that starts with one leaves the formula as text.
            let raw_digit = next.is_some_and(|span| {
                span.marks.iter().any(|mark| mark.mark_type == "mdRaw")
                    && span.text.starts_with(|c: char| c.is_ascii_digit())
            });
            (atoms::math_writable(text) && !raw_digit)
                .then(|| (Written::verbatim(format!("${text}$")), true))
        }
        "customEmoji" => {
            let name = atoms::attr(mark, "name").filter(|name| atoms::emoji_name(name))?;
            // Text that repeats the shortcode is that many emoji; any other text is one.
            let code = format!(":{name}:");
            let repeated = code.repeat(text.len() / code.len()) == text;
            verbatim(if repeated { text.to_owned() } else { code })
        }
        _ => {
            let alt = atoms::attr(mark, "alt").unwrap_or(text);
            let alt = alt.replace("\r\n", " ").replace(['\r', '\n'], " ");
            let src = link_destination(atoms::attr(mark, "src").unwrap_or(""));
            // An image alone in its block takes an empty title: alone without one it is the
            // image block when read back.
            let title = if sole { " \"\"" } else { "" };
            Some((
                Written::typed(&alt).around("![", &format!("]({src}{title})")),
                false,
            ))
        }
    }
}

fn spans_to_markdown(spans: &[TextSpan]) -> Written {
    let mut out = Written::default();
    // Where the closing `$` of the formula written last ends.
    let mut formula_end = None;
    // Where the custom emoji written last ends, and whether typed text was written last.
    let mut emoji_end = None;
    let mut typed_end = false;
    let total: usize = spans.iter().map(|span| span.text.len()).sum();
    let mut index = 0;
    while index < spans.len() {
        let span = &spans[index];
        // An atom is the run of spans with the same atomic mark.
        let mark = atoms::atom_mark(&span.marks);
        let mut end = index + 1;
        while mark.is_some()
            && spans.get(end).map(|next| atoms::atom_mark(&next.marks)) == Some(mark)
        {
            end += 1;
        }
        let whole: String = spans[index..end].iter().map(|s| s.text.as_str()).collect();
        // Code or verbatim source inside a one-span mention is written as such.
        let inner = |span| {
            if end == index + 1 {
                plain(span)
            } else {
                Written::typed(&whole)
            }
        };
        let sole = whole.len() == total;
        let written = mark.and_then(|mark| atom(mark, &whole, inner(span), spans.get(end), sole));
        let emoji = written.is_some() && mark.is_some_and(|mark| mark.mark_type == "customEmoji");
        // An atom that cannot be written is the text of its spans.
        let pieces = match written {
            Some((text, formula)) => vec![(span, text, formula)],
            None => spans[index..end]
                .iter()
                .map(|span| (span, plain(span), false))
                .collect(),
        };
        for (span, mut text, formula) in pieces {
            let mention = span.marks.iter().any(|mark| mark.mark_type == "mention");
            for mark in &span.marks {
                wrap(&mut text, mark, mention);
            }
            if formula_end == Some(out.text.len()) {
                if let Some(digit) = text.text.bytes().next().filter(u8::is_ascii_digit) {
                    let reference = format!("&#{digit};");
                    text.text.replace_range(..1, &reference);
                    for dollar in &mut text.dollars {
                        *dollar += reference.len() - 1;
                    }
                }
            }
            // No letter or digit of typed text may touch a custom emoji.
            let alnum = |byte: Option<&u8>| byte.is_some_and(u8::is_ascii_alphanumeric);
            let bare = emoji && text.text.starts_with(':') && text.text.ends_with(':');
            if bare && typed_end && alnum(out.text.as_bytes().last()) {
                out.reference(out.text.len() - 1);
            }
            if emoji_end == Some(out.text.len())
                && text.typed
                && alnum(text.text.as_bytes().first())
            {
                text.reference(0);
            }
            typed_end = text.typed
                && text
                    .text
                    .as_bytes()
                    .last()
                    .is_some_and(u8::is_ascii_alphanumeric);
            out.append(text);
            emoji_end = Some(out.text.len()).filter(|_| bare);
            formula_end = Some(out.text.len()).filter(|_| formula && out.text.ends_with('$'));
        }
        index = end;
    }
    out
}

/// A span that is not an atom: verbatim source, inline code or escaped text.
fn plain(span: &TextSpan) -> Written {
    if span.marks.iter().any(|mark| mark.mark_type == "mdRaw") {
        return Written::verbatim(span.text.clone());
    }
    if span.marks.iter().any(|mark| mark.mark_type == "code") {
        let fence = code_fence(&span.text, 1);
        let padding = if span.text.starts_with('`')
            || span.text.ends_with('`')
            || span.text.starts_with(' ')
                && span.text.ends_with(' ')
                && span.text.chars().any(|c| c != ' ')
        {
            " "
        } else {
            ""
        };
        return Written::verbatim(format!("{fence}{padding}{}{padding}{fence}", span.text));
    }
    Written::typed(&span.text)
}

/// The Markdown of one mark around `text`. A mention is written as a link, so it takes
/// the place of a link on the same text.
fn wrap(text: &mut Written, mark: &Mark, mention: bool) {
    let (open, close) = match mark.mark_type.as_str() {
        "bold" => ("**", "**"),
        "italic" => ("*", "*"),
        "strikethrough" => ("~~", "~~"),
        "underline" => ("<u>", "</u>"),
        "highlight" => ("<mark>", "</mark>"),
        "superscript" => ("<sup>", "</sup>"),
        "subscript" => ("<sub>", "</sub>"),
        _ => ("", ""),
    };
    let colored;
    let (open, close) = match mark.attrs.get("color") {
        Some(AttrValue::String(color))
            if matches!(mark.mark_type.as_str(), "textColor" | "highlight")
                && crate::html::safe_color(color) =>
        {
            let (tag, property) = if mark.mark_type == "textColor" {
                ("span", "color")
            } else {
                ("mark", "background-color")
            };
            colored = format!("<{tag} style=\"{property}:{color}\">");
            (
                colored.as_str(),
                if tag == "span" { "</span>" } else { "</mark>" },
            )
        }
        _ => (open, close),
    };
    if !open.is_empty() {
        let leading = text.text.len() - text.text.trim_start().len();
        let end = text.text.trim_end().len();
        if end > leading {
            text.wrap(leading, end, open, close);
        }
    }
    if mark.mark_type == "link" && !mention {
        if let Some(AttrValue::String(href)) = mark.attrs.get("href") {
            let title = match mark.attrs.get("title") {
                Some(AttrValue::String(title)) => title.as_str(),
                _ => "",
            };
            let close = format!("](<{}>{})", destination(href), title_suffix(title));
            let end = text.text.len();
            text.wrap(0, end, "[", &close);
        }
    }
}
