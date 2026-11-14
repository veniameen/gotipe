//! Inline atoms (docs/development/inline-atoms.md): a mention, an inline formula, a custom
//! emoji and an inline image are text with an atomic mark. The rules here are shared by the
//! reader and the writer; `packages/markdown/src/atoms.ts` is the TypeScript copy and both
//! check `tests/fixtures/markdown-atoms.json`.
use gotipe_core::{AttrValue, Block, BlockContent, Mark, Schema};
use std::collections::{BTreeMap, HashMap};

/// Inline atoms a reader may produce. Each one is off unless asked for, so a document only
/// gets the marks its schema declares.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MarkdownAtoms {
    /// `[@Анна](mention:user-42)` is text with a `mention` mark (`id`, `kind`, `label`).
    pub mention: bool,
    /// `$x^2$` is the TeX source with an `inlineMath` mark.
    pub inline_math: bool,
    /// `![alt](src)` among other inline content is the alt text with an `inlineImage` mark.
    pub inline_image: bool,
    /// Registered names and their image addresses: `:name:` is text with a `customEmoji` mark.
    pub custom_emoji: BTreeMap<String, String>,
}

impl MarkdownAtoms {
    /// The atoms `schema` declares as atomic marks. Custom emoji need a registry of names,
    /// which a schema does not hold.
    pub fn from_schema(schema: &Schema) -> Self {
        Self {
            mention: schema.is_atomic("mention"),
            inline_math: schema.is_atomic("inlineMath"),
            inline_image: schema.is_atomic("inlineImage"),
            custom_emoji: BTreeMap::new(),
        }
    }
}

pub(crate) const TYPES: [&str; 4] = ["mention", "inlineMath", "customEmoji", "inlineImage"];

fn space(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t' | b'\n' | b'\r')
}

/// The byte index of the `$` closing the formula that `text[open]` opens (pandoc's rule).
/// The opening `$` is followed by a character that is neither whitespace nor `$`; the first
/// `$` after it on the same line that no backslash precedes must follow a non-whitespace
/// character and must not be followed by a digit. So `$5 and $6` and `$a$5` are text.
pub(crate) fn math_end(text: &str, open: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let first = *bytes.get(open + 1)?;
    if first == b'$' || space(first) {
        return None;
    }
    let mut p = open + 1;
    while p < bytes.len() {
        match bytes[p] {
            // a line ending ends the line: "\r" too, which the writer would write as one (D-94)
            b'\n' | b'\r' => return None,
            // The escaped character is skipped; a byte inside a longer one is never `$`.
            b'\\' if bytes.get(p + 1) != Some(&b'\n') => p += 1,
            b'$' => {
                let digit = bytes.get(p + 1).is_some_and(u8::is_ascii_digit);
                return (!space(bytes[p - 1]) && !digit).then_some(p);
            }
            _ => {}
        }
        p += 1;
    }
    None
}

/// TeX that `$…$` carries unchanged.
pub(crate) fn math_writable(tex: &str) -> bool {
    math_end(&format!("${tex}$"), 0) == Some(tex.len() + 1)
}

/// The name between the colons of `:name:`: `[A-Za-z0-9_+-]+`.
pub(crate) fn emoji_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'+' | b'-'))
}

/// The length of a registered `:name:` that `text[p]` opens. No letter or digit may touch
/// it on either side (`10:30:45` is a time) and it is never part of an address
/// (`https://a.test/:party:`). `emojiEnd` in packages/markdown/src/atoms.ts is the same rule.
pub(crate) fn emoji_at(text: &str, p: usize, registry: &BTreeMap<String, String>) -> Option<usize> {
    let bytes = text.as_bytes();
    if p > 0 && bytes[p - 1].is_ascii_alphanumeric() {
        return None;
    }
    let rest = text[p..].strip_prefix(':')?;
    let name = &rest[..rest.find(':')?];
    if !emoji_name(name) || !registry.contains_key(name) {
        return None;
    }
    let end = p + name.len() + 2;
    if bytes.get(end).is_some_and(u8::is_ascii_alphanumeric) {
        return None;
    }
    let word = text[..p]
        .rfind([' ', '\t', '\n', '\r', '\x0c', '\x0b'])
        .map_or(0, |at| at + 1);
    (!url_word(&text[word..p])).then_some(name.len() + 2)
}

