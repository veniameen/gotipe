//! Rich text as the units the writer decides on (`serialization/inline-units.ts` of
//! `packages/markdown`): typed characters, line breaks, syntax, source written as it is, inline
//! code and the delimiters of emphasis. A mark shared by neighbouring spans opens once; an atom
//! is written whole (docs/development/inline-atoms.md).
use gotipe_core::{AttrValue, Mark, TextSpan};

use super::{
    links::{escape_entities, link_destination},
    spans::key,
    Emoji,
};
use crate::markdown_parse::atoms;

/// Where the rich text is written.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Kind {
    /// Paragraph-like text whose lines start a block line (paragraph, list item, quote).
    Block,
    /// The first line follows other text on its line (a task after `[ ] `).
    Midline,
    /// One line, a line break written as `<br>`.
    Heading,
    /// A table cell: one line, `|` escaped, a line break written as `<br>`.
    Cell,
}

pub(super) struct Options<'a> {
    pub kind: Kind,
    /// 0: bare autolink literals; 1: `<url>` autolinks; 2: tags for emphasis, `[t](u)` links.
    pub tier: u8,
    /// The first line continues a paragraph started before the text (alert callouts).
    pub continuation: bool,
    /// What follows the `\` of a line break: the line ending and the next line's prefix.
    pub newline: &'a str,
    /// The custom emoji the document registers: typed `:name:` of one is escaped.
    pub emoji: &'a Emoji,
}

/// The two ways of writing one emphasis mark.
pub(super) struct Pair {
    pub delim: &'static str,
    pub open_tag: &'static str,
    pub close_tag: &'static str,
    /// Written as tags: delimiters there would not read back.
    pub tag: bool,
}

pub(super) enum Unit {
    /// A typed character of the text.
    Text(char),
    /// A line break of the text.
    Newline,
    /// Syntax; `math` marks the `$` that opens (1) or closes (2) an inline formula.
    Syntax {
        text: String,
        math: u8,
    },
    /// Source written as it is; `emoji` marks a custom emoji, which no letter or digit may touch.
    Verbatim {
        text: String,
        emoji: bool,
    },
    Code(String),
    /// The opening or closing delimiter of `pairs[pair]`.
    Emphasis {
        pair: usize,
        open: bool,
    },
}

pub(super) struct Units {
    pub units: Vec<Unit>,
    pub pairs: Vec<Pair>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum LeafKind {
    Text,
    Code,
    Raw,
}

enum Child {
    /// A span, by its index.
    Leaf(usize),
    /// A mark node, by its index.
    Node(usize),
}

struct Node {
    mark: Option<Mark>,
    children: Vec<Child>,
}

/// The mark tree of the spans: node 0 is the root, a mark shared by neighbouring spans is one
/// node, and of the marks a span opens the longest-lasting is the outermost.
fn tree(spans: &[TextSpan]) -> Vec<Node> {
    // A mention is written as a link, so it takes the place of a link on the same text.
    let containers: Vec<Vec<Mark>> = spans
        .iter()
        .map(|span| {
            let mut link_seen = span.marks.iter().any(|mark| mark.mark_type == "mention");
            let mut out = vec![];
            for mark in &span.marks {
                if mark.mark_type == "code" || mark.mark_type == "mdRaw" {
                    continue;
                }
                if mark.mark_type == "link" {
                    if link_seen {
                        continue;
                    }
                    link_seen = true;
                }
                out.push(mark.clone());
            }
            out
        })
        .collect();
    let keys: Vec<Vec<String>> = containers
        .iter()
        .map(|marks| marks.iter().map(key).collect())
        .collect();
    let extent = |key: &String, from: usize| {
        keys[from..]
            .iter()
            .take_while(|keys| keys.contains(key))
            .count()
    };
    let mut nodes = vec![Node {
        mark: None,
        children: vec![],
    }];
    let mut stack: Vec<(String, usize)> = vec![];
    for (index, marks) in containers.iter().enumerate() {
        let span_keys = &keys[index];
        let keep = stack
            .iter()
            .take_while(|(key, _)| span_keys.contains(key))
            .count();
        stack.truncate(keep);
        let mut open: Vec<(usize, &Mark, &String)> = marks
            .iter()
            .zip(span_keys)
            .filter(|(_, key)| stack.iter().all(|(open, _)| open != *key))
            .map(|(mark, key)| (extent(key, index), mark, key))
            .collect();
        // stable: equal marks keep the order of their ranks
        open.sort_by(|a, b| b.0.cmp(&a.0).then(open_order(a.1).cmp(&open_order(b.1))));
        for (_, mark, key) in open {
            let parent = stack.last().map_or(0, |(_, node)| *node);
            nodes.push(Node {
                mark: Some(mark.clone()),
                children: vec![],
            });
            let node = nodes.len() - 1;
            nodes[parent].children.push(Child::Node(node));
            stack.push((key.clone(), node));
        }
        let parent = stack.last().map_or(0, |(_, node)| *node);
        nodes[parent].children.push(Child::Leaf(index));
    }
    nodes
}

fn open_order(mark: &Mark) -> u8 {
    match mark.mark_type.as_str() {
        "link" | "mention" => 0,
        "underline" | "textColor" => 1,
        "highlight" => 2,
        "superscript" => 3,
        "subscript" => 4,
        "bold" => 5,
        "italic" => 6,
        "strikethrough" => 7,
        _ => 9,
    }
}

fn emphasis_pair(kind: &str) -> Option<Pair> {
    let (delim, open_tag, close_tag) = match kind {
        "bold" => ("**", "<strong>", "</strong>"),
        "italic" => ("*", "<em>", "</em>"),
        "strikethrough" => ("~~", "<s>", "</s>"),
        _ => return None,
    };
    Some(Pair {
        delim,
        open_tag,
        close_tag,
        tag: false,
    })
}

fn tag_of(kind: &str) -> Option<&'static str> {
    match kind {
        "underline" => Some("u"),
        "highlight" => Some("mark"),
        "superscript" => Some("sup"),
        "subscript" => Some("sub"),
        _ => None,
    }
}

