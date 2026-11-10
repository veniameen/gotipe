use gotipe_core::{AttrValue, Block, BlockContent, Document, Mark, TextSpan};

use crate::{ConvertError, ExportOptions};

/// Convert a Document to HTML
pub fn to_html(doc: &Document, _options: &ExportOptions) -> Result<String, ConvertError> {
    let mut html = String::new();
    for block in &doc.blocks {
        html.push_str(&block_to_html(block)?);
    }
    Ok(html)
}

fn block_to_html(block: &Block) -> Result<String, ConvertError> {
    let content = content_to_html(&block.content);
    let nested = block
        .children
        .iter()
        .map(block_to_html)
        .collect::<Result<String, _>>()?;
    let attr = |name: &str| match block.attrs.get(name) {
        Some(AttrValue::String(value)) => value.as_str(),
        _ => "",
    };
    let number = |name: &str, fallback: usize| match block.attrs.get(name) {
        Some(AttrValue::Number(value)) if value.is_finite() && *value >= 0.0 => *value as usize,
        _ => fallback,
    };
    Ok(match block.block_type.as_str() {
        "paragraph" => format!("<p>{content}</p>\n{nested}"),
        "heading" => {
            let level = number("level", 1).clamp(1, 6);
            format!("<h{level}>{content}</h{level}>\n{nested}")
        }
        "bulletList" | "orderedList" | "todoList" => {
            let mut items = String::new();
            for child in &block.children {
                let body = content_to_html(&child.content);
                let children = child
                    .children
                    .iter()
                    .map(block_to_html)
                    .collect::<Result<String, _>>()?;
                let checkbox = if block.block_type == "todoList" {
                    format!(
                        "<input type=\"checkbox\" disabled{} />",
                        if matches!(child.attrs.get("checked"), Some(AttrValue::Bool(true))) {
                            " checked"
                        } else {
                            ""
                        }
                    )
                } else {
                    String::new()
                };
                items.push_str(&format!("<li>{checkbox}{body}{children}</li>\n"));
            }
            if block.block_type == "orderedList" {
                format!(
                    "<ol start=\"{}\">\n{items}</ol>\n",
                    number("start", 1).max(1)
                )
            } else {
                format!("<ul>\n{items}</ul>\n")
            }
        }
        "listItem" | "todoItem" => format!("<li>{content}{nested}</li>\n"),
        "codeBlock" => format!(
            "<pre><code class=\"language-{}\">{content}</code></pre>\n{nested}",
            html_escape(attr("language"))
        ),
        "blockquote" => format!("<blockquote>{content}{nested}</blockquote>\n"),
        "divider" => "<hr />\n".into(),
        "image" => {
            let src = attr("src");
            if !crate::safe_url(src) || src.trim().to_ascii_lowercase().starts_with("mailto:") {
                return Err(ConvertError::ImageError(
                    "Image requires a safe resolved URL".into(),
                ));
            }
            format!(
                "<img src=\"{}\" alt=\"{}\" />\n{nested}",
                html_escape(src),
                html_escape(attr("alt"))
            )
        }
        "callout" => format!(
            "<aside class=\"gotipe-callout\"><span>{}</span>{content}{nested}</aside>\n",
            html_escape(attr("emoji"))
        ),
        "table" => format!("<table>\n{nested}</table>\n"),
        "tableRow" => format!("<tr>{nested}</tr>\n"),
        "tableCell" | "tableHeader" => {
            let tag = if block.block_type == "tableHeader" {
                "th"
            } else {
                "td"
            };
            format!(
                "<{tag} colspan=\"{}\" rowspan=\"{}\">{content}{nested}</{tag}>",
                number("colspan", 1).clamp(1, 1000),
                number("rowspan", 1).clamp(1, 1000)
            )
        }
        "toggle" => format!("<details><summary>{content}</summary>{nested}</details>\n"),
        "math" | "markdownRaw" => format!("<pre class=\"gotipe-raw\">{content}</pre>\n{nested}"),
        "embed" | "file" => {
            let url = attr("url");
            if !crate::safe_url(url) {
                return Err(ConvertError::Encoding("Unsafe attachment URL".into()));
            }
            let label = if attr("name").is_empty() {
                url
            } else {
                attr("name")
            };
            format!(
                "<p><a href=\"{}\" rel=\"noopener noreferrer\">{}</a></p>\n{nested}",
                html_escape(url),
                html_escape(label)
            )
        }
        "columns" | "column" => format!(
            "<div class=\"gotipe-{}\">{content}{nested}</div>\n",
            block.block_type
        ),
        _ => format!(
            "<div data-block-type=\"{}\">{content}{nested}</div>\n",
            html_escape(&block.block_type)
        ),
    })
}

