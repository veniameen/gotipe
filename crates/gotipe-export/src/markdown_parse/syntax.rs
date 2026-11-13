use super::source::{width, Line};
#[derive(Clone, Debug)]
pub(super) struct Marker {
    pub ordered: bool,
    pub marker: char,
    pub start: usize,
    pub prefix: usize,
    pub indent: usize,
    pub marker_width: usize,
    pub content: String,
}
pub(super) fn list_marker(text: &str, column: usize) -> Option<Marker> {
    let m = re!(r"^( {0,3})([*+-]|[0-9]{1,9}[.)])([ \t]+|$)(.*)$").captures(text)?;
    let marker = &m[2];
    let before = m[1].len() + marker.len();
    let padding = width(&format!("{}{}", " ".repeat(before), &m[3]), column) - before;
    let used = if padding > 4 {
        m[3].len().min(1)
    } else {
        m[3].len()
    };
    let prefix = before + used;
    Some(Marker {
        ordered: marker.len() > 1,
        marker: marker.chars().last()?,
        start: if marker.len() > 1 {
            marker[..marker.len() - 1].parse().ok()?
        } else {
            1
        },
        prefix,
        indent: before
            + if padding > 4 || padding == 0 {
                1
            } else {
                padding
            },
        marker_width: before,
        content: text[prefix..].into(),
    })
}
pub(super) fn thematic(text: &str) -> bool {
    re!(r"^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$").is_match(text)
}
pub(super) fn atx(text: &str) -> Option<regex::Captures<'_>> {
    re!(r"^ {0,3}(#{1,6})(?:[ \t]+(.*)|$)").captures(text)
}
pub(super) fn fence(text: &str) -> Option<regex::Captures<'_>> {
    re!(r"^ {0,3}(`{3,}|~{3,})([^\n]*)$").captures(text)
}
/// A line of its own `$$` opens or closes a math block; it does not interrupt a paragraph.
pub(super) fn math_fence(text: &str) -> bool {
    re!(r"^ {0,3}\$\$[ \t]*$").is_match(text)
}
pub(super) fn quote(text: &str) -> usize {
    re!(r"^ {0,3}>[ \t]?").find(text).map_or(0, |m| m.end())
}
#[derive(Clone)]
pub(super) enum HtmlEnd {
    Blank,
    Literal(String, bool),
}
impl HtmlEnd {
    pub fn done(&self, text: &str) -> bool {
        match self {
            Self::Blank => text.trim().is_empty(),
            Self::Literal(end, true) => text.to_lowercase().contains(end),
            Self::Literal(end, false) => text.contains(end),
        }
    }
}
pub(super) fn html_block(text: &str, interrupt: bool) -> Option<HtmlEnd> {
    let text = text
        .strip_prefix("   ")
        .or_else(|| text.strip_prefix("  "))
        .or_else(|| text.strip_prefix(' '))
        .unwrap_or(text);
    for (start, end) in [("<!--", "-->"), ("<?", "?>"), ("<![CDATA[", "]]>")] {
        if text.starts_with(start) {
            return Some(HtmlEnd::Literal(end.into(), false));
        }
    }
    if re!(r"^<![A-Z]").is_match(text) {
        return Some(HtmlEnd::Literal(">".into(), false));
    }
    if let Some(m) = re!(r"(?i-u)^<(script|pre|style|textarea)(?:[ \t>]|$)").captures(text) {
        return Some(HtmlEnd::Literal(
            format!("</{}>", m[1].to_lowercase()),
            true,
        ));
    }
    if re!(r"(?i-u)^</?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[ \t/>]|$)").is_match(text){return Some(HtmlEnd::Blank)}
    if !interrupt && inline_html(text).is_some_and(|n| text[n..].trim().is_empty()) {
        return Some(HtmlEnd::Blank);
    }
    None
}
pub(super) fn inline_html(text: &str) -> Option<usize> {
    re!(r#"^(?:<!--(?:>|->|[\s\S]*?-->)|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![A-Z][^>]*>|</[A-Za-z][A-Za-z0-9-]*\s*>|<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*/?>)"#).find(text).map(|m|m.end())
}
pub(super) fn interrupts(line: &Line) -> bool {
    let text = &line.text;
    atx(text).is_some()
        || thematic(text)
        || quote(text) > 0
        || fence(text).is_some_and(|m| !m[1].starts_with('`') || !m[2].contains('`'))
        || list_marker(text, 0)
            .is_some_and(|m| !m.content.trim().is_empty() && (!m.ordered || m.start == 1))
        || html_block(text, true).is_some()
}