fn text_attr<'a>(mark: &'a Mark, name: &str) -> Option<&'a str> {
    match mark.attrs.get(name) {
        Some(AttrValue::String(value)) => Some(value),
        _ => None,
    }
}

fn longest_run(text: &str, c: char) -> usize {
    text.split(|other| other != c)
        .map(|run| run.chars().count())
        .max()
        .unwrap_or(0)
}

/// `linkTitle` of @gotipe/markdown: line breaks are references, so a blank line in a title
/// cannot end the paragraph.
pub(super) fn link_title(title: &str) -> String {
    format!(
        "\"{}\"",
        escape_entities(&title.replace('\\', "\\\\").replace('"', "\\\""))
            .replace('\r', "&#13;")
            .replace('\n', "&#10;")
    )
}

/// JavaScript `\s`: what `BARE_URL_RE`, the angle autolink check and an e-mail never hold.
fn js_blank(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

/// A link whose text is its address: bare (tier 0), in angle brackets, or `None`.
fn autolink(text: &str, href: &str, o: &Options) -> Option<(bool, String)> {
    let no_pipe = o.kind != Kind::Cell || !href.contains('|');
    // `BARE_URL_RE`: a scheme in any case, `www.` in lower case, as the readers take an address
    let url = re!(
        r#"^(?:[Hh][Tt][Tt][Pp][Ss]?://|www\.)[^\t\n\x0B\x0C\r \x{a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}<>()&*_~`|\[\]\\"'{}]+$"#
    );
    let bare = o.tier == 0
        && no_pipe
        && url.is_match(text)
        && text.ends_with(|c: char| c.is_ascii_alphanumeric() || c == '/')
        && (href == text || href == format!("http://{text}"))
        && (href != text || re!(r"^(?i-u:https?:)").is_match(text));
    if bare {
        return Some((true, text.to_owned()));
    }
    let angle = re!(r"^[A-Za-z][A-Za-z0-9+.-]{1,31}:").is_match(href)
        && !href
            .chars()
            .any(|c| js_blank(c) || matches!(c, '<' | '>' | '&') || c <= '\u{1f}');
    if no_pipe && angle && href == text {
        return Some((false, text.to_owned()));
    }
    let email = re!(
        r"^[A-Za-z0-9.!#$%'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
    );
    if no_pipe && href.strip_prefix("mailto:") == Some(text) && email.is_match(text) {
        return Some((false, text.to_owned()));
    }
    None
}

struct Builder<'a> {
    spans: &'a [TextSpan],
    nodes: &'a [Node],
    o: &'a Options<'a>,
    /// The length of the block text: an image that is all of it is written apart.
    total: usize,
    out: Units,
}