fn content_to_html(content: &BlockContent) -> String {
    match content {
        BlockContent::RichText(spans) => spans_to_html(spans),
        BlockContent::Raw(s) => html_escape(s),
        BlockContent::Empty => String::new(),
    }
}

fn spans_to_html(spans: &[TextSpan]) -> String {
    let mut html = String::new();
    for span in spans {
        let text = html_escape(&span.text);
        if span.marks.is_empty() {
            html.push_str(&text);
        } else {
            let mut wrapped = text;
            // Sort marks by rank (in a real impl we'd look up MarkSpec)
            for mark in &span.marks {
                wrapped = wrap_mark(&wrapped, mark);
            }
            html.push_str(&wrapped);
        }
    }
    html
}

fn wrap_mark(text: &str, mark: &Mark) -> String {
    match mark.mark_type.as_str() {
        "bold" => format!("<strong>{text}</strong>"),
        "italic" => format!("<em>{text}</em>"),
        "underline" => format!("<u>{text}</u>"),
        "strikethrough" => format!("<s>{text}</s>"),
        "code" => format!("<code>{text}</code>"),
        "link" => {
            let href = match mark.attrs.get("href") {
                Some(AttrValue::String(s)) if crate::safe_url(s) => html_escape(s),
                _ => "#".into(),
            };
            let target: String = match mark.attrs.get("target") {
                Some(AttrValue::String(s)) if s == "_self" => "_self".into(),
                _ => "_blank".into(),
            };
            format!("<a href=\"{href}\" target=\"{target}\" rel=\"noopener noreferrer\">{text}</a>")
        }
        "highlight" => {
            let color = match mark.attrs.get("color") {
                Some(AttrValue::String(s)) if safe_color(s) => s.as_str(),
                _ => "yellow",
            };
            format!("<mark style=\"background-color: {color}\">{text}</mark>")
        }
        "textColor" => match mark.attrs.get("color") {
            Some(AttrValue::String(color)) if safe_color(color) => {
                format!("<span style=\"color: {color}\">{text}</span>")
            }
            _ => text.to_owned(),
        },
        "superscript" => format!("<sup>{text}</sup>"),
        "subscript" => format!("<sub>{text}</sub>"),
        _ => text.to_string(),
    }
}

pub(crate) fn safe_color(value: &str) -> bool {
    if !value.is_empty() && value.bytes().all(|c| c.is_ascii_alphabetic()) {
        return true;
    }
    if let Some(hex) = value.strip_prefix('#') {
        return (3..=8).contains(&hex.len()) && hex.bytes().all(|c| c.is_ascii_hexdigit());
    }
    let Some((name, arguments)) = value.split_once('(') else {
        return false;
    };
    let Some(arguments) = arguments.strip_suffix(')') else {
        return false;
    };
    ["rgb", "rgba", "hsl", "hsla"]
        .iter()
        .any(|candidate| name.eq_ignore_ascii_case(candidate))
        && !arguments.is_empty()
        && arguments
            .bytes()
            .all(|c| c.is_ascii_digit() || b".% ,/+-".contains(&c))
}

fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// HTML sanitizer using ammonia
pub struct HtmlSanitizer;