/// Whether a word holds the start of an address: a scheme and `://`, or `www.`.
fn url_word(word: &str) -> bool {
    let bytes = word.as_bytes();
    word.contains("www.")
        || word.match_indices("://").any(|(at, _)| {
            let scheme = &bytes[..at];
            let start = scheme
                .iter()
                .rposition(|b| !(b.is_ascii_alphanumeric() || matches!(b, b'+' | b'.' | b'-')))
                .map_or(0, |i| i + 1);
            scheme[start..].iter().any(u8::is_ascii_alphabetic)
        })
}

/// `mention:user-42`: the kind and the percent-decoded id, or `None` for any other address.
pub(crate) fn mention_of(url: &str) -> Option<(&'static str, String)> {
    let rest = url.strip_prefix("mention:")?;
    let (kind, encoded) = if let Some(id) = rest.strip_prefix("user-") {
        ("user", id)
    } else {
        ("page", rest.strip_prefix("page-")?)
    };
    if encoded.is_empty() {
        return None;
    }
    let bytes = encoded.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut p = 0;
    while p < bytes.len() {
        if bytes[p] == b'%' {
            let hex = std::str::from_utf8(bytes.get(p + 1..p + 3)?).ok()?;
            if !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
                return None;
            }
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            p += 3;
        } else {
            decoded.push(bytes[p]);
            p += 1;
        }
    }
    Some((kind, String::from_utf8(decoded).ok()?))
}

fn text_attr<'a>(attrs: &'a HashMap<String, AttrValue>, name: &str) -> Option<&'a str> {
    match attrs.get(name) {
        Some(AttrValue::String(value)) => Some(value),
        _ => None,
    }
}

/// `page` only when the mark says so; a mention is of a user otherwise.
pub(crate) fn mention_kind(mark: &Mark) -> &'static str {
    if text_attr(&mark.attrs, "kind") == Some("page") {
        "page"
    } else {
        "user"
    }
}

/// The address of a mention; every byte of the id outside `A-Za-z0-9-._~` is `%XX`.
pub(crate) fn mention_href(mark: &Mark) -> Option<String> {
    let id = text_attr(&mark.attrs, "id").filter(|id| !id.is_empty())?;
    let mut href = format!("mention:{}-", mention_kind(mark));
    for byte in id.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            href.push(byte as char);
        } else {
            href.push_str(&format!("%{byte:02X}"));
        }
    }
    Some(href)
}

/// The label a mention's text stands for: a user's text without its leading `@`.
pub(crate) fn mention_label<'a>(kind: &str, text: &'a str) -> &'a str {
    if kind == "page" {
        text
    } else {
        text.strip_prefix('@').unwrap_or(text)
    }
}

/// The text of an inline image: its alt, else the file name of its address, else `image`.
pub(crate) fn image_text(src: &str, alt: &str) -> String {
    if !alt.is_empty() {
        return alt.into();
    }
    if src
        .get(..5)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("data:"))
    {
        return "image".into();
    }
    let path = src.split(['?', '#']).next().unwrap_or("");
    match path.rsplit('/').next() {
        Some(name) if !name.is_empty() => name.into(),
        _ => "image".into(),
    }
}

pub(crate) fn attr<'a>(mark: &'a Mark, name: &str) -> Option<&'a str> {
    text_attr(&mark.attrs, name)
}

