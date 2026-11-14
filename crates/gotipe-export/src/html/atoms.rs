//! Inline atoms (docs/development/inline-atoms.md): one atom — the longest run of spans
//! with equal atomic marks — is one element. Byte-identical to `atomHtml` in
//! `packages/core/src/serialization/html.ts`.
use gotipe_core::{AttrValue, Mark, TextSpan};

use super::{js, safety, safety::escape, span_html, wrap_marks};

const ATOMS: [&str; 4] = ["mention", "inlineMath", "customEmoji", "inlineImage"];

fn is_atom(mark: &Mark) -> bool {
    ATOMS.contains(&mark.mark_type.as_str())
}

/// The built-in atomic marks of a span, in order.
pub(super) fn atom_marks(span: &TextSpan) -> Vec<&Mark> {
    span.marks.iter().filter(|mark| is_atom(mark)).collect()
}

/// Positive integers up to 10000: the only image sizes written into HTML.
fn size(name: &str, value: Option<&AttrValue>) -> String {
    match value {
        Some(AttrValue::Number(value))
            if js::is_integer(*value) && *value > 0.0 && *value <= 10000.0 =>
        {
            format!(" {name}=\"{}\"", js::number_to_string(*value))
        }
        _ => String::new(),
    }
}

/// The element of one atom: `inner` is the HTML of its text, `text` the plain fallback.
/// `None` when its attributes are not valid: the text stays.
fn atom_element(mark: &Mark, inner: &str, text: &str) -> Option<String> {
    let attr = |name: &str| mark.attrs.get(name);
    match mark.mark_type.as_str() {
        "inlineMath" => return Some(format!("<span data-type=\"math\">{inner}</span>")),
        "mention" => {
            let Some(AttrValue::String(id)) = attr("id").filter(|id| js::truthy(Some(id))) else {
                return None;
            };
            let label = match attr("label") {
                Some(AttrValue::String(label)) => format!(" data-label=\"{}\"", escape(label)),
                _ => String::new(),
            };
            let kind = match attr("kind") {
                Some(AttrValue::String(kind)) if kind == "page" => "page",
                _ => "user",
            };
            return Some(format!(
                "<span data-type=\"mention\" data-kind=\"{kind}\" data-id=\"{}\"{label}>{inner}</span>",
                escape(id)
            ));
        }
        _ => {}
    }
    let src = escape(&safety::safe_image_src(&js::string_or(attr("src"), ""))?);
    if mark.mark_type == "customEmoji" {
        return Some(format!(
            "<img data-type=\"emoji\" alt=\"{}\" src=\"{src}\">",
            escape(text)
        ));
    }
    let alt = match attr("alt") {
        Some(AttrValue::String(alt)) => escape(alt),
        _ => escape(text),
    };
    Some(format!(
        "<img src=\"{src}\" alt=\"{alt}\"{}{}>",
        size("width", attr("width")),
        size("height", attr("height"))
    ))
}

/// The spans of one atom as one element. Marks every span of it has wrap the element; the
/// others stay inside it.
pub(super) fn atom_html(group: &[TextSpan], mark: &Mark) -> String {
    let common: Vec<&Mark> = group[0]
        .marks
        .iter()
        .filter(|item| !is_atom(item) && group.iter().all(|span| span.marks.contains(item)))
        .collect();
    let inner: String = group
        .iter()
        .map(|span| {
            let marks: Vec<&Mark> = span
                .marks
                .iter()
                .filter(|item| !is_atom(item) && !common.contains(item))
                .collect();
            span_html(span, &marks)
        })
        .collect();
    let text: String = group.iter().map(|span| span.text.as_str()).collect();
    match atom_element(mark, &inner, &text) {
        Some(element) => wrap_marks(element, &common),
        None => group
            .iter()
            .map(|span| span_html(span, &span.marks.iter().collect::<Vec<_>>()))
            .collect(),
    }
}
