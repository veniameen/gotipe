//! Link lines and image links of the Markdown writer: their labels, destinations and titles.
//! `link_line` and `link_destination` write what `linkLine` and `linkDestination` of
//! @gotipe/markdown write.
use gotipe_core::{AttrValue, Block};

/// A file or an embed is a link line to its address, labelled by its name or the address
/// itself; byte-identical to `linkLine` in @gotipe/markdown.
pub(super) fn link_line(block: &Block) -> String {
    let attr = |name: &str| match block.attrs.get(name) {
        Some(AttrValue::String(value)) => value.as_str(),
        _ => "",
    };
    let url = attr("url");
    let label = [attr("name"), attr("title"), url]
        .into_iter()
        .find(|value| !value.is_empty())
        .unwrap_or("");
    let label = label.replace("\r\n", " ").replace(['\r', '\n'], " ");
    format!("[{}]({})", escape_text(&label), link_destination(url))
}

/// `linkDestination` of @gotipe/markdown: the raw form when it is safe, `<...>` otherwise.
pub(super) fn link_destination(href: &str) -> String {
    if href.is_empty() {
        return "<>".into();
    }
    let mut depth = 0i64;
    let mut balanced = true;
    for c in href.chars() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                balanced &= depth >= 0;
            }
            _ => {}
        }
    }
    let plain =
        |c: char| !(js_space(c) || matches!(c, '<' | '>' | '\\') || c <= '\u{1f}' || c == '\u{7f}');
    if balanced && depth == 0 && href.chars().all(plain) {
        return escape_entities(href);
    }
    let mut inner = String::new();
    for c in href.chars() {
        if matches!(c, '\\' | '<' | '>') {
            inner.push('\\');
        }
        inner.push(c);
    }
    let inner = escape_entities(&inner)
        .replace("\r\n", "%0A")
        .replace(['\r', '\n'], "%0A");
    format!("<{inner}>")
}

/// JavaScript `\s`: the whitespace a raw link destination may not contain.
fn js_space(c: char) -> bool {
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

/// Escapes `&` that would start a character reference (`&amp;`, `&#38;`, `&#x26;`).
pub(super) fn escape_entities(text: &str) -> String {
    let mut result = String::new();
    for (index, c) in text.char_indices() {
        if c == '&' && starts_reference(&text[index + 1..]) {
            result.push('\\');
        }
        result.push(c);
    }
    result
}

fn starts_reference(rest: &str) -> bool {
    let bytes = rest.as_bytes();
    let run = |from: usize, accept: fn(&u8) -> bool| {
        bytes[from.min(bytes.len())..]
            .iter()
            .take_while(|b| accept(b))
            .count()
    };
    let (start, length, bounds) = match bytes {
        [b'#', b'x' | b'X', ..] => (2, run(2, u8::is_ascii_hexdigit), 1..=6),
        [b'#', ..] => (1, run(1, u8::is_ascii_digit), 1..=7),
        [first, ..] if first.is_ascii_alphabetic() => {
            (0, run(0, u8::is_ascii_alphanumeric), 2..=32)
        }
        _ => return false,
    };
    bounds.contains(&length) && bytes.get(start + length) == Some(&b';')
}

pub(super) fn title_suffix(title: &str) -> String {
    if title.is_empty() {
        String::new()
    } else {
        format!(
            " \"{}\"",
            title
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('&', "\\&")
        )
    }
}
pub(super) fn destination(url: &str) -> String {
    url.replace('\\', "\\\\")
        .replace('<', "\\<")
        .replace('>', "\\>")
        .replace('&', "\\&")
        .replace('\n', "%0A")
        .replace('\r', "%0D")
}
pub(super) fn escape_text(text: &str) -> String {
    let mut result = String::new();
    for c in text.chars() {
        if "\\`*_[]<>#!~&".contains(c) {
            result.push('\\')
        };
        result.push(c)
    }
    result
}