/// Gives every atom the reader made its final `key`: "1", "2", … in document order (blocks
/// depth-first, spans left to right), so no two atoms of a document are equal. `numberAtoms`
/// in packages/markdown/src/atoms.ts numbers the same way.
pub(crate) fn number_atoms(blocks: &mut [Block], next: &mut usize) {
    for block in blocks {
        if let BlockContent::RichText(spans) = &mut block.content {
            let mut previous: Vec<Mark> = Vec::new();
            let mut key = String::new();
            for span in spans.iter_mut() {
                let atoms: Vec<Mark> = span
                    .marks
                    .iter()
                    .filter(|mark| TYPES.contains(&mark.mark_type.as_str()))
                    .cloned()
                    .collect();
                if atoms.is_empty() {
                    previous.clear();
                    continue;
                }
                if atoms != previous {
                    *next += 1;
                    key = next.to_string();
                }
                previous = atoms;
                for mark in &mut span.marks {
                    if TYPES.contains(&mark.mark_type.as_str()) {
                        mark.attrs
                            .insert("key".into(), AttrValue::String(key.clone()));
                    }
                }
            }
        }
        number_atoms(&mut block.children, next);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_formula_rule_is_pandocs() {
        for (text, end) in [
            ("$x^2$", Some(4)),
            ("$\\frac{a}{b}$,", Some(12)),
            ("$a \\$ b$", Some(7)),
            ("$Ж😀$", Some(7)),
            ("$5 and $6", None),
            ("$a$5", None),
            ("$ x$", None),
            ("$x $", None),
            ("$$x$", None),
            ("$x\ny$", None),
            ("$x\\$", None),
            ("$x\\\ny$", None),
            ("$", None),
            ("$x", None),
        ] {
            assert_eq!(math_end(text, 0), end, "{text:?}");
        }
        assert!(math_writable("x^2") && math_writable("a \\$ b"));
        for tex in ["", " x", "x ", "a$b", "x\\", "a\nb", "$"] {
            assert!(!math_writable(tex), "{tex:?}");
        }
    }

    #[test]
    fn mention_addresses_round_trip_and_reject_anything_else() {
        let mark = |id: &str, kind: &str| {
            Mark::new("mention")
                .with_attr("id", AttrValue::String(id.into()))
                .with_attr("kind", AttrValue::String(kind.into()))
        };
        for (id, kind, href) in [
            ("42", "user", "mention:user-42"),
            ("p/7 ж", "page", "mention:page-p%2F7%20%D0%B6"),
            ("a!*'()~._-", "robot", "mention:user-a%21%2A%27%28%29~._-"),
            ("😀%", "user", "mention:user-%F0%9F%98%80%25"),
        ] {
            assert_eq!(mention_href(&mark(id, kind)).as_deref(), Some(href));
            let kind = if kind == "page" { "page" } else { "user" };
            assert_eq!(mention_of(href), Some((kind, id.to_owned())));
        }
        assert_eq!(mention_href(&mark("", "user")), None);
        assert_eq!(mention_href(&Mark::new("mention")), None);
        assert_eq!(
            mention_of("mention:user-ж(1)"),
            Some(("user", "ж(1)".into()))
        );
        for other in [
            "mention:robot-1",
            "mention:user-",
            "mention:user-%ZZ",
            "mention:user-%4",
            "mention:user-%FF",
            "mention:user-%ED%A0%80",
            "Mention:user-1",
            "mention:42",
            "https://a.test/mention:user-1",
        ] {
            assert_eq!(mention_of(other), None, "{other}");
        }
    }

    #[test]
    fn emoji_names_and_image_fallbacks() {
        let registry: BTreeMap<String, String> = [
            ("party".to_owned(), "p.png".to_owned()),
            ("+1".to_owned(), "u.png".to_owned()),
        ]
        .into();
        assert_eq!(emoji_at(":party: x", 0, &registry), Some(7));
        assert_eq!(emoji_at(":+1:", 0, &registry), Some(4));
        assert_eq!(emoji_at("ж :party:, ok", 3, &registry), Some(7));
        for text in [":unknown:", ":party", "::", ":par ty:", "party:", ":пати:"] {
            assert_eq!(emoji_at(text, 0, &registry), None, "{text}");
        }
        for (text, p) in [
            ("a:party:", 1),
            (":party:b", 0),
            ("https://a.test/:party:", 15),
            ("(www.a.test/:party:)", 12),
        ] {
            assert_eq!(emoji_at(text, p, &registry), None, "{text}");
        }
        for (src, alt, text) in [
            ("a.png", "Схема", "Схема"),
            ("https://a.test/dir/d.png?x=1#y", "", "d.png"),
            ("DATA:image/png;base64,AAAA", "", "image"),
            ("https://a.test/", "", "image"),
            ("", "", "image"),
            ("файл 😀.png", "", "файл 😀.png"),
        ] {
            assert_eq!(image_text(src, alt), text, "{src}");
        }
    }
}
