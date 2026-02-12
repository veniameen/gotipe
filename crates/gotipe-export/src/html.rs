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
    match block.block_type.as_str() {
        "paragraph" => {
            let content = content_to_html(&block.content);
            Ok(format!("<p>{content}</p>\n"))
        }
        "heading" => {
            let level = match block.attrs.get("level") {
                Some(AttrValue::Number(n)) => *n as u32,
                _ => 1,
            };
            let level = level.clamp(1, 6);
            let content = content_to_html(&block.content);
            Ok(format!("<h{level}>{content}</h{level}>\n"))
        }
        "bulletList" => {
            let mut items = String::new();
            for child in &block.children {
                items.push_str(&format!("<li>{}</li>\n", content_to_html(&child.content)));
            }
            Ok(format!("<ul>\n{items}</ul>\n"))
        }
        "orderedList" => {
            let start = match block.attrs.get("start") {
                Some(AttrValue::Number(n)) => *n as u32,
                _ => 1,
            };
            let mut items = String::new();
            for child in &block.children {
                items.push_str(&format!("<li>{}</li>\n", content_to_html(&child.content)));
            }
            Ok(format!("<ol start=\"{start}\">\n{items}</ol>\n"))
        }
        "codeBlock" => {
            let lang = match block.attrs.get("language") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "plain",
            };
            let content = content_to_html(&block.content);
            Ok(format!(
                "<pre><code class=\"language-{lang}\">{content}</code></pre>\n"
            ))
        }
        "blockquote" => {
            let content = content_to_html(&block.content);
            Ok(format!("<blockquote>{content}</blockquote>\n"))
        }
        "divider" => Ok("<hr />\n".into()),
        "image" => {
            let src = match block.attrs.get("src") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "",
            };
            let alt = match block.attrs.get("alt") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "",
            };
            let src = ammonia::clean(src);
            let alt = ammonia::clean(alt);
            Ok(format!("<img src=\"{src}\" alt=\"{alt}\" />\n"))
        }
        "callout" => {
            let emoji = match block.attrs.get("emoji") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "",
            };
            let content = content_to_html(&block.content);
            Ok(format!(
                "<div class=\"gotipe-callout\"><span class=\"gotipe-callout-emoji\">{emoji}</span>{content}</div>\n"
            ))
        }
        "table" => {
            let mut rows = String::new();
            for row in &block.children {
                let mut cells = String::new();
                for cell in &row.children {
                    let tag = if cell.block_type == "tableHeader" {
                        "th"
                    } else {
                        "td"
                    };
                    let content = content_to_html(&cell.content);
                    cells.push_str(&format!("<{tag}>{content}</{tag}>"));
                }
                rows.push_str(&format!("<tr>{cells}</tr>\n"));
            }
            Ok(format!("<table>\n{rows}</table>\n"))
        }
        "toggle" => {
            let content = content_to_html(&block.content);
            Ok(format!("<details><summary>{content}</summary></details>\n"))
        }
        "math" => {
            let content = content_to_html(&block.content);
            Ok(format!("<div class=\"gotipe-math\">{content}</div>\n"))
        }
        "embed" => {
            let url = match block.attrs.get("url") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "",
            };
            let url = ammonia::clean(url);
            Ok(format!(
                "<div class=\"gotipe-embed\"><iframe src=\"{url}\"></iframe></div>\n"
            ))
        }
        "file" => {
            let url = match block.attrs.get("url") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "",
            };
            let name = match block.attrs.get("name") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "file",
            };
            let url = ammonia::clean(url);
            let name = ammonia::clean(name);
            Ok(format!(
                "<div class=\"gotipe-file\"><a href=\"{url}\">{name}</a></div>\n"
            ))
        }
        "columns" => {
            let mut cols = String::new();
            for col in &block.children {
                let mut col_content = String::new();
                for child in &col.children {
                    col_content.push_str(&block_to_html(child)?);
                }
                cols.push_str(&format!("<div class=\"gotipe-column\">{col_content}</div>"));
            }
            Ok(format!("<div class=\"gotipe-columns\">{cols}</div>\n"))
        }
        _ => {
            // Generic fallback
            let content = content_to_html(&block.content);
            Ok(format!("<div>{content}</div>\n"))
        }
    }
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
                Some(AttrValue::String(s)) => ammonia::clean(s).to_string(),
                _ => "#".into(),
            };
            let target = match mark.attrs.get("target") {
                Some(AttrValue::String(s)) => s.clone(),
                _ => "_blank".into(),
            };
            format!("<a href=\"{href}\" target=\"{target}\" rel=\"noopener noreferrer\">{text}</a>")
        }
        "highlight" => {
            let color = match mark.attrs.get("color") {
                Some(AttrValue::String(s)) => s.as_str(),
                _ => "yellow",
            };
            format!("<mark style=\"background-color: {color}\">{text}</mark>")
        }
        "superscript" => format!("<sup>{text}</sup>"),
        "subscript" => format!("<sub>{text}</sub>"),
        _ => text.to_string(),
    }
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