impl Builder<'_> {
    fn push(&mut self, unit: Unit) {
        self.out.units.push(unit);
    }

    fn syntax(&mut self, text: impl Into<String>) {
        self.push(Unit::Syntax {
            text: text.into(),
            math: 0,
        });
    }

    fn cell(&self, text: &str) -> String {
        if self.o.kind == Kind::Cell {
            text.replace('|', "\\|")
        } else {
            text.to_owned()
        }
    }

    fn leaf_kind(&self, index: usize) -> LeafKind {
        let has = |kind: &str| {
            self.spans[index]
                .marks
                .iter()
                .any(|mark| mark.mark_type == kind)
        };
        if has("mdRaw") {
            LeafKind::Raw
        } else if has("code") {
            LeafKind::Code
        } else {
            LeafKind::Text
        }
    }

    /// The spans under node `node`, in order.
    fn leaves(&self, node: usize, out: &mut Vec<usize>) {
        for child in &self.nodes[node].children {
            match child {
                Child::Leaf(index) => out.push(*index),
                Child::Node(inner) => self.leaves(*inner, out),
            }
        }
    }

    fn code(&mut self, text: &str) {
        let fence = "`".repeat(longest_run(text, '`') + 1);
        let pad = if text.starts_with('`')
            || text.ends_with('`')
            || text.starts_with(' ') && text.ends_with(' ') && text.contains(|c| c != ' ')
        {
            " "
        } else {
            ""
        };
        self.syntax(format!("{fence}{pad}"));
        self.push(Unit::Code(text.to_owned()));
        self.syntax(format!("{pad}{fence}"));
    }

    fn leaf(&mut self, index: usize) {
        let text = &self.spans[index].text;
        match self.leaf_kind(index) {
            LeafKind::Raw => self.push(Unit::Verbatim {
                text: text.clone(),
                emoji: false,
            }),
            // A reader makes a line ending inside code a space (CommonMark), so a line break of
            // code text closes the code, is written as a line break and opens it again (D-89).
            // "\n", "\r\n" and "\r" are one line break of the document (D-94).
            LeafKind::Code => {
                let parts: Vec<&str> = text
                    .split("\r\n")
                    .flat_map(|part| part.split(['\r', '\n']))
                    .collect();
                for (number, part) in parts.iter().enumerate() {
                    if number > 0 {
                        self.push(Unit::Newline);
                    }
                    if !part.is_empty() {
                        self.code(part);
                    }
                }
            }
            LeafKind::Text => {
                let mut chars = text.chars().peekable();
                while let Some(c) = chars.next() {
                    match c {
                        '\n' => self.push(Unit::Newline),
                        '\r' if chars.peek() == Some(&'\n') => {}
                        '\r' => self.push(Unit::Newline),
                        _ => self.push(Unit::Text(c)),
                    }
                }
            }
        }
    }

    /// An atom is written whole; `false` when its attributes or text cannot be, then it is text.
    fn atom(&mut self, node: usize, mark: &Mark) -> bool {
        let mut inner = vec![];
        self.leaves(node, &mut inner);
        let text: String = inner
            .iter()
            .map(|index| self.spans[*index].text.as_str())
            .collect();
        let whole = |builder: &mut Self, source: String| {
            builder.push(Unit::Verbatim {
                text: source,
                emoji: false,
            })
        };
        match mark.mark_type.as_str() {
            "mention" => {
                let Some(href) = atoms::mention_href(mark) else {
                    return false;
                };
                let title = match text_attr(mark, "label") {
                    Some(label)
                        if !label.is_empty()
                            && label != atoms::mention_label(atoms::mention_kind(mark), &text) =>
                    {
                        format!(" {}", self.cell(&link_title(label)))
                    }
                    _ => String::new(),
                };
                self.syntax("[");
                self.emit(node);
                self.syntax(format!("]({href}{title})"));
            }
            "inlineMath" => {
                // `$x$5` is not a formula: verbatim source that starts with a digit after it
                // leaves the formula as text; typed digits are written as references
                let next = inner
                    .last()
                    .map(|last| last + 1)
                    .filter(|next| *next < self.spans.len());
                let raw_digit = next.is_some_and(|next| {
                    self.leaf_kind(next) == LeafKind::Raw
                        && self.spans[next]
                            .text
                            .starts_with(|c: char| c.is_ascii_digit())
                });
                if !atoms::math_writable(&text) || raw_digit {
                    return false;
                }
                self.push(Unit::Syntax {
                    text: "$".into(),
                    math: 1,
                });
                whole(self, self.cell(&text));
                self.push(Unit::Syntax {
                    text: "$".into(),
                    math: 2,
                });
            }
            "customEmoji" => {
                let Some(name) = text_attr(mark, "name").filter(|name| atoms::emoji_name(name))
                else {
                    return false;
                };
                // Text that repeats the shortcode is that many emoji; any other text is one.
                let code = format!(":{name}:");
                let repeated = code.repeat(text.len() / code.len()) == text;
                self.push(Unit::Verbatim {
                    text: if repeated { text } else { code },
                    emoji: true,
                });
            }
            _ => {
                let alt = text_attr(mark, "alt").unwrap_or(&text).to_owned();
                // An image alone in its block takes an empty title: alone without one it is the
                // image block when read back.
                let sole = text.len() == self.total;
                let close = format!(
                    "]({}{})",
                    self.cell(&link_destination(text_attr(mark, "src").unwrap_or(""))),
                    if sole { " \"\"" } else { "" }
                );
                if alt == text {
                    self.syntax("![");
                    self.emit(node);
                    self.syntax(close);
                } else {
                    let alt = alt.replace("\r\n", " ").replace(['\r', '\n'], " ");
                    let mut escaped = String::new();
                    for c in alt.chars() {
                        if c.is_ascii_punctuation() {
                            escaped.push('\\');
                        }
                        escaped.push(c);
                    }
                    whole(self, format!("![{escaped}{close}"));
                }
            }
        }
        true
    }

    fn link(&mut self, node: usize, mark: &Mark) {
        let href = text_attr(mark, "href").unwrap_or("");
        let title = text_attr(mark, "title").filter(|title| !title.is_empty());
        if let [Child::Leaf(only)] = self.nodes[node].children.as_slice() {
            let only = *only;
            if self.leaf_kind(only) == LeafKind::Text && title.is_none() && self.o.tier < 2 {
                let text = self.spans[only].text.clone();
                if let Some((bare, text)) = autolink(&text, href, self.o) {
                    if !bare {
                        self.syntax("<");
                    }
                    self.push(Unit::Verbatim { text, emoji: false });
                    if !bare {
                        self.syntax(">");
                    }
                    return;
                }
            }
        }
        self.syntax("[");
        self.emit(node);
        let mut tail = format!("]({}", self.cell(&link_destination(href)));
        if let Some(title) = title {
            tail.push(' ');
            tail.push_str(&self.cell(&link_title(title)));
        }
        tail.push(')');
        self.syntax(tail);
    }

    fn emit(&mut self, node: usize) {
        for child in 0..self.nodes[node].children.len() {
            let inner = match self.nodes[node].children[child] {
                Child::Leaf(index) => {
                    self.leaf(index);
                    continue;
                }
                Child::Node(inner) => inner,
            };
            let mark = self.nodes[inner].mark.clone().expect("a mark node");
            if atoms::TYPES.contains(&mark.mark_type.as_str()) && self.atom(inner, &mark) {
                continue;
            }
            if let Some(pair) = emphasis_pair(&mark.mark_type) {
                self.out.pairs.push(pair);
                let pair = self.out.pairs.len() - 1;
                self.push(Unit::Emphasis { pair, open: true });
                self.emit(inner);
                self.push(Unit::Emphasis { pair, open: false });
                continue;
            }
            let color = text_attr(&mark, "color").filter(|color| crate::html::safe_color(color));
            if mark.mark_type == "textColor" {
                if let Some(color) = color {
                    self.syntax(format!("<span style=\"color:{color}\">"));
                }
                self.emit(inner);
                if color.is_some() {
                    self.syntax("</span>");
                }
                continue;
            }
            if let Some(tag) = tag_of(&mark.mark_type) {
                match color.filter(|_| mark.mark_type == "highlight") {
                    Some(color) => self.syntax(format!("<{tag} style=\"background:{color}\">")),
                    None => self.syntax(format!("<{tag}>")),
                }
                self.emit(inner);
                self.syntax(format!("</{tag}>"));
                continue;
            }
            if mark.mark_type == "link" {
                self.link(inner, &mark);
                continue;
            }
            self.emit(inner);
        }
    }
}

/// The units of normalized spans (`spans::normalize`).
pub(super) fn units(spans: &[TextSpan], o: &Options) -> Units {
    let nodes = tree(spans);
    let mut builder = Builder {
        spans,
        nodes: &nodes,
        o,
        total: spans.iter().map(|span| span.text.len()).sum(),
        out: Units {
            units: vec![],
            pairs: vec![],
        },
    };
    builder.emit(0);
    builder.out
}
