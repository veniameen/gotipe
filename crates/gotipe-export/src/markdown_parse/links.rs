use super::{
    decode::{self, punctuation},
    syntax::inline_html,
    MarkdownAtoms, Node, Source,
};
use std::collections::HashSet;
#[derive(Clone, Copy)]
pub(super) struct Context<'a> {
    pub references: &'a HashSet<String>,
    pub budget: &'a std::cell::Cell<usize>,
    /// Inline atoms the reader was asked for.
    pub atoms: &'a MarkdownAtoms,
    pub in_cell: bool,
    pub in_label: bool,
    pub in_link: bool,
    pub preserve_trailing: bool,
}
impl<'a> Context<'a> {
    pub fn new(
        references: &'a HashSet<String>,
        budget: &'a std::cell::Cell<usize>,
        atoms: &'a MarkdownAtoms,
    ) -> Self {
        Self {
            references,
            budget,
            atoms,
            in_cell: false,
            in_label: false,
            in_link: false,
            preserve_trailing: false,
        }
    }
}
impl Context<'_> {
    pub fn consume(&self) -> bool {
        let remaining = self.budget.get();
        self.budget.set(remaining.saturating_sub(1));
        remaining > 0
    }
}
fn next(text: &str, p: usize) -> Option<char> {
    text.get(p..)?.chars().next()
}
fn skip_ws(text: &str, mut p: usize) -> usize {
    while next(text, p).is_some_and(|c| " \t\n".contains(c)) {
        p += 1
    }
    p
}
fn bracket_end(text: &str, start: usize, context: &Context) -> Option<usize> {
    let mut depth = 0;
    let mut i = start;
    while i < text.len() {
        if !context.consume() {
            return None;
        }
        let c = next(text, i)?;
        if c == '\\' && punctuation(next(text, i + 1)) {
            i += 2;
            continue;
        }
        if c == '<' {
            if let Some(n) = angle(&text[i..])
                .map(|(n, _)| n)
                .or_else(|| inline_html(&text[i..]))
            {
                i += n;
                continue;
            }
        }
        if c == '`' {
            let n = text[i..].bytes().take_while(|c| *c == b'`').count();
            if let Some(end) = text[i + n..].find(&text[i..i + n]) {
                i = i + n + end + n;
                continue;
            }
        }
        if c == '[' {
            depth += 1
        }
        if c == ']' {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
        i += c.len_utf8();
    }
    None
}
pub(super) fn destination(text: &str, from: usize) -> Option<(String, usize)> {
    let mut p = from;
    if next(text, p) == Some('<') {
        p += 1;
        while p < text.len() {
            let c = next(text, p)?;
            if c == '\\' && punctuation(next(text, p + 1)) {
                p += 2;
                continue;
            }
            if c == '>' {
                return Some((decode::string(&text[from + 1..p]), p + 1));
            }
            if c == '<' || c == '\n' {
                return None;
            }
            p += c.len_utf8();
        }
        return None;
    }
    let mut depth = 0;
    while p < text.len() {
        let c = next(text, p)?;
        if c == '\\' && punctuation(next(text, p + 1)) {
            p += 2;
            continue;
        }
        if c <= ' ' || c == '\u{7f}' {
            break;
        }
        if c == '(' {
            depth += 1;
            if depth > 32 {
                return None;
            }
        } else if c == ')' {
            if depth == 0 {
                break;
            }
            depth -= 1
        }
        p += c.len_utf8();
    }
    if depth > 0 {
        None
    } else {
        Some((decode::string(&text[from..p]), p))
    }
}
fn title(text: &str, start: usize) -> Option<(String, usize)> {
    let blank_line = re!(r"^\n[ \t]*\n");
    let open = next(text, start).filter(|c| "\"'(".contains(*c))?;
    let close = if open == '(' { ')' } else { open };
    let mut p = start + 1;
    while p < text.len() {
        let c = next(text, p)?;
        if c == '\\' && punctuation(next(text, p + 1)) {
            p += 2;
            continue;
        }
        if c == close {
            return Some((decode::string(&text[start + 1..p]), p + 1));
        }
        if open == '(' && c == '(' || c == '\n' && blank_line.is_match(&text[p..]) {
            return None;
        }
        p += c.len_utf8();
    }
    None
}
fn contains_link(nodes: &[Node]) -> bool {
    nodes
        .iter()
        .any(|n| n.kind == "link" || n.kind == "linkReference" || contains_link(&n.children))
}
pub(super) fn read(
    source: &Source,
    start: usize,
    context: &Context,
    depth: usize,
) -> Option<(Node, usize)> {
    let text = &source.text;
    let image = next(text, start) == Some('!');
    let open = start + usize::from(image);
    if next(text, open) != Some('[') || context.in_link && !image {
        return None;
    }
    let close = bracket_end(text, open, context)?;
    let label = &text[open + 1..close];
    let mut end = close + 1;
    let mut url = None;
    let mut found_title = None;
    if next(text, end) == Some('(') {
        let p = skip_ws(text, end + 1);
        if let Some((destination, to)) = destination(text, p) {
            let separated = next(text, to).is_some_and(|c| " \t\n".contains(c));
            let mut p = skip_ws(text, to);
            if separated {
                if let Some((value, to)) = title(text, p) {
                    found_title = Some(value);
                    p = to;
                }
            }
            p = skip_ws(text, p);
            if next(text, p) == Some(')') {
                url = Some(destination);
                end = p + 1;
            }
        }
    }
    let nested = Context {
        in_link: false,
        in_label: true,
        preserve_trailing: true,
        ..*context
    };
    if let Some(url) = url {
        let children = super::inline::read(&source.slice(open + 1, close), &nested, depth + 1);
        if !image && contains_link(&children) {
            return None;
        }
        let mut node = Node::new(
            if image { "image" } else { "link" },
            source.point(start),
            source.point(end),
        );
        node.url = url;
        node.title = found_title;
        if image {
            node.value = children.iter().map(Node::plain).collect()
        } else {
            node.children = children
        }
        return Some((node, end));
    }
    let mut identifier = label;
    if next(text, end) == Some('[') {
        if let Some(index) = text[end + 1..].find(']') {
            let ref_end = end + 1 + index;
            let value = &text[end + 1..ref_end];
            let mut has_bracket = false;
            let mut p = 0;
            while p < value.len() {
                let c = next(value, p)?;
                if c == '\\' && punctuation(next(value, p + 1)) {
                    p += 2;
                    continue;
                }
                if c == '[' || c == ']' {
                    has_bracket = true;
                    break;
                }
                p += c.len_utf8();
            }
            if !has_bracket {
                identifier = if value.is_empty() { label } else { value };
                end = ref_end + 1;
            }
        }
    }
    if identifier.encode_utf16().count() > 999
        || !context.references.contains(&decode::label(identifier))
    {
        return None;
    }
    if !image
        && contains_link(&super::inline::read(
            &source.slice(open + 1, close),
            &Context {
                in_label: true,
                ..*context
            },
            depth + 1,
        ))
    {
        return None;
    }
    Some((
        Node::text(
            if label.starts_with('^') && end == close + 1 {
                "footnoteReference"
            } else if image {
                "imageReference"
            } else {
                "linkReference"
            },
            &text[start..end],
            source.point(start),
            source.point(end),
        ),
        end,
    ))
}
fn angle(text: &str) -> Option<(usize, String)> {
    let m=re!(r"^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\x00-\x20]*)>|^<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)>").captures(text)?;
    Some((
        m.get(0)?.end(),
        m.get(1).or_else(|| m.get(2))?.as_str().into(),
    ))
}
pub(super) fn autolink(
    source: &Source,
    start: usize,
    context: &Context,
    literal_only: bool,
) -> Option<(Node, usize)> {
    if context.in_link {
        return None;
    }
    let tail = &source.text[start..];
    if !literal_only {
        if let Some((len, label)) = angle(tail) {
            let mut node = Node::new("link", source.point(start), source.point(start + len));
            node.url = if re!(r"^[A-Za-z][A-Za-z0-9+.-]*:").is_match(&label) {
                label.clone()
            } else {
                format!("mailto:{label}")
            };
            node.children.push(Node::text(
                "text",
                &label,
                source.point(start + 1),
                source.point(start + 1 + label.len()),
            ));
            return Some((node, start + len));
        }
    }
    if context.in_label {
        return None;
    }
    if source.text[..start]
        .chars()
        .next_back()
        .is_some_and(|c| re!(r"[\p{L}\p{N}_]").is_match(&c.to_string()))
    {
        return None;
    }
    let m = re!(r"^(?i-u:https?://|www\.)[^\s<>]+")
        .find(tail)
        .or_else(|| {
            re!(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*\.)[A-Za-z]{2,}")
                .find(tail)
        })?;
    let mut label = m
        .as_str()
        .trim_end_matches(['?', '!', '.', ',', ':', '*', '_', '~']);
    let opens = label.matches('(').count();
    let mut closes = label.matches(')').count();
    while closes > opens && label.ends_with(')') {
        label = &label[..label.len() - 1];
        closes -= 1
    }
    let label = re!(r"&[A-Za-z0-9]+;$").replace(label, "");
    if label.is_empty() {
        return None;
    }
    let end = start + label.len();
    let mut node = Node::new("link", source.point(start), source.point(end));
    node.url = if label.starts_with("www.") {
        format!("http://{label}")
    } else if label.contains("://") {
        label.to_string()
    } else {
        format!("mailto:{label}")
    };
    node.children.push(Node::text(
        "text",
        label.as_ref(),
        source.point(start),
        source.point(end),
    ));
    Some((node, end))
}