impl HtmlSanitizer {
    /// Strict sanitization — only allows safe HTML tags and attributes
    pub fn strict() -> ammonia::Builder<'static> {
        let mut builder = ammonia::Builder::default();
        builder
            .add_tags(&[
                "p",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "ul",
                "ol",
                "li",
                "a",
                "strong",
                "em",
                "u",
                "s",
                "code",
                "pre",
                "blockquote",
                "hr",
                "br",
                "img",
                "table",
                "tr",
                "td",
                "th",
                "thead",
                "tbody",
                "mark",
                "sup",
                "sub",
                "details",
                "summary",
                "div",
                "span",
            ])
            .add_tag_attributes("a", &["href", "target"])
            .add_tag_attributes("img", &["src", "alt", "width", "height"])
            .add_tag_attributes("td", &["colspan", "rowspan"])
            .add_tag_attributes("th", &["colspan", "rowspan"])
            .add_tag_attributes("ol", &["start"])
            .add_tag_attributes("code", &["class"])
            .add_tag_attributes("mark", &["style"])
            .add_tag_attributes("div", &["class"])
            .add_tag_attributes("span", &["class"])
            .url_schemes(std::collections::HashSet::from(["http", "https", "mailto"]))
            .link_rel(Some("noopener noreferrer"));
        builder
    }

    /// Sanitize HTML string
    pub fn sanitize(html: &str) -> String {
        Self::strict().clean(html).to_string()
    }

    /// Validate a URI (only http, https, mailto allowed)
    pub fn validate_uri(uri: &str) -> bool {
        let uri_lower = uri.trim().to_lowercase();
        uri_lower.starts_with("http://")
            || uri_lower.starts_with("https://")
            || uri_lower.starts_with("mailto:")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gotipe_core::BlockId;
    use std::collections::HashMap;

    fn make_paragraph(text: &str) -> Block {
        Block {
            id: BlockId::new(),
            block_type: "paragraph".into(),
            attrs: HashMap::new(),
            content: BlockContent::RichText(vec![TextSpan {
                text: text.into(),
                marks: vec![],
            }]),
            children: vec![],
        }
    }

    #[test]
    fn test_paragraph_to_html() {
        let doc = Document {
            blocks: vec![make_paragraph("Hello World")],
            version: 0,
        };
        let html = to_html(&doc, &ExportOptions::default()).unwrap();
        assert_eq!(html, "<p>Hello World</p>\n");
    }

    #[test]
    fn test_bold_mark_to_html() {
        let doc = Document {
            blocks: vec![Block {
                id: BlockId::new(),
                block_type: "paragraph".into(),
                attrs: HashMap::new(),
                content: BlockContent::RichText(vec![TextSpan {
                    text: "Bold".into(),
                    marks: vec![Mark::new("bold")],
                }]),
                children: vec![],
            }],
            version: 0,
        };
        let html = to_html(&doc, &ExportOptions::default()).unwrap();
        assert!(html.contains("<strong>Bold</strong>"));
    }

    #[test]
    fn test_html_escape() {
        assert_eq!(html_escape("<script>"), "&lt;script&gt;");
    }

    #[test]
    fn text_colors_preserve_inert_css_without_allowing_declarations() {
        for color in [
            "#ab4",
            "#aabbccdd",
            "rebeccapurple",
            "RGB(12 34 56 / 50%)",
            "hsl(40, 50%, 60%)",
        ] {
            let mut mark = Mark::new("textColor");
            mark.attrs
                .insert("color".into(), AttrValue::String(color.into()));
            assert_eq!(
                wrap_mark("color", &mark),
                format!("<span style=\"color: {color}\">color</span>")
            );
        }
        for color in [
            "",
            "red;background:url(x)",
            "url(x)",
            "var(--x)",
            "rgb(1)\" onclick=\"x",
            "rgb(1\\32 3)",
        ] {
            assert!(!safe_color(color), "unsafe color {color:?}");
            let mut mark = Mark::new("textColor");
            mark.attrs
                .insert("color".into(), AttrValue::String(color.into()));
            assert_eq!(wrap_mark("color", &mark), "color");
        }
    }

    #[test]
    fn test_sanitizer_blocks_script() {
        let result = HtmlSanitizer::sanitize("<script>alert('xss')</script>");
        assert!(!result.contains("<script>"));
    }

    #[test]
    fn test_sanitizer_blocks_javascript_uri() {
        let result = HtmlSanitizer::sanitize("<a href=\"javascript:alert(1)\">click</a>");
        assert!(!result.contains("javascript:"));
    }

    #[test]
    fn test_validate_uri() {
        assert!(HtmlSanitizer::validate_uri("https://example.com"));
        assert!(HtmlSanitizer::validate_uri("http://example.com"));
        assert!(HtmlSanitizer::validate_uri("mailto:test@example.com"));
        assert!(!HtmlSanitizer::validate_uri("javascript:alert(1)"));
        assert!(!HtmlSanitizer::validate_uri("data:text/html,<h1>Hi</h1>"));
    }
}
